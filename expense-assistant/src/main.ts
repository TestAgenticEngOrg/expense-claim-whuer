import "./tracing.js"; // side effects: sets up the OTel provider before any model client exists
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import { config, ATTACHMENTS, missingRequiredEnv } from "./config.js";
import { initStore, ensureStore, isStoreReady, loadConversation, saveConversation } from "./store.js";
import { runTurn, genAiSystem } from "./agent.js";
import { traceTurn } from "./tracing.js";

const BODY_CAP = 24 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(text);
}

// Keep at most BODY_CAP. Past it, answer 413 ONCE and keep reading without
// keeping anything, so the client finishes sending and actually sees the 413
// — destroying the request or closing the socket mid-upload resets the
// connection and the caller gets a network error instead. Past twice the
// cap, stop draining and drop it. Resolves null when the request was
// refused.
function readBody(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    const refuse = () => { over = true; chunks.length = 0; sendJson(res, 413, { error: "request too large" }); };
    if (Number(req.headers["content-length"] ?? 0) > BODY_CAP) refuse();
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2 * BODY_CAP) { req.destroy(); return; }
      if (over) return;
      if (size > BODY_CAP) { refuse(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(over ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(null));
    req.on("close", () => { if (!req.complete) resolve(null); });
  });
}

type Attachment = { name: string; mediaType: string; data: string };

// The whole request vocabulary. A field outside it is refused, so a caller
// speaking a newer contract than this agent was built for hears so, instead
// of having the field silently ignored.
const BODY_FIELDS = new Set(["conversationId", "message", "attachments"]);

// agent.afm.md declares `x-aep.attachments.types: [image]` — a category, not
// a full media type. A bare entry with no "/" matches any subtype of it
// (`image` allows `image/jpeg`, `image/png`, ...); an entry with a "/" must
// match exactly.
function typeAllowed(mediaType: string, allowed: string[]): boolean {
  return allowed.some((t) => t === mediaType || (!t.includes("/") && mediaType.startsWith(`${t}/`)));
}

function validate(body: any): { conversationId?: string; message: string; attachments: Attachment[] } | { error: string } {
  const unknown = Object.keys(body ?? {}).find((key) => !BODY_FIELDS.has(key));
  if (unknown) return { error: `unknown field: ${unknown}` };
  const message = typeof body?.message === "string" ? body.message.trim() : null;
  const attachments: Attachment[] = Array.isArray(body?.attachments) ? body.attachments : [];
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : undefined;
  if (message === null) return { error: "expected { message: string }" };
  if (attachments.length > 0 && !ATTACHMENTS) return { error: "this agent does not accept attachments" };
  if (message === "" && attachments.length === 0) return { error: "expected a message or attachments" };
  if (ATTACHMENTS && attachments.length > ATTACHMENTS.maxFiles) return { error: `at most ${ATTACHMENTS.maxFiles} files per message` };
  let total = 0;
  for (const a of attachments) {
    if (typeof a?.name !== "string" || typeof a?.mediaType !== "string" || typeof a?.data !== "string") return { error: "each attachment needs name, mediaType and data" };
    if (!typeAllowed(a.mediaType, ATTACHMENTS!.types)) return { error: `${a.name}: this agent does not accept ${a.mediaType}` };
    const bytes = Buffer.byteLength(a.data, "base64");
    if (bytes > ATTACHMENTS!.maxFileSizeMB * 1024 * 1024) return { error: `${a.name}: larger than ${ATTACHMENTS!.maxFileSizeMB} MB` };
    total += bytes;
  }
  if (total > 15 * 1024 * 1024) return { error: "the files together are over 15 MB" };
  return { conversationId, message, attachments };
}

// Reads the AI SDK's APICallError body; returns null for anything else.
function guardrailBlock(err: unknown): { name: string; reason: string } | null {
  const body = (err as { responseBody?: string; data?: unknown })?.responseBody;
  if (!body) return null;
  try {
    const m = JSON.parse(body)?.message;
    if (m?.action !== "GUARDRAIL_INTERVENED") return null;
    return { name: m.interveningGuardrail ?? "guardrail", reason: m.actionReason ?? "refused by policy" };
  } catch {
    return null;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/healthz") {
    const missing = missingRequiredEnv();
    const ready = isStoreReady();
    if (missing.length > 0 || !ready) {
      sendJson(res, 503, { ok: false, missing, store: ready ? "ready" : "initialising" });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/chat") {
    sendJson(res, 404, { error: "not found" });
    return;
  }

  // Inbound gate: reject callers the gateway did not vouch for. A header Node
  // saw TWICE arrives as string[] — accepting it would key rows by a joined
  // "victim, attacker" value, so a non-string is refused rather than coerced.
  const userId = req.headers["x-user-id"];
  if (typeof userId !== "string" || userId === "") {
    sendJson(res, 401, { error: "missing x-user-id" });
    return;
  }

  const raw = await readBody(req, res);
  if (raw === null) return; // already answered (413) or the client went away

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: "expected { message: string }" });
    return;
  }

  const v = validate(parsed);
  if ("error" in v) {
    sendJson(res, 400, { error: v.error });
    return;
  }
  const { conversationId, message, attachments } = v;

  try {
    await ensureStore();
  } catch (err) {
    console.error("store not ready:", err);
    sendJson(res, 500, { error: "internal error" });
    return;
  }

  let id: string;
  let history: import("ai").ModelMessage[];
  if (conversationId !== undefined) {
    const loaded = await loadConversation(conversationId, userId);
    if (loaded === null) {
      sendJson(res, 404, { error: "conversation not found" });
      return;
    }
    id = conversationId;
    history = loaded;
  } else {
    id = crypto.randomUUID();
    history = [];
  }

  const user = {
    role: "user" as const,
    content: [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      ...attachments.map((a) => ({ type: "file" as const, data: a.data, mediaType: a.mediaType, filename: a.name })),
    ],
  };
  const full = [...history, user];

  try {
    const turn = await traceTurn(
      { conversationId: id, model: config.modelName ?? "", system: genAiSystem, message },
      (hooks) => runTurn(full, hooks),
    );

    // Store text, not files — each file part becomes a note naming it.
    const stored = {
      ...user,
      content: user.content.map((p) => (p.type === "file" ? { type: "text" as const, text: `[attached: ${p.filename} (${p.mediaType})]` } : p)),
    };
    await saveConversation(id, userId, [...history, stored, ...turn.steps.flatMap((s) => s.response.messages)]);

    sendJson(res, 200, { conversationId: id, text: turn.text, toolCalls: turn.toolCalls });
  } catch (err) {
    const g = guardrailBlock(err);
    if (g) {
      sendJson(res, 422, { error: g.reason, guardrail: g.name });
      return;
    }
    // A provider rejecting a turn that carried files: say which files, in a
    // FIXED message. The provider body stays in the log — never forward it.
    const status = (err as { statusCode?: number })?.statusCode;
    if (attachments.length > 0 && (status === 400 || status === 413 || status === 415)) {
      console.error("model rejected attached files:", attachments.map((a) => `${a.name} (${a.mediaType})`), err);
      sendJson(res, 422, { error: "the model could not read the attached file(s)", files: attachments.map((a) => a.name) });
      return;
    }
    console.error("chat turn failed:", err);
    sendJson(res, 500, { error: "internal error" });
  }
}

const server = http.createServer();
server.on("request", (req, res) => {
  void handle(req, res).catch((err) => { // the last line of defence:
    console.error("chat turn failed:", err); // `void handle(...)` alone
    if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
    else res.destroy(); // already streaming: cut it
  });
});

initStore(); // fire-and-forget: the DB may not be reachable yet at boot
server.listen(config.port, () => {
  console.log(`expense-assistant listening on ${config.port}`);
});
