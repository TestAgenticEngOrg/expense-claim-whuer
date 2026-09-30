// The persistence boundary. `ClaimStore` is an abstract object type — an interface — so
// the HTTP layer never names `postgresql:Client` directly, and a test can swap `claimStore`
// (below) for an in-memory implementation of the same shape without touching a resource.
//
// Team scoping design decision (this component's issue, not the PRD's literal words): the
// gateway's signed assertion carries only userId/username/scopes/orgHandle — no directory
// groups claim reaches this service, and no directory/org-service dependency is wired. So
// `orgHandle` IS the team identifier here: every ExpenseClaim is stamped with the submitting
// employee's orgHandle, and WeeklyLimit is one row per orgHandle (one row per manager's team,
// per the domain model). A manager's `/me/team/...` endpoints and both weekly-limit operations
// resolve against the caller's own orgHandle and nothing else.

# One ExpenseClaim row, keyed by `id`.
#
# + id - primary key
# + employeeId - the submitting caller's `userId` (the assertion's `sub`) — never a username
# + orgHandle - the submitting caller's `orgHandle` at submission time — the team scoping key
# + amount - the claimed amount
# + currency - the claimed currency
# + merchant - the merchant name
# + expenseDate - the expense date, `YYYY-MM-DD`
# + category - the expense category
# + receiptImageUrl - a reference to the receipt image
# + status - `pending`, `approved` or `rejected`
# + managerComment - the deciding manager's optional comment
# + createdAt - RFC3339 creation timestamp
public type ClaimRow record {|
    string id;
    string employeeId;
    string orgHandle;
    decimal amount;
    string currency;
    string merchant;
    string expenseDate;
    string category;
    string receiptImageUrl;
    string status;
    string? managerComment;
    string createdAt;
|};

# One WeeklyLimit row, keyed by `orgHandle` — one row per manager's team.
#
# + orgHandle - the team scoping key
# + naturalLanguageText - the manager's original statement
# + amountPerWeek - the structured amount the limit-agent derived from it
# + currency - the limit's currency
# + updatedAt - RFC3339 timestamp of the last write
public type WeeklyLimitRow record {|
    string orgHandle;
    string naturalLanguageText;
    decimal amountPerWeek;
    string currency;
    string updatedAt;
|};

# The persistence interface every resource calls through. `claimStore` below holds the
# instance in use; a test reassigns it wholesale (it is a plain module variable, not `final`),
# following the "Creating a test double" pattern in the `ballerina/test` guide.
public type ClaimStore object {
    public function insertClaim(ClaimRow row) returns ClaimRow|error;
    public function claimsByEmployee(string employeeId, string? status, int 'limit, int offset) returns [ClaimRow[], int]|error;
    public function claimsByOrg(string orgHandle, string? status, int 'limit, int offset) returns [ClaimRow[], int]|error;
    public function claimById(string id) returns ClaimRow?|error;
    public function decideClaim(string id, string status, string? managerComment) returns ClaimRow?|error;
    public function weeklyLimit(string orgHandle) returns WeeklyLimitRow?|error;
    public function saveWeeklyLimit(WeeklyLimitRow row) returns WeeklyLimitRow|error;
};

# The store every resource uses. Defaults to the real Postgres-backed implementation;
# swapped for an in-memory one in tests.
ClaimStore claimStore = new PostgresClaimStore();
