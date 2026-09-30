// Env, read once, in one place. Every other module reads through this.

// From x-aep.attachments in agent.afm.md — copied exactly: types, maxFiles,
// maxFileSizeMB. `null` would mean the document declares no attachments block
// (it does).
export const ATTACHMENTS: { types: string[]; maxFiles: number; maxFileSizeMB: number } | null = {
  types: ["image"],
  maxFiles: 1,
  maxFileSizeMB: 8,
};

export const config = {
  port: Number(process.env.PORT ?? 9090),

  // Model access — the organisation's connection, injected the same way for
  // every ai-agent component. No fallback: a wrong default is a 404 on some
  // other host, so an unset value is reported missing instead.
  modelEndpoint: process.env.MODEL_ENDPOINT,
  modelName: process.env.MODEL_NAME,
  modelApiKey: process.env.MODEL_API_KEY,
  modelApiFormat: process.env.MODEL_API_FORMAT,
  modelApiAuthScheme: process.env.MODEL_API_AUTH_SCHEME,
  modelApiKeyHeader: process.env.MODEL_API_KEY_HEADER,

  // expense-assistant-db (postgres-cnpg). Optional: its absence means the
  // in-memory conversation store, not a fault — see store.ts.
  expenseAssistantDbHost: process.env.EXPENSE_ASSISTANT_DB_HOST,
  expenseAssistantDbPort: process.env.EXPENSE_ASSISTANT_DB_PORT,
  expenseAssistantDbName: process.env.EXPENSE_ASSISTANT_DB_DBNAME,
  expenseAssistantDbUser: process.env.EXPENSE_ASSISTANT_DB_USER,
  expenseAssistantDbPassword: process.env.EXPENSE_ASSISTANT_DB_PASSWORD,
};

// The required MODEL_* variables — /healthz's `missing` lists whichever of
// these are unset. Database variables are never listed here: an agent run
// without them is correctly configured for the in-memory backing.
export function missingRequiredEnv(): string[] {
  const missing: string[] = [];
  if (!config.modelEndpoint) missing.push("MODEL_ENDPOINT");
  if (!config.modelName) missing.push("MODEL_NAME");
  if (!config.modelApiKey) missing.push("MODEL_API_KEY");
  if (!config.modelApiFormat) missing.push("MODEL_API_FORMAT");
  return missing;
}
