// Adapted from thunder-authentication's assets/App.example.tsx. The ROUTING
// STRUCTURE is prescribed there (NoAccess above the shell, Forbidden inside
// it, /callback outside the provider, /forbidden wired once from the router
// root) — only PAGE_BY_KEY and APP_NAME are this app's own.

import { useEffect, type ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthzProvider, Forbidden, NoAccess, RequireOperation, useAuthz, useScopes } from "./authz/gates";
import { SCREEN_ROUTES, reachableScreens, hasScopedReach } from "./authz/screens";
import { setForbiddenNavigator } from "./authz/client";
import { signIn } from "./authz/session";
import { AppShell } from "./shell/AppShell";
import { CallbackPage } from "./pages/Callback";
import { MyClaimsPage } from "./pages/MyClaims";
import { NewClaimUploadPage } from "./pages/NewClaimUpload";
import { NewClaimReviewPage } from "./pages/NewClaimReview";
import { TeamClaimsPage } from "./pages/TeamClaims";
import { ClaimReviewPage } from "./pages/ClaimReview";
import { WeeklyLimitPage } from "./pages/WeeklyLimit";
import { ClaimDraftProvider } from "./pages/claimDraft";
import { APP_NAME } from "./appName";

/** YOUR pages, keyed by the screen keys src/authz/screens.ts declares. */
const PAGE_BY_KEY: Record<string, ReactElement> = {
  myclaims: <MyClaimsPage />,
  newclaimupload: <NewClaimUploadPage />,
  newclaimreview: <NewClaimReviewPage />,
  teamclaims: <TeamClaimsPage />,
  claimreview: <ClaimReviewPage />,
  weeklylimit: <WeeklyLimitPage />,
};

/** No screen in this app's flows lacks a `role` line, so this is empty. */
const PUBLIC_SCREENS = SCREEN_ROUTES.filter((screen) => screen.public);

export function App(): ReactElement {
  return (
    <BrowserRouter>
      <ForbiddenWiring />
      <Routes>
        <Route path="/callback" element={<CallbackPage />} />
        {PUBLIC_SCREENS.map((screen) => (
          <Route
            key={screen.key}
            path={screen.path}
            element={<AuthzProvider fallback={<Splash />}>{PAGE_BY_KEY[screen.key]}</AuthzProvider>}
          />
        ))}
        <Route
          path="*"
          element={
            <AuthzProvider fallback={<Splash />}>
              <ClaimDraftProvider>
                <SignedIn />
              </ClaimDraftProvider>
            </AuthzProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Hands src/authz/client.ts the route a refusal goes to. Wired ONCE, from
 * inside the router and above every route.
 */
function ForbiddenWiring(): null {
  const navigate = useNavigate();
  useEffect(() => {
    setForbiddenNavigator(() => navigate("/forbidden", { replace: true }));
  }, [navigate]);
  return null;
}

function Splash(): ReactElement {
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>Checking your session…</p>
    </main>
  );
}

function SignedIn(): ReactElement {
  const { signedIn } = useAuthz();
  const scopes = useScopes();

  // The load-time guard. Only a MISSING session starts a sign-in: currentUser()
  // already tried a silent renew, and signing in on a merely expired token
  // re-logs the user in on every visit.
  useEffect(() => {
    if (!signedIn) void signIn();
  }, [signedIn]);

  if (!signedIn) return <Splash />;

  const reachable = reachableScreens(scopes, signedIn);

  if (!hasScopedReach(scopes, signedIn)) return <NoAccess appName={APP_NAME} />;

  const landing = (reachable.find((s) => !s.public && s.loads !== null) ?? reachable[0]).path;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to={landing} replace />} />
        {SCREEN_ROUTES.map((screen) => {
          if (screen.public) return null;
          const page = PAGE_BY_KEY[screen.key];
          if (screen.loads === null) {
            return <Route key={screen.key} path={screen.path} element={page} />;
          }
          return (
            <Route key={screen.key} element={<RequireOperation op={screen.loads} screen={screen.label} />}>
              <Route path={screen.path} element={page} />
            </Route>
          );
        })}
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="*" element={<Navigate to={landing} replace />} />
      </Route>
    </Routes>
  );
}
