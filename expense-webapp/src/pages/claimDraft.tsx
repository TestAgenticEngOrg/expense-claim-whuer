// The in-progress claim between NewClaimUpload and NewClaimReview: the
// uploaded receipt photo and the agent's extraction of it. Held in memory only
// — nothing is persisted, and it exists solely to carry what the next screen
// needs to render (the acceptance criterion: "No business data is held
// client-side beyond what's needed to render"). A reload starts the flow over,
// exactly as the receipt upload flow starts over on any full page load.

import { createContext, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";

export interface ClaimExtraction {
  amount?: number;
  currency?: string;
  merchant?: string;
  expenseDate?: string;
  category?: string;
  /** Fields the agent said it could not read, named exactly as it named them. */
  unreadable: string[];
}

export interface ClaimDraft {
  /** Full data: URL — used both for the <img> preview and, absent any receipt
   *  storage endpoint in expense-api's contract, as the claim's receiptImageUrl
   *  (a valid URI string; see the report for this gap). */
  photoDataUrl: string;
  photoName: string;
  extraction: ClaimExtraction | null;
}

interface ClaimDraftContextValue {
  draft: ClaimDraft | null;
  setDraft: (draft: ClaimDraft) => void;
  clearDraft: () => void;
}

const ClaimDraftContext = createContext<ClaimDraftContextValue | null>(null);

export function ClaimDraftProvider({ children }: { children: ReactNode }): ReactElement {
  const [draft, setDraftState] = useState<ClaimDraft | null>(null);
  const value = useMemo<ClaimDraftContextValue>(
    () => ({
      draft,
      setDraft: setDraftState,
      clearDraft: () => setDraftState(null),
    }),
    [draft],
  );
  return <ClaimDraftContext.Provider value={value}>{children}</ClaimDraftContext.Provider>;
}

export function useClaimDraft(): ClaimDraftContextValue {
  const value = useContext(ClaimDraftContext);
  if (!value) throw new Error("useClaimDraft called outside <ClaimDraftProvider>");
  return value;
}
