import { useEffect, useState, type ReactElement } from "react";
import { handleCallback } from "../authz/session";
import { APP_NAME } from "../appName";

/**
 * The one registered redirect URI, serving both the redirect and the silent
 * renew legs (thunder-authentication: handleCallback() -> signinCallback(),
 * which dispatches on the stored request_type). Renders from the promise
 * SETTLING, never from a value — the silent leg has no User to hand back.
 */
export function CallbackPage(): ReactElement {
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    void handleCallback().finally(() => {
      if (live) setDone(true);
      // The redirect leg lands signed in; go to the app root and let the
      // sign-in guard route to the landing screen. The silent leg's hidden
      // iframe is never seen by a user.
      if (live && window.self === window.top) window.location.assign("/");
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>{done ? "Signed in — redirecting…" : "Completing sign-in…"}</p>
    </main>
  );
}
