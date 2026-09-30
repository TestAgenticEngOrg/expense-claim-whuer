// A test double for `ClaimStore` — no Postgres involved. Reassigning the module-level
// `claimStore` variable in store.bal to one of these follows the "Creating a test double"
// pattern from the `ballerina/test` guide: it is a plain module variable, not `final`, so a
// test can swap it wholesale before making any HTTP call.

public class InMemoryClaimStore {
    *ClaimStore;

    private map<ClaimRow> claims = {};
    private map<WeeklyLimitRow> limits = {};

    public function insertClaim(ClaimRow row) returns ClaimRow|error {
        self.claims[row.id] = row;
        return row;
    }

    public function claimsByEmployee(string employeeId, string? status, int 'limit, int offset) returns [ClaimRow[], int]|error {
        ClaimRow[] matches = from ClaimRow c in self.claims
            where c.employeeId == employeeId
            where status is () || c.status == status
            order by c.createdAt descending
            select c;
        return sliceRows(matches, 'limit, offset);
    }

    public function claimsByOrg(string orgHandle, string? status, int 'limit, int offset) returns [ClaimRow[], int]|error {
        ClaimRow[] matches = from ClaimRow c in self.claims
            where c.orgHandle == orgHandle
            where status is () || c.status == status
            order by c.createdAt descending
            select c;
        return sliceRows(matches, 'limit, offset);
    }

    public function claimById(string id) returns ClaimRow?|error {
        return self.claims.hasKey(id) ? self.claims.get(id) : ();
    }

    public function decideClaim(string id, string status, string? managerComment) returns ClaimRow?|error {
        if !self.claims.hasKey(id) {
            return ();
        }
        ClaimRow existing = self.claims.get(id);
        ClaimRow updated = {
            id: existing.id,
            employeeId: existing.employeeId,
            orgHandle: existing.orgHandle,
            amount: existing.amount,
            currency: existing.currency,
            merchant: existing.merchant,
            expenseDate: existing.expenseDate,
            category: existing.category,
            receiptImageUrl: existing.receiptImageUrl,
            status: status,
            managerComment: managerComment,
            createdAt: existing.createdAt
        };
        self.claims[id] = updated;
        return updated;
    }

    public function weeklyLimit(string orgHandle) returns WeeklyLimitRow?|error {
        return self.limits.hasKey(orgHandle) ? self.limits.get(orgHandle) : ();
    }

    public function saveWeeklyLimit(WeeklyLimitRow row) returns WeeklyLimitRow|error {
        self.limits[row.orgHandle] = row;
        return row;
    }
}

function sliceRows(ClaimRow[] matches, int 'limit, int offset) returns [ClaimRow[], int] {
    int total = matches.length();
    if offset >= total {
        return [[], total];
    }
    int end = offset + 'limit;
    if end > total {
        end = total;
    }
    return [matches.slice(offset, end), total];
}
