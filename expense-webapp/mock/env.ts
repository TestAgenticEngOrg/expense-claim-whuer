// Mock mode — YOURS (react-webapp's mock-mode.md §4). Carries only the keys
// the platform actually emits for this component: this app's `user-auth`
// OIDC keys (src/env.ts's Env type), nothing else. No sibling URL — expense-api
// and expense-assistant are reached same-origin at /api and
// /api/expense-assistant/, never through window._env_.
//
// SCOPES is the OIDC set (openid profile email group ou — singular `group`/`ou`,
// exactly as the platform requests them) plus every handle
// specs/design/security.json's permissions[] declares, so every role's grants
// are representable. mock/authz/session.ts narrows this down to one role's
// actual grants per ?role=; this is only the ceiling the mock user could ever
// carry.
export const mockEnv = {
  USER_AUTH_CLIENT_ID: "mock-client",
  USER_AUTH_ISSUER: "https://mock-idp.test",
  USER_AUTH_SCOPES:
    "openid profile email group ou " +
    "claims:read claims:submit claims:review-team claims:approve claims:reject " +
    "weekly-limit:read weekly-limit:set",
  USER_AUTH_RESOURCE: "https://mock-idp.test/resources/expense-claim-whuer",
};
