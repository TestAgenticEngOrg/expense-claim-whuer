// Mock mode — YOURS (react-webapp's mock-mode.md §3). The seed data and the
// request handlers for expense-api's contract, plus a hand-written handler
// for expense-assistant's fixed chat contract (it has no openapi.yaml — see
// src/agent.ts and react-webapp's "An ai-agent dependency" section, so it is
// not in mock/authz/gateway.ts's contract-derived table at all).
//
// NO SCOPE CHECK here, anywhere: mock/authz/gateway.ts already refused a
// caller who lacks the operation's handle before this module is reached, from
// the SAME openapi.yaml src/generated/expense-api.ts came from. What this file
// owes is each path's REACH — a /me/... handler answers the caller's own rows,
// an every-row handler answers everything — exactly as the real service would.
//
// State lives in MODULE SCOPE, not persisted: a decide, a submit or a save
// shows up on the next in-app navigation, and any full page load (reload, a
// typed URL, a link that leaves the SPA) re-runs this module and restores the
// seed. That is what makes a walk repeatable, and it is also why a claim
// created a moment ago can vanish if the run reloads mid-scenario.

import { http, HttpResponse } from "msw";
import type { components } from "../src/generated/expense-api";

type ExpenseClaim = components["schemas"]["ExpenseClaim"];
type NewExpenseClaim = components["schemas"]["NewExpenseClaim"];
type ClaimDecision = components["schemas"]["ClaimDecision"];
type WeeklyLimit = components["schemas"]["WeeklyLimit"];
type NewWeeklyLimit = components["schemas"]["NewWeeklyLimit"];

/**
 * The mock's one signed-in Employee identity. Every `/me/expense-claims` row
 * is owned by this id; every `/me/team/expense-claims` row belongs to somebody
 * else. A Manager mock session never owns a claim of their own, which matches
 * security.json — Manager holds no `claims:read`, so MyClaims is unreachable
 * for it regardless of what this file seeds.
 */
export const mockCaller = {
  userId: "mock-employee",
  username: "mock-employee",
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

let nextId = 100;

// Seeded from the wireframe's own table rows (specs/design/components/
// expense-webapp/wireframes.dsl), with dates shifted to land inside the
// current calendar week so NewClaimReview's weekly-limit sum and the
// over-limit badge are actually exercisable by a walk run on any date.
let claims: ExpenseClaim[] = [
  {
    id: "1",
    employeeId: mockCaller.userId,
    amount: 24.5,
    currency: "USD",
    merchant: "Uber",
    expenseDate: daysAgo(1),
    category: "Travel",
    receiptImageUrl: "https://placehold.co/400x300?text=Receipt",
    status: "pending",
    managerComment: null,
    createdAt: nowIso(),
  },
  {
    id: "2",
    employeeId: mockCaller.userId,
    amount: 41.0,
    currency: "USD",
    merchant: "Staples",
    expenseDate: daysAgo(9),
    category: "Supplies",
    receiptImageUrl: "https://placehold.co/400x300?text=Receipt",
    status: "approved",
    managerComment: "Approved — thanks for the itemised receipt.",
    createdAt: nowIso(),
  },
  {
    id: "3",
    employeeId: mockCaller.userId,
    amount: 68.2,
    currency: "USD",
    merchant: "Diner",
    expenseDate: daysAgo(16),
    category: "Meals",
    receiptImageUrl: "https://placehold.co/400x300?text=Receipt",
    status: "rejected",
    managerComment: "Over the team's per-meal guideline.",
    createdAt: nowIso(),
  },
  {
    id: "4",
    employeeId: "Jane Doe",
    amount: 24.5,
    currency: "USD",
    merchant: "Uber",
    expenseDate: daysAgo(1),
    category: "Travel",
    receiptImageUrl: "https://placehold.co/400x300?text=Receipt",
    status: "pending",
    managerComment: null,
    createdAt: nowIso(),
  },
  {
    id: "5",
    employeeId: "Sam Lee",
    amount: 41.0,
    currency: "USD",
    merchant: "Staples",
    expenseDate: daysAgo(3),
    category: "Supplies",
    receiptImageUrl: "https://placehold.co/400x300?text=Receipt",
    status: "pending",
    managerComment: null,
    createdAt: nowIso(),
  },
];

// The wireframe's "Current limit: 150.00 per week".
let weeklyLimit: WeeklyLimit | null = {
  naturalLanguageText: "No more than $150 a week per person",
  amountPerWeek: 150,
  currency: "USD",
  updatedAt: nowIso(),
};

function page(
  items: ExpenseClaim[],
  limitParam: string | null,
  offsetParam: string | null,
): { count: number; next: string | null; previous: string | null; data: ExpenseClaim[] } {
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  const offset = offsetParam ? Number.parseInt(offsetParam, 10) : 0;
  return { count: items.length, next: null, previous: null, data: items.slice(offset, offset + limit) };
}

export const handlers = [
  // The caller's own claims — the path says so, no ownership left to guess.
  http.get("/api/me/expense-claims", ({ request }) => {
    const url = new URL(request.url);
    const mine = claims.filter((c) => c.employeeId === mockCaller.userId);
    return HttpResponse.json(page(mine, url.searchParams.get("limit"), url.searchParams.get("offset")));
  }),

  http.post("/api/me/expense-claims", async ({ request }) => {
    const body = (await request.json()) as NewExpenseClaim;
    if (
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      !body.currency ||
      !body.merchant ||
      !body.expenseDate ||
      !body.category ||
      !body.receiptImageUrl
    ) {
      return HttpResponse.json({ code: 400, message: "the claim is missing a required field" }, { status: 400 });
    }
    const created: ExpenseClaim = {
      id: String(nextId++),
      employeeId: mockCaller.userId,
      amount: body.amount,
      currency: body.currency,
      merchant: body.merchant,
      expenseDate: body.expenseDate,
      category: body.category,
      receiptImageUrl: body.receiptImageUrl,
      status: "pending",
      managerComment: null,
      createdAt: nowIso(),
    };
    claims = [created, ...claims];
    return HttpResponse.json(created, { status: 201 });
  }),

  // Every claim NOT the mock Employee's own — the manager's team queue. A
  // different operation (claims:review-team), so nothing here decides who may
  // call it; mock/authz/gateway.ts already did.
  http.get("/api/me/team/expense-claims", ({ request }) => {
    const url = new URL(request.url);
    const team = claims.filter((c) => c.employeeId !== mockCaller.userId);
    return HttpResponse.json(page(team, url.searchParams.get("limit"), url.searchParams.get("offset")));
  }),

  http.post("/api/me/team/expense-claims/:claimId/approve", async ({ params, request }) => {
    const claim = claims.find((c) => c.id === params.claimId);
    if (!claim) return HttpResponse.json({ code: 404, message: "claim not found" }, { status: 404 });
    const body = (await request.json().catch(() => undefined)) as ClaimDecision | undefined;
    claim.status = "approved";
    claim.managerComment = body?.comment ?? null;
    return HttpResponse.json(claim);
  }),

  http.post("/api/me/team/expense-claims/:claimId/reject", async ({ params, request }) => {
    const claim = claims.find((c) => c.id === params.claimId);
    if (!claim) return HttpResponse.json({ code: 404, message: "claim not found" }, { status: 404 });
    const body = (await request.json().catch(() => undefined)) as ClaimDecision | undefined;
    claim.status = "rejected";
    claim.managerComment = body?.comment ?? null;
    return HttpResponse.json(claim);
  }),

  http.get("/api/me/team/weekly-limit", () =>
    weeklyLimit
      ? HttpResponse.json(weeklyLimit)
      : HttpResponse.json({ code: 404, message: "no weekly limit is set yet" }, { status: 404 }),
  ),

  http.put("/api/me/team/weekly-limit", async ({ request }) => {
    const body = (await request.json()) as NewWeeklyLimit;
    if (typeof body.amountPerWeek !== "number" || !Number.isFinite(body.amountPerWeek) || !body.currency) {
      return HttpResponse.json({ code: 400, message: "the weekly limit is missing a required field" }, { status: 400 });
    }
    weeklyLimit = {
      naturalLanguageText: body.naturalLanguageText,
      amountPerWeek: body.amountPerWeek,
      currency: body.currency,
      updatedAt: nowIso(),
    };
    return HttpResponse.json(weeklyLimit);
  }),

  // expense-assistant: the platform's one fixed chat contract (react-webapp:
  // "An ai-agent dependency has no OpenAPI contract"), so it carries no entry
  // in mock/authz/gateway.ts's contract-derived table at all — every signed-in
  // mock caller reaches it, matching agent.afm.md's `identity: on-behalf-of`
  // with no scope of its own. Mirrors the two turns agent.afm.md describes:
  // an attached receipt photo is read as a claim; plain text is read as a
  // weekly-limit sentence.
  http.post("/api/expense-assistant/chat", async ({ request }) => {
    const body = (await request.json()) as {
      message?: string;
      attachments?: { name: string; mediaType: string; data: string }[];
    };
    const text =
      (body.attachments?.length ?? 0) > 0
        ? JSON.stringify({
            amount: 32.75,
            currency: "USD",
            merchant: "Mock Cafe",
            expenseDate: daysAgo(0),
            category: "Meals",
          })
        : JSON.stringify(interpretWeeklyLimitSentence(body.message ?? ""));
    return HttpResponse.json({ conversationId: "mock-conversation", text, toolCalls: [] });
  }),
];

/** A small heuristic reader, standing in for the real agent's own. */
function interpretWeeklyLimitSentence(sentence: string): { amountPerWeek?: number; currency?: string } {
  const match = /(\d+(?:\.\d+)?)/.exec(sentence);
  if (!match) return {};
  const amountPerWeek = Number.parseFloat(match[1]);
  const currency = /eur|€/i.test(sentence) ? "EUR" : /gbp|£/i.test(sentence) ? "GBP" : "USD";
  return { amountPerWeek, currency };
}
