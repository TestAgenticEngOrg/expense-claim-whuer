import { useEffect, useState, type JSX } from "react";
import { Button, PageContent, PageTitle, Stack, TextField, Typography } from "@wso2/oxygen-ui";
import { Can, useAuthz } from "../authz/gates";
import { canCall } from "../authz/core";
import { OPERATIONS } from "../authz/operations.gen";
import { expenseApi } from "../api";
import { sendToAssistant } from "../agent";
import { parseWeeklyLimitExtraction } from "../parseAgentReply";
import type { components } from "../generated/expense-api";

type WeeklyLimit = components["schemas"]["WeeklyLimit"];

/**
 * WeeklyLimit — the manager states the limit in plain language, expense-assistant
 * turns it into a structured amount/currency for confirmation, then it saves
 * via PUT (set-weekly-limit.md).
 *
 * "Current limit" is a best-effort GET: security.json grants Manager
 * weekly-limit:set but not weekly-limit:read (that is Employee-only), so this
 * widget shows "not available" for a Manager rather than fail the screen — see
 * src/authz/screens.ts's note and the report for this design gap. After a
 * successful Save the display updates from the PUT response itself, which
 * needs no read permission at all.
 *
 * The GET is skipped entirely (never fired) when the caller cannot call it:
 * authz/client.ts's 401 rule sends EVERY refused call to /forbidden, best
 * effort or not, so actually making this call as a Manager evicted the whole
 * screen instead of degrading the one widget.
 */
export function WeeklyLimitPage(): JSX.Element {
  const { scopes, signedIn } = useAuthz();
  const canReadCurrent = canCall(OPERATIONS["GET /me/team/weekly-limit"], scopes, signedIn);
  const [current, setCurrent] = useState<WeeklyLimit | null>(null);
  const [currentUnavailable, setCurrentUnavailable] = useState(!canReadCurrent);
  const [sentence, setSentence] = useState("");
  const [pending, setPending] = useState<{ amountPerWeek: number; currency: string } | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canReadCurrent) {
      setCurrentUnavailable(true);
      return;
    }
    let live = true;
    void expenseApi
      .GET("/me/team/weekly-limit", {})
      .then(({ data, response }) => {
        if (!live) return;
        if (response.status === 404) return;
        setCurrent(data ?? null);
      })
      .catch(() => {
        if (live) setCurrentUnavailable(true);
      });
    return () => {
      live = false;
    };
  }, [canReadCurrent]);

  async function onInterpret(): Promise<void> {
    if (!sentence.trim()) return;
    setInterpreting(true);
    setError(null);
    setPending(null);
    try {
      const reply = await sendToAssistant({ message: sentence.trim() });
      const extraction = parseWeeklyLimitExtraction(reply.text);
      if (extraction.unreadable || extraction.amountPerWeek === undefined) {
        setError("The assistant could not find a clear amount in that sentence. Try rephrasing it.");
        return;
      }
      setPending({ amountPerWeek: extraction.amountPerWeek, currency: extraction.currency ?? "USD" });
    } catch {
      setError("The assistant could not interpret that sentence. Please try again.");
    } finally {
      setInterpreting(false);
    }
  }

  async function onSave(): Promise<void> {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error: apiError } = await expenseApi.PUT("/me/team/weekly-limit", {
        body: {
          naturalLanguageText: sentence.trim(),
          amountPerWeek: pending.amountPerWeek,
          currency: pending.currency,
        },
      });
      if (apiError || !data) {
        setError("The weekly limit could not be saved.");
        return;
      }
      setCurrent(data);
      setCurrentUnavailable(false);
      setPending(null);
      setSentence("");
    } catch {
      setError("The weekly limit could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContent maxWidth={720}>
      <PageTitle>
        <PageTitle.Header>Team Weekly Limit</PageTitle.Header>
      </PageTitle>

      <Typography sx={{ mb: 2 }}>
        {current
          ? `Current limit: ${current.amountPerWeek.toFixed(2)} ${current.currency} per week`
          : currentUnavailable
            ? "Current limit: not available to your role."
            : "Current limit: none set yet."}
      </Typography>

      <TextField
        label='Describe the weekly limit, e.g. "no more than $150 a week per person"'
        multiline
        minRows={2}
        fullWidth
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        sx={{ mb: 2 }}
      />

      {pending && (
        <Typography sx={{ mb: 2 }}>
          The assistant read this as <strong>{pending.amountPerWeek.toFixed(2)} {pending.currency}</strong> per week
          per person. Save to confirm.
        </Typography>
      )}

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" justifyContent="flex-end" spacing={2}>
        {!pending ? (
          <Button variant="outlined" disabled={!sentence.trim() || interpreting} onClick={() => void onInterpret()}>
            {interpreting ? "Interpreting…" : "Interpret"}
          </Button>
        ) : null}
        <Can op="PUT /me/team/weekly-limit">
          <Button variant="contained" disabled={!pending || saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </Can>
      </Stack>
    </PageContent>
  );
}
