// Expense claims and the team weekly limit — specs/design/components/expense-api/openapi.yaml
// implemented exactly: same paths, schemas and status codes.
//
// No operation -> scope table: the gateway already enforced the scope each operation
// declares before the request reached this process (`api-management`, `openapi-conventions`).
// Every resource below does exactly two things: resolve the caller from the verified gateway
// assertion, and filter/stamp rows by that caller's `userId` (their own claims) or `orgHandle`
// (their team's claims and weekly limit) — never anything the client sent. A row that exists
// but is not the caller's is a 404, never a 403.

import ballerina/http;
import ballerina/time;
import ballerina/uuid;

listener http:Listener ep0 = new (9090);

service http:InterceptableService / on ep0 {
    public function createInterceptors() returns AssertionInterceptor => new;

    # Liveness check — public, reads no identity.
    resource function get health() returns http:Ok {
        return http:OK;
    }

    # The caller's own claims.
    resource function get me/expense\-claims(http:RequestContext ctx,
            "pending"|"approved"|"rejected"? status, int 'limit = 20, int offset = 0)
            returns ExpenseClaimPage|http:Unauthorized|error {
        GatewayCaller|http:Unauthorized caller = requireGatewayCaller(ctx);
        if caller is http:Unauthorized {
            return caller;
        }
        int boundedLimit = boundLimit('limit);
        int boundedOffset = boundOffset(offset);
        [ClaimRow[], int] result = check claimStore.claimsByEmployee(caller.userId, status, boundedLimit, boundedOffset);
        return toPage("/me/expense-claims", result, boundedLimit, boundedOffset, status);
    }

    # Submit a new expense claim, stamped with the caller's own identity.
    resource function post me/expense\-claims(http:RequestContext ctx, @http:Payload NewExpenseClaim payload)
            returns ExpenseClaimCreated|http:BadRequest|http:Unauthorized|error {
        GatewayCaller|http:Unauthorized caller = requireGatewayCaller(ctx);
        if caller is http:Unauthorized {
            return caller;
        }
        string? validationError = validateNewClaim(payload);
        if validationError is string {
            return <http:BadRequest>{body: {code: 400, message: validationError}};
        }
        ClaimRow row = {
            id: uuid:createRandomUuid(),
            employeeId: caller.userId,
            orgHandle: caller.orgHandle,
            amount: payload.amount,
            currency: payload.currency,
            merchant: payload.merchant,
            expenseDate: payload.expenseDate,
            category: payload.category,
            receiptImageUrl: payload.receiptImageUrl,
            status: "pending",
            managerComment: (),
            createdAt: time:utcToString(time:utcNow())
        };
        ClaimRow saved = check claimStore.insertClaim(row);
        return <ExpenseClaimCreated>{body: toExpenseClaim(saved)};
    }

    # Every claim submitted by the caller's team (the caller's own `orgHandle`).
    resource function get me/team/expense\-claims(http:RequestContext ctx,
            "pending"|"approved"|"rejected"? status, int 'limit = 20, int offset = 0)
            returns ExpenseClaimPage|http:Unauthorized|error {
        GatewayCaller|http:Unauthorized caller = requireGatewayCaller(ctx);
        if caller is http:Unauthorized {
            return caller;
        }
        int boundedLimit = boundLimit('limit);
        int boundedOffset = boundOffset(offset);
        [ClaimRow[], int] result = check claimStore.claimsByOrg(caller.orgHandle, status, boundedLimit, boundedOffset);
        return toPage("/me/team/expense-claims", result, boundedLimit, boundedOffset, status);
    }

    # Approve a claim in the caller's team.
    resource function post me/team/expense\-claims/[string claimId]/approve(http:RequestContext ctx,
            @http:Payload ClaimDecision? payload = ())
            returns ExpenseClaimOk|http:Unauthorized|http:NotFound|error {
        return self.decide(ctx, claimId, "approved", payload);
    }

    # Reject a claim in the caller's team.
    resource function post me/team/expense\-claims/[string claimId]/reject(http:RequestContext ctx,
            @http:Payload ClaimDecision? payload = ())
            returns ExpenseClaimOk|http:Unauthorized|http:NotFound|error {
        return self.decide(ctx, claimId, "rejected", payload);
    }

    function decide(http:RequestContext ctx, string claimId, string decision, ClaimDecision? payload)
            returns ExpenseClaimOk|http:Unauthorized|http:NotFound|error {
        GatewayCaller|http:Unauthorized caller = requireGatewayCaller(ctx);
        if caller is http:Unauthorized {
            return caller;
        }
        ClaimRow? existing = check claimStore.claimById(claimId);
        if existing is () || existing.orgHandle != caller.orgHandle {
            // A claim that exists but is in a different team does not exist for this
            // caller either: same 404 as no claim at all, never a 403.
            return <http:NotFound>{body: {code: 404, message: "claim not found"}};
        }
        string? comment = ();
        if payload is ClaimDecision {
            comment = payload?.comment;
        }
        ClaimRow? updated = check claimStore.decideClaim(claimId, decision, comment);
        if updated is () {
            return <http:NotFound>{body: {code: 404, message: "claim not found"}};
        }
        return <ExpenseClaimOk>{body: toExpenseClaim(updated)};
    }

    # The caller's team's weekly limit. An Employee grant too — resolves the caller's own
    # `orgHandle`'s limit regardless of role.
    resource function get me/team/weekly\-limit(http:RequestContext ctx)
            returns WeeklyLimit|http:Unauthorized|http:NotFound|error {
        GatewayCaller|http:Unauthorized caller = requireGatewayCaller(ctx);
        if caller is http:Unauthorized {
            return caller;
        }
        WeeklyLimitRow? row = check claimStore.weeklyLimit(caller.orgHandle);
        if row is () {
            return <http:NotFound>{body: {code: 404, message: "no weekly limit set for this team"}};
        }
        return toWeeklyLimit(row);
    }

    # Set the caller's team's weekly limit.
    resource function put me/team/weekly\-limit(http:RequestContext ctx, @http:Payload NewWeeklyLimit payload)
            returns WeeklyLimit|http:BadRequest|http:Unauthorized|error {
        GatewayCaller|http:Unauthorized caller = requireGatewayCaller(ctx);
        if caller is http:Unauthorized {
            return caller;
        }
        string? validationError = validateNewLimit(payload);
        if validationError is string {
            return <http:BadRequest>{body: {code: 400, message: validationError}};
        }
        WeeklyLimitRow row = {
            orgHandle: caller.orgHandle,
            naturalLanguageText: payload.naturalLanguageText,
            amountPerWeek: payload.amountPerWeek,
            currency: payload.currency,
            updatedAt: time:utcToString(time:utcNow())
        };
        WeeklyLimitRow saved = check claimStore.saveWeeklyLimit(row);
        return toWeeklyLimit(saved);
    }
}

function boundLimit(int requested) returns int {
    if requested < 1 {
        return 20;
    }
    if requested > 100 {
        return 100;
    }
    return requested;
}

function boundOffset(int requested) returns int {
    return requested < 0 ? 0 : requested;
}

function toExpenseClaim(ClaimRow row) returns ExpenseClaim {
    return {
        id: row.id,
        employeeId: row.employeeId,
        amount: row.amount,
        currency: row.currency,
        merchant: row.merchant,
        expenseDate: row.expenseDate,
        category: row.category,
        receiptImageUrl: row.receiptImageUrl,
        status: <"pending"|"approved"|"rejected">row.status,
        managerComment: row.managerComment,
        createdAt: row.createdAt
    };
}

function toWeeklyLimit(WeeklyLimitRow row) returns WeeklyLimit {
    return {
        naturalLanguageText: row.naturalLanguageText,
        amountPerWeek: row.amountPerWeek,
        currency: row.currency,
        updatedAt: row.updatedAt
    };
}

function toPage(string basePath, [ClaimRow[], int] result, int 'limit, int offset, string? status)
        returns ExpenseClaimPage {
    ClaimRow[] rows = result[0];
    int total = result[1];
    ExpenseClaim[] data = from ClaimRow r in rows select toExpenseClaim(r);
    string suffix = status is string ? "&status=" + status : "";
    string? next = offset + 'limit < total
        ? string `${basePath}?limit=${'limit}&offset=${offset + 'limit}${suffix}`
        : ();
    string? previous = offset > 0
        ? string `${basePath}?limit=${'limit}&offset=${offset - 'limit < 0 ? 0 : offset - 'limit}${suffix}`
        : ();
    return {count: total, next: next, previous: previous, data: data};
}

function validateNewClaim(NewExpenseClaim payload) returns string? {
    if payload.amount <= 0d {
        return "amount must be greater than zero";
    }
    if payload.currency.trim() == "" {
        return "currency is required";
    }
    if payload.merchant.trim() == "" {
        return "merchant is required";
    }
    if payload.expenseDate.trim() == "" {
        return "expenseDate is required";
    }
    if payload.category.trim() == "" {
        return "category is required";
    }
    if payload.receiptImageUrl.trim() == "" {
        return "receiptImageUrl is required";
    }
    return ();
}

function validateNewLimit(NewWeeklyLimit payload) returns string? {
    if payload.naturalLanguageText.trim() == "" {
        return "naturalLanguageText is required";
    }
    if payload.amountPerWeek <= 0d {
        return "amountPerWeek must be greater than zero";
    }
    if payload.currency.trim() == "" {
        return "currency is required";
    }
    return ();
}
