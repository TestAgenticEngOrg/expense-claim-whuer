import { useEffect, useMemo, useState, type JSX } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Chip, PageContent, PageTitle, Stack, TextField, Typography } from "@wso2/oxygen-ui";
import { Can } from "../authz/gates";
import { expenseApi } from "../api";
import { currentWeekRange, isDateInRange } from "../week";
import type { components } from "../generated/expense-api";

type ExpenseClaim = components["schemas"]["ExpenseClaim"];
type WeeklyLimit = components["schemas"]["WeeklyLimit"];

/**
 * ClaimReview — a manager decides one claim. There is no single-claim GET in
 * expense-api's contract, so it loads the same team list ClaimReview and
 * TeamClaims share and finds the claim by id (works on a direct visit too).
 *
 * The "Over weekly limit" badge needs the team's weekly limit, which is
 * GET /me/team/weekly-limit — gated on weekly-limit:read. security.json's
 * Manager role does not grant weekly-limit:read (only weekly-limit:set), so
 * this widget renders nothing for a Manager rather than fail: see the report
 * for this design gap, which is the same one WeeklyLimit's own load hits.
 */
export function ClaimReviewPage(): JSX.Element {
  const { claimId } = useParams<{ claimId: string }>();
  const navigate = useNavigate();
  const [claims, setClaims] = useState<ExpenseClaim[] | null>(null);
  const [weeklyLimit, setWeeklyLimit] = useState<WeeklyLimit | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void expenseApi
      .GET("/me/team/expense-claims", { params: { query: { limit: 100 } } })
      .then(({ data }) => {
        if (live) setClaims(data?.data ?? []);
      })
      .catch(() => {
        if (live) setClaims([]);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void expenseApi
      .GET("/me/team/weekly-limit", {})
      .then(({ data, response }) => {
        if (live) setWeeklyLimit(response.status === 404 ? null : (data ?? null));
      })
      .catch(() => {
        if (live) setWeeklyLimit(null);
      });
    return () => {
      live = false;
    };
  }, []);

  const claim = useMemo(() => claims?.find((c) => c.id === claimId) ?? null, [claims, claimId]);

  const overLimit = useMemo(() => {
    if (!claim || !weeklyLimit || !claims) return false;
    const range = currentWeekRange();
    const employeeWeekTotal = claims
      .filter((c) => c.employeeId === claim.employeeId && isDateInRange(c.expenseDate, range))
      .reduce((total, c) => total + c.amount, 0);
    return employeeWeekTotal > weeklyLimit.amountPerWeek;
  }, [claim, claims, weeklyLimit]);

  async function decide(action: "approve" | "reject"): Promise<void> {
    if (!claim) return;
    setBusy(action);
    setError(null);
    try {
      const body = comment.trim() ? { comment: comment.trim() } : undefined;
      const { error: apiError } =
        action === "approve"
          ? await expenseApi.POST("/me/team/expense-claims/{claimId}/approve", {
              params: { path: { claimId: claim.id } },
              body,
            })
          : await expenseApi.POST("/me/team/expense-claims/{claimId}/reject", {
              params: { path: { claimId: claim.id } },
              body,
            });
      if (apiError) {
        setError(`Could not ${action} this claim.`);
        return;
      }
      navigate("/team/claims");
    } catch {
      setError(`Could not ${action} this claim.`);
    } finally {
      setBusy(null);
    }
  }

  if (claims === null) return <PageContent>Loading…</PageContent>;
  if (!claim) return <PageContent>This claim was not found in your team's queue.</PageContent>;

  return (
    <PageContent maxWidth={720}>
      <PageTitle>
        <PageTitle.Header>Claim from {claim.employeeId}</PageTitle.Header>
      </PageTitle>

      <Typography sx={{ mb: 1 }}>
        {claim.merchant} - {claim.amount.toFixed(2)} {claim.currency} - {claim.expenseDate} - {claim.category}
      </Typography>

      <Can op="GET /me/team/weekly-limit" fallback={null}>
        {overLimit && (
          <Box sx={{ mb: 1 }}>
            <Chip label="Over weekly limit" color="warning" size="small" />
          </Box>
        )}
      </Can>

      <Box
        component="img"
        src={claim.receiptImageUrl}
        alt="Receipt"
        sx={{ maxWidth: "100%", maxHeight: 320, borderRadius: 1, mb: 2, display: "block" }}
      />

      <TextField
        label="Comment (optional)"
        multiline
        minRows={3}
        fullWidth
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        sx={{ mb: 2 }}
      />

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" justifyContent="flex-end" spacing={2}>
        <Can op="POST /me/team/expense-claims/{claimId}/reject">
          <Button variant="outlined" color="error" disabled={busy !== null} onClick={() => void decide("reject")}>
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </Button>
        </Can>
        <Can op="POST /me/team/expense-claims/{claimId}/approve">
          <Button variant="contained" disabled={busy !== null} onClick={() => void decide("approve")}>
            {busy === "approve" ? "Approving…" : "Approve"}
          </Button>
        </Can>
      </Stack>
    </PageContent>
  );
}
