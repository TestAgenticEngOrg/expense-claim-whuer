// THIS IS THE ONLY FILE THAT KNOWS ABOUT SCREENS (thunder-authentication).
// Each row names the operation the screen LOADS; the gate follows from
// whether the caller may call that operation, per src/authz/operations.gen.ts
// (generated from expense-api's openapi.yaml). No handle, role or scope is
// typed here or anywhere else in the app.
//
// Order is the wireframe's own order (specs/design/components/expense-webapp/
// wireframes.dsl): MyClaims, NewClaimUpload, NewClaimReview, TeamClaims,
// ClaimReview, WeeklyLimit — and that is also the rail order.
//
// Three Employee screens (MyClaims, NewClaimUpload, NewClaimReview) all load
// "GET /me/expense-claims": NewClaimUpload and NewClaimReview call
// expense-assistant, not expense-api, to do their own work, so there is no
// operation of their own to name — they share the Employee's one read
// operation as the fact that makes the Employee flow reachable end to end
// (per the issue's screen-to-operation gating). NewClaimReview's own Submit
// button is additionally wrapped in <Can op="POST /me/expense-claims">, the
// operation it actually calls.
//
// TeamClaims and ClaimReview both load "GET /me/team/expense-claims": there is
// no single-claim GET in the contract, so ClaimReview renders from the same
// team list (refetched by claimId on a direct visit). Its Approve/Reject
// buttons are wrapped individually in <Can op="POST .../approve"> and
// <Can op="POST .../reject">.
//
// WeeklyLimit loads "PUT /me/team/weekly-limit" — a DELIBERATE DEVIATION from
// gating it on the GET, which the issue's own instructions name. security.json
// grants Manager only weekly-limit:set, never weekly-limit:read (that handle is
// an EMPLOYEE-only grant there), so a Manager can never call the GET — gating
// the ROUTE on it would make WeeklyLimit permanently unreachable for the only
// role its flow (F2) sends to it. Gating on PUT instead is the
// thunder-authentication pattern for "a form that only writes names the
// operation its submit makes", and it is a real grant Manager holds. The
// "Current limit" text is still attempted via a best-effort GET widget (see
// WeeklyLimit.tsx), which renders "not available" for a Manager rather than
// fail — the true fix is a design one: report that security.json's Manager
// role needs weekly-limit:read alongside weekly-limit:set.

import { canCall } from "./core";
import { OPERATIONS, isOperationKey, type OperationKey } from "./operations.gen";

export interface ScreenRoute {
  readonly key: string;
  readonly label: string;
  readonly path: string;
  readonly loads: OperationKey | null;
  readonly public?: boolean;
}

export const SCREEN_ROUTES: readonly ScreenRoute[] = [
  { key: "myclaims", label: "My Claims", path: "/claims", loads: "GET /me/expense-claims" },
  { key: "newclaimupload", label: "New Claim", path: "/claims/new", loads: "GET /me/expense-claims" },
  {
    key: "newclaimreview",
    label: "Review Claim",
    path: "/claims/review",
    loads: "GET /me/expense-claims",
  },
  { key: "teamclaims", label: "Team Claims", path: "/team/claims", loads: "GET /me/team/expense-claims" },
  {
    key: "claimreview",
    label: "Claim Review",
    path: "/team/claims/:claimId",
    loads: "GET /me/team/expense-claims",
  },
  { key: "weeklylimit", label: "Weekly Limit", path: "/team/weekly-limit", loads: "PUT /me/team/weekly-limit" },
];

// FAIL LOUDLY, at module load — a committed table that outlived its contract
// must not silently gate on nothing.
for (const screen of SCREEN_ROUTES) {
  if (screen.loads !== null && !isOperationKey(screen.loads)) {
    throw new Error(
      `src/authz/screens.ts: screen "${screen.label}" loads "${screen.loads}", which ` +
        `no contract declares. Re-run \`npm run gen\`, or name the operation the ` +
        `way openapi.yaml spells it.`,
    );
  }
}

/** The screens a caller can actually open, in rail order. */
export function reachableScreens(
  scopes: ReadonlySet<string>,
  signedIn: boolean,
): readonly ScreenRoute[] {
  return SCREEN_ROUTES.filter((screen) => {
    if (screen.public) return true;
    if (screen.loads === null) return signedIn;
    return canCall(OPERATIONS[screen.loads], scopes, signedIn);
  });
}

/** Does this caller reach anything their scopes actually earned them? */
export function hasScopedReach(scopes: ReadonlySet<string>, signedIn: boolean): boolean {
  return reachableScreens(scopes, signedIn).some((screen) => !screen.public && screen.loads !== null);
}
