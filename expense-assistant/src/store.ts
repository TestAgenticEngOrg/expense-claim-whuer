// The conversation store. One table, the whole conversation as one JSONB
// value, loaded and saved as a unit. Two backings implement one interface;
// the configuration chooses between them — see "Which backing, and when" in
// agent-building's references/building.md.
import pg from "pg";
import type { ModelMessage } from "ai";
import { config } from "./config.js";

interface ConversationStore {
  init(): Promise<void>;
  load(id: string, userId: string): Promise<ModelMessage[] | null>;
  save(id: string, userId: string, messages: ModelMessage[]): Promise<void>;
}

const INIT = `CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  messages jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function postgresStore(): ConversationStore {
  // Built from the five injected parts — postgres-cnpg exposes no single URL
  // output. Never log this object: it carries the password. Constructed
  // HERE, not at module load, so an agent running on the in-memory backing
  // never opens a pool against an address it was never given.
  const pool = new pg.Pool({
    host: config.expenseAssistantDbHost,
    port: Number(config.expenseAssistantDbPort),
    database: config.expenseAssistantDbName,
    user: config.expenseAssistantDbUser,
    password: config.expenseAssistantDbPassword,
  });

  return {
    init: () => pool.query(INIT).then(() => undefined),

    load: async (id, userId) => {
      if (!UUID_RE.test(id)) return null; // malformed = not found, no pg error
      const r = await pool.query(
        "SELECT messages FROM conversations WHERE id = $1 AND user_id = $2",
        [id, userId],
      );
      return r.rowCount ? (r.rows[0].messages as ModelMessage[]) : null;
    },

    // One idempotent statement covers both create and update: generate the id
    // in the app (crypto.randomUUID()), then upsert. A turn that fails after
    // the id is minted but before the save leaves nothing behind — there is no
    // separate "create the row" step to half-complete.
    save: async (id, userId, messages) => {
      await pool.query(
        `INSERT INTO conversations (id, user_id, messages)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO UPDATE
           SET messages = $3::jsonb, updated_at = now()
           WHERE conversations.user_id = $2`,
        [id, userId, JSON.stringify(messages)],
      );
    },
  };
}

// One process, one Map, nothing durable — see "Which backing, and when"
// below. It carries the SAME user fence as the SQL: a conversation belongs to
// one user here too, so a behaviour that holds in the cluster is the one an
// evaluation or a local run observes.
function memoryStore(): ConversationStore {
  const rows = new Map<string, { userId: string; messages: ModelMessage[] }>();
  return {
    init: async () => {}, // nothing to provision: ready the moment it exists
    load: async (id, userId) => {
      const row = rows.get(id);
      return row !== undefined && row.userId === userId ? row.messages : null;
    },
    save: async (id, userId, messages) => {
      const row = rows.get(id);
      if (row !== undefined && row.userId !== userId) return; // the upsert's WHERE
      rows.set(id, { userId, messages });
    },
  };
}

const store: ConversationStore = config.expenseAssistantDbHost ? postgresStore() : memoryStore();

// Never await initStore() before listen() — see "Never await initStore()" in
// agent-building's references/building.md for why. initStore() fires the
// schema init and returns immediately; ensureStore() is what every turn
// awaits, retrying until it succeeds.
let ready = false;
export function isStoreReady(): boolean {
  return ready;
}
export async function ensureStore(): Promise<void> {
  if (ready) return;
  await store.init();
  ready = true;
}
export function initStore(): void {
  ensureStore().catch((err) => {
    console.error("store not ready yet:", err);
  });
}

export function loadConversation(
  id: string, userId: string,
): Promise<ModelMessage[] | null> {
  return store.load(id, userId);
}

export function saveConversation(
  id: string, userId: string, messages: ModelMessage[],
): Promise<void> {
  return store.save(id, userId, messages);
}
