// expense-assistant's chat contract carries only free text (react-webapp's
// fixed agent shape: `{ conversationId, text, toolCalls }`) — agent.afm.md
// names the fields it replies with but not a wire format, so the reply may be
// JSON, a code-fenced JSON block, or plain "key: value" lines. Parse
// defensively for both, and leave a field undefined (never guessed) when
// neither shape produced it — the employee/manager corrects it by hand, exactly
// as the agent's own instructions say it will when a field is unreadable.

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function lineValue(text: string, field: string): string | undefined {
  const re = new RegExp(`^\\s*[-*]?\\s*${field}\\s*[:=]\\s*(.+)$`, "im");
  const match = re.exec(text);
  return match ? match[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function looksUnreadable(value: string | undefined): boolean {
  if (!value) return true;
  return /unreadable|unclear|cannot (read|tell)|not (visible|legible)|unknown/i.test(value);
}

export interface ReceiptExtraction {
  amount?: number;
  currency?: string;
  merchant?: string;
  expenseDate?: string;
  category?: string;
  unreadable: string[];
}

export function parseReceiptExtraction(text: string): ReceiptExtraction {
  const json = extractJsonObject(text);
  const raw = {
    amount: json ? asNumber(json.amount) : asNumber(lineValue(text, "amount")),
    currency: json ? asString(json.currency) : asString(lineValue(text, "currency")),
    merchant: json ? asString(json.merchant) : asString(lineValue(text, "merchant")),
    expenseDate: json
      ? asString(json.expenseDate ?? json.date)
      : asString(lineValue(text, "expenseDate") ?? lineValue(text, "date")),
    category: json ? asString(json.category) : asString(lineValue(text, "category")),
  };
  const unreadable = (["amount", "currency", "merchant", "expenseDate", "category"] as const).filter(
    (field) => raw[field] === undefined && looksUnreadable(lineValue(text, field)),
  );
  return { ...raw, unreadable };
}

export interface WeeklyLimitExtraction {
  amountPerWeek?: number;
  currency?: string;
  unreadable: boolean;
}

export function parseWeeklyLimitExtraction(text: string): WeeklyLimitExtraction {
  const json = extractJsonObject(text);
  const amountPerWeek = json ? asNumber(json.amountPerWeek) : asNumber(lineValue(text, "amountPerWeek"));
  const currency = json ? asString(json.currency) : asString(lineValue(text, "currency"));
  return { amountPerWeek, currency, unreadable: amountPerWeek === undefined };
}
