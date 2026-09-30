import { useEffect, useMemo, useState, type JSX } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  InputAdornment,
  MenuItem,
  PageContent,
  PageTitle,
  Stack,
  TextField,
  Typography,
} from "@wso2/oxygen-ui";
import { Can } from "../authz/gates";
import { expenseApi } from "../api";
import { useClaimDraft } from "./claimDraft";
import { currentWeekRange, isDateInRange } from "../week";
import type { components } from "../generated/expense-api";

type ExpenseClaim = components["schemas"]["ExpenseClaim"];
type WeeklyLimit = components["schemas"]["WeeklyLimit"];

const CATEGORIES = ["Travel", "Meals", "Supplies", "Accommodation", "Other"] as const;
const DEFAULT_CURRENCY = "USD";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * NewClaimReview — the employee corrects the agent's pre-fill, sees the
 * team's weekly limit and a warning if this claim would exceed it (submission
 * still allowed), then submits. The over-limit sum is computed client-side
 * from GET /me/expense-claims: no endpoint supplies it (the issue's own
 * guidance, and weekly-limits.feature's "already claimed X this week").
 */
export function NewClaimReviewPage(): JSX.Element {
  const navigate = useNavigate();
  const { draft, clearDraft } = useClaimDraft();

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [merchant, setMerchant] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayIso());
  const [category, setCategory] = useState<string>(CATEGORIES[4]);

  const [weeklyLimit, setWeeklyLimit] = useState<WeeklyLimit | null>(null);
  const [weeklyLimitChecked, setWeeklyLimitChecked] = useState(false);
  const [weekSum, setWeekSum] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) {
      navigate("/claims/new", { replace: true });
      return;
    }
    const extraction = draft.extraction;
    if (extraction?.amount !== undefined) setAmount(String(extraction.amount));
    if (extraction?.currency) setCurrency(extraction.currency);
    if (extraction?.merchant) setMerchant(extraction.merchant);
    if (extraction?.expenseDate) setExpenseDate(extraction.expenseDate);
    if (extraction?.category && (CATEGORIES as readonly string[]).includes(extraction.category)) {
      setCategory(extraction.category);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, from the draft handed in by NewClaimUpload
  }, []);

  // The team's weekly limit — an Employee grant (weekly-limit:read) used here
  // as a widget, not a screen of its own.
  useEffect(() => {
    let live = true;
    void expenseApi
      .GET("/me/team/weekly-limit", {})
      .then(({ data, response }) => {
        if (!live) return;
        setWeeklyLimit(response.status === 404 ? null : (data ?? null));
      })
      .catch(() => {
        if (live) setWeeklyLimit(null);
      })
      .finally(() => {
        if (live) setWeeklyLimitChecked(true);
      });
    return () => {
      live = false;
    };
  }, []);

  // The employee's own claims already created this week, summed client-side —
  // no endpoint returns this sum.
  useEffect(() => {
    let live = true;
    void expenseApi
      .GET("/me/expense-claims", { params: { query: { limit: 100 } } })
      .then(({ data }) => {
        if (!live) return;
        const range = currentWeekRange();
        const claims: ExpenseClaim[] = data?.data ?? [];
        const sum = claims
          .filter((claim) => isDateInRange(claim.expenseDate, range))
          .reduce((total, claim) => total + claim.amount, 0);
        setWeekSum(sum);
      })
      .catch(() => {
        if (live) setWeekSum(0);
      });
    return () => {
      live = false;
    };
  }, []);

  const parsedAmount = useMemo(() => Number.parseFloat(amount), [amount]);
  const projectedTotal = weekSum + (Number.isFinite(parsedAmount) ? parsedAmount : 0);
  const overLimit = weeklyLimit !== null && projectedTotal > weeklyLimit.amountPerWeek;

  const canSubmit =
    Number.isFinite(parsedAmount) && parsedAmount > 0 && merchant.trim().length > 0 && expenseDate.length > 0;

  async function onSubmit(): Promise<void> {
    if (!draft || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: apiError } = await expenseApi.POST("/me/expense-claims", {
        body: {
          amount: parsedAmount,
          currency,
          merchant: merchant.trim(),
          expenseDate,
          category,
          // No receipt-storage endpoint exists in expense-api's contract (see
          // the report): the data: URL is the only channel available for it.
          receiptImageUrl: draft.photoDataUrl,
        },
      });
      if (apiError) {
        setError("The claim could not be submitted. Check the details and try again.");
        return;
      }
      clearDraft();
      navigate("/claims");
    } catch {
      setError("The claim could not be submitted. Check the details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!draft) return <PageContent>Redirecting…</PageContent>;

  return (
    <PageContent maxWidth={720}>
      <PageTitle>
        <PageTitle.Header>Review Claim Details</PageTitle.Header>
      </PageTitle>

      <Can op="GET /me/team/weekly-limit" fallback={null}>
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Weekly limit
            </Typography>
            {weeklyLimitChecked && weeklyLimit === null ? (
              <Typography variant="body1">Your team has no weekly limit set yet.</Typography>
            ) : (
              <>
                <Typography variant="h4">
                  {weeklyLimit ? `${weeklyLimit.amountPerWeek.toFixed(2)} ${weeklyLimit.currency}` : "—"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  your team&apos;s limit so far this week: {weekSum.toFixed(2)}
                </Typography>
              </>
            )}
          </CardContent>
        </Card>
      </Can>

      {overLimit && (
        <Box sx={{ mb: 2 }}>
          <Chip label="Over weekly limit" color="warning" size="small" />
        </Box>
      )}

      <Stack spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          slotProps={{ input: { endAdornment: <InputAdornment position="end">{currency}</InputAdornment> } }}
          helperText={draft.extraction?.unreadable.includes("amount") ? "The assistant could not read this — please check it." : undefined}
        />
        <TextField
          label="Merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          helperText={draft.extraction?.unreadable.includes("merchant") ? "The assistant could not read this — please check it." : undefined}
        />
        <TextField
          label="Date"
          type="date"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          helperText={draft.extraction?.unreadable.includes("expenseDate") ? "The assistant could not read this — please check it." : undefined}
        />
        <TextField
          select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          helperText={draft.extraction?.unreadable.includes("category") ? "The assistant could not read this — please check it." : undefined}
        >
          {CATEGORIES.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Box
        component="img"
        src={draft.photoDataUrl}
        alt="Receipt"
        sx={{ maxWidth: "100%", maxHeight: 320, borderRadius: 1, mb: 2, display: "block" }}
      />

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" justifyContent="flex-end" spacing={2}>
        <Button
          variant="outlined"
          onClick={() => {
            clearDraft();
            navigate("/claims");
          }}
        >
          Cancel
        </Button>
        <Can op="POST /me/expense-claims">
          <Button variant="contained" disabled={!canSubmit || submitting} onClick={() => void onSubmit()}>
            {submitting ? "Submitting…" : "Submit Claim"}
          </Button>
        </Can>
      </Stack>
    </PageContent>
  );
}
