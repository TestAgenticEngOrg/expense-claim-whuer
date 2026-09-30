// Typed read of window._env_, the platform's runtime config. Populated by
// /env-config.js, mounted into the served root at request time — never at
// build time (react-webapp: no import.meta.env.VITE_*, no .env files).
//
// Only the auth dependency's browser-visible keys are declared: CLIENT_ID,
// ISSUER, SCOPES and RESOURCE. Not JWKS_URL — the browser never validates a
// token, the API gateway does. There is no sibling-service URL here: expense-api
// and expense-assistant are reached same-origin at /api and
// /api/expense-assistant/ (nginx's job), never through window._env_.
type Env = {
  USER_AUTH_CLIENT_ID: string;
  USER_AUTH_ISSUER: string;
  USER_AUTH_SCOPES: string;
  USER_AUTH_RESOURCE: string;
};

declare global {
  interface Window {
    _env_: Env;
  }
}

if (!window._env_) {
  throw new Error(
    "window._env_ not set — /env-config.js failed to load. " +
      "The platform mounts this file; if you see this locally, host " +
      "/env-config.js from your dev server.",
  );
}

export const env: Env = window._env_;
