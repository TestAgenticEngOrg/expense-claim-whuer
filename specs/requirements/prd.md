# expense-claim-whuer — PRD

## Problem Statement

Employees who pay for business expenses out of pocket today collect paper or
emailed receipts and hand them to their manager through ad hoc channels — chat
messages, forwarded emails, spreadsheets. There is no single place to submit a
claim, track its status, or see what a manager decided, so claims get lost,
approvals are slow, and nobody can tell at a glance what is still pending.

## Solution

A web application where an employee submits an expense claim by photographing
a receipt; an agent reads the photo and pre-fills the amount, date, merchant
and category so the employee only has to confirm or correct them. The
employee's manager reviews submitted claims in one place and approves or
rejects each one, and the employee can always see the current status of every
claim they have submitted.

## Actors

- **Employee** — submits expense claims with a receipt photo, reviews the
agent's pre-filled details before submitting, and tracks the status of their
own claims.
- **Manager** — reviews the expense claims submitted by their team, approves
or rejects each one, optionally with a comment, and sets the team's weekly
expense limit in natural language.

## User Stories

1. As an Employee, I want to submit an expense claim with a photo of my
receipt, so that I have a record of the expense and can request
reimbursement.
2. As an Employee, I want an agent to read my receipt photo and pre-fill the
amount, date, merchant and category, so that I don't have to type them in
by hand.
3. As an Employee, I want to review and correct the pre-filled details before
submitting, so that a misread receipt doesn't produce a wrong claim.
4. As an Employee, I want to see the status of every claim I've submitted
(pending, approved, rejected), so that I know what still needs attention.
5. As a Manager, I want to see the expense claims submitted by my team, so
that I can review them.
6. As a Manager, I want to approve or reject a claim, optionally with a
comment, so that the employee understands the outcome.
7. As an Employee, I want to be notified when my claim is approved or
rejected, so that I know the outcome without having to check back.
8. As a Manager, I want to state my team's weekly expense limit in plain
language, so that I don't have to learn a rigid form to set it.
9. As an Employee, I want to see my team's weekly expense limit when I'm
submitting a claim, and a warning if this claim would put me over it, so
that I know before I submit rather than after.

## Product Decisions

- Sign-in is via SSO through Thunder, the platform IDP, for both Employee and
Manager actors.
- An agent reads each submitted receipt photo and pre-fills the claim's
amount, date, merchant and category; the employee confirms or edits the
result before the claim is submitted.
- Approval is single-level: a claim's manager approves or rejects it, and that
decision is final — there is no escalation or second approver. *assumed*
- Employees are notified by email when their claim is approved or rejected.
*assumed*
- Manager-of relationships that decide which manager sees which employee's
claims are drawn from the organization's existing directory groups rather
than a new field the employee fills in. *assumed*
- A manager sets one weekly expense limit that applies to their whole team,
not a separate limit per employee.
- The manager states the weekly limit in natural language (e.g. "no more than
$200 a week per person"); an agent interprets it into the structured weekly
amount the product uses.
- Going over the team's weekly limit does not block submission: the employee
sees a warning at submission time, and the claim goes through to the manager
as normal.

## Out of Scope

- Multi-level or amount-threshold approval workflows.
- Tracking actual reimbursement payout (payroll integration, marking a claim
"paid").
- Multi-currency claims or currency conversion.
- Category budgets or other policy enforcement beyond the team's single
weekly limit.
- Per-employee weekly limits, and blocking a submission that goes over the
team's weekly limit.

## Open Questions

1. What currency should claim amounts be recorded in? The agent will read
whatever the receipt shows, but the product needs one currency to display
and total claims in, and only the user knows which one the business
operates in.

## Further Notes

None.