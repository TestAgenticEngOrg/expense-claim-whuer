// Hand-written client for expense-assistant — an ai-agent dependency, which
// has no openapi.yaml and speaks the platform's one fixed chat contract
// instead (react-webapp: "An ai-agent dependency"). It is an EXTRA sibling
// here (expense-api is primary), so it is reached same-origin at
// /api/expense-assistant/, never through a window._env_ URL.
//
// Authorization is the same as any sibling: the bearer attached and the 401
// rule applied through src/authz/client.ts's authorizationHeader() /
// classifyResponse() — nothing here decides what an unauthorized answer means.
//
// specs/design/components/expense-assistant/agent.afm.md declares
// `attachments: { types: [image], maxFiles: 1, maxFileSizeMB: 8 }`, compiled
// in below as the receipt-photo picker's constraints.

import { authorizationHeader, classifyResponse, ApiError, ForbiddenError } from "./authz/client";

const ASSISTANT_BASE = "/api/expense-assistant";

export const ASSISTANT_ATTACHMENTS = {
  types: ["image"] as const,
  maxFiles: 1,
  maxFileSizeMB: 8,
};

export interface ChatAttachment {
  name: string;
  mediaType: string;
  /** base64-encoded file contents. */
  data: string;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  attachments?: ChatAttachment[];
}

export interface ChatResponse {
  conversationId: string;
  text: string;
  toolCalls: unknown[];
}

/**
 * One turn of the agent's chat contract. Same-origin, bearer attached, the
 * 401 rule applied — see src/authz/client.ts#apiFetch, which this mirrors for
 * the assistant's own base path (apiFetch itself is hardcoded to /api).
 */
export async function sendToAssistant(body: ChatRequest): Promise<ChatResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const header = await authorizationHeader();
  if (header) headers.set("Authorization", header);

  const response = await fetch(`${ASSISTANT_BASE}/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const outcome = await classifyResponse(response.status);
  if (outcome === "forbidden") throw new ForbiddenError(response.status);
  if (outcome === "signin") throw new ApiError(response.status, "Signing in…");

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `${response.status} ${response.statusText || "the assistant could not answer"}`,
    );
  }
  return (await response.json()) as ChatResponse;
}

/** Reads a File into the base64 payload the chat contract's attachments carry. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // "data:<mime>;base64,<payload>" — keep only the payload.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.readAsDataURL(file);
  });
}
