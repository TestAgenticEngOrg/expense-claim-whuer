// The real `ClaimStore`, backed by the `expense-db` platform-resource (postgres-cnpg).
//
// The connection is opened lazily, on the first call any resource makes into the store,
// never at module init: `config.bal`'s five env vars can be empty at compile time (a build
// never executes this module at all), and this keeps that true of `bal test` too — the
// module-level `claimStore` variable in store.bal constructs this class with no I/O, so
// swapping it for an in-memory double in a test never has to race a real connection attempt.

import ballerina/sql;
import ballerinax/postgresql;
import ballerinax/postgresql.driver as _;

public class PostgresClaimStore {
    *ClaimStore;

    private postgresql:Client? dbClient = ();

    private function connection() returns postgresql:Client|error {
        postgresql:Client? existing = self.dbClient;
        if existing is postgresql:Client {
            return existing;
        }
        int port = resolveDbPort();
        postgresql:Client newClient = check new (
            host = expenseDbHost == "" ? "localhost" : expenseDbHost,
            username = expenseDbUser == "" ? "postgres" : expenseDbUser,
            password = expenseDbPassword,
            database = expenseDbName == "" ? "postgres" : expenseDbName,
            port = port
        );
        check initSchema(newClient);
        self.dbClient = newClient;
        return newClient;
    }

    public function insertClaim(ClaimRow row) returns ClaimRow|error {
        postgresql:Client dbClient = check self.connection();
        sql:ParameterizedQuery q = `INSERT INTO expense_claims
            (id, employee_id, org_handle, amount, currency, merchant, expense_date, category,
             receipt_image_url, status, manager_comment, created_at)
            VALUES (${row.id}, ${row.employeeId}, ${row.orgHandle}, ${row.amount}, ${row.currency},
                    ${row.merchant}, ${row.expenseDate}, ${row.category}, ${row.receiptImageUrl},
                    ${row.status}, ${row.managerComment}, ${row.createdAt})`;
        sql:ExecutionResult _ = check dbClient->execute(q);
        return row;
    }

    public function claimsByEmployee(string employeeId, string? status, int 'limit, int offset) returns [ClaimRow[], int]|error {
        sql:ParameterizedQuery filter = status is string
            ? `WHERE employee_id = ${employeeId} AND status = ${status}`
            : `WHERE employee_id = ${employeeId}`;
        return self.page(filter, 'limit, offset);
    }

    public function claimsByOrg(string orgHandle, string? status, int 'limit, int offset) returns [ClaimRow[], int]|error {
        sql:ParameterizedQuery filter = status is string
            ? `WHERE org_handle = ${orgHandle} AND status = ${status}`
            : `WHERE org_handle = ${orgHandle}`;
        return self.page(filter, 'limit, offset);
    }

    private function page(sql:ParameterizedQuery filter, int 'limit, int offset) returns [ClaimRow[], int]|error {
        postgresql:Client dbClient = check self.connection();
        sql:ParameterizedQuery countQ = sql:queryConcat(`SELECT COUNT(*) AS count FROM expense_claims `, filter);
        record {| int count; |} countRow = check dbClient->queryRow(countQ);
        sql:ParameterizedQuery dataQ = sql:queryConcat(claimColumnsQuery(), filter,
            ` ORDER BY created_at DESC LIMIT ${'limit} OFFSET ${offset}`);
        stream<ClaimRow, sql:Error?> rowStream = dbClient->query(dataQ);
        ClaimRow[] rows = [];
        check from ClaimRow r in rowStream
            do {
                rows.push(r);
            };
        check rowStream.close();
        return [rows, countRow.count];
    }

    public function claimById(string id) returns ClaimRow?|error {
        postgresql:Client dbClient = check self.connection();
        sql:ParameterizedQuery q = sql:queryConcat(claimColumnsQuery(), `WHERE id = ${id}`);
        ClaimRow|sql:Error row = dbClient->queryRow(q);
        if row is sql:NoRowsError {
            return ();
        }
        if row is sql:Error {
            return row;
        }
        return row;
    }

    public function decideClaim(string id, string status, string? managerComment) returns ClaimRow?|error {
        postgresql:Client dbClient = check self.connection();
        sql:ParameterizedQuery q = `UPDATE expense_claims SET status = ${status}, manager_comment = ${managerComment}
            WHERE id = ${id}`;
        sql:ExecutionResult result = check dbClient->execute(q);
        int? affected = result.affectedRowCount;
        if affected is () || affected == 0 {
            return ();
        }
        return self.claimById(id);
    }

    public function weeklyLimit(string orgHandle) returns WeeklyLimitRow?|error {
        postgresql:Client dbClient = check self.connection();
        sql:ParameterizedQuery q = `SELECT org_handle AS "orgHandle", natural_language_text AS "naturalLanguageText",
            amount_per_week AS "amountPerWeek", currency, updated_at AS "updatedAt"
            FROM weekly_limits WHERE org_handle = ${orgHandle}`;
        WeeklyLimitRow|sql:Error row = dbClient->queryRow(q);
        if row is sql:NoRowsError {
            return ();
        }
        if row is sql:Error {
            return row;
        }
        return row;
    }

    public function saveWeeklyLimit(WeeklyLimitRow row) returns WeeklyLimitRow|error {
        postgresql:Client dbClient = check self.connection();
        sql:ParameterizedQuery q = `INSERT INTO weekly_limits
                (org_handle, natural_language_text, amount_per_week, currency, updated_at)
            VALUES (${row.orgHandle}, ${row.naturalLanguageText}, ${row.amountPerWeek}, ${row.currency}, ${row.updatedAt})
            ON CONFLICT (org_handle) DO UPDATE SET
                natural_language_text = EXCLUDED.natural_language_text,
                amount_per_week = EXCLUDED.amount_per_week,
                currency = EXCLUDED.currency,
                updated_at = EXCLUDED.updated_at`;
        sql:ExecutionResult _ = check dbClient->execute(q);
        return row;
    }
}

function claimColumnsQuery() returns sql:ParameterizedQuery {
    return `SELECT id, employee_id AS "employeeId", org_handle AS "orgHandle", amount, currency, merchant,
        expense_date AS "expenseDate", category, receipt_image_url AS "receiptImageUrl", status,
        manager_comment AS "managerComment", created_at AS "createdAt"
        FROM expense_claims `;
}

function resolveDbPort() returns int {
    string raw = expenseDbPort.trim();
    if raw == "" {
        return 5432;
    }
    int|error parsed = int:fromString(raw);
    if parsed is int {
        return parsed;
    }
    return 5432;
}

function initSchema(postgresql:Client dbClient) returns error? {
    sql:ExecutionResult _ = check dbClient->execute(`CREATE TABLE IF NOT EXISTS expense_claims (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        org_handle TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        merchant TEXT NOT NULL,
        expense_date TEXT NOT NULL,
        category TEXT NOT NULL,
        receipt_image_url TEXT NOT NULL,
        status TEXT NOT NULL,
        manager_comment TEXT,
        created_at TEXT NOT NULL
    )`);
    sql:ExecutionResult _ = check dbClient->execute(`CREATE INDEX IF NOT EXISTS expense_claims_employee_idx
        ON expense_claims (employee_id)`);
    sql:ExecutionResult _ = check dbClient->execute(`CREATE INDEX IF NOT EXISTS expense_claims_org_idx
        ON expense_claims (org_handle)`);
    sql:ExecutionResult _ = check dbClient->execute(`CREATE TABLE IF NOT EXISTS weekly_limits (
        org_handle TEXT PRIMARY KEY,
        natural_language_text TEXT NOT NULL,
        amount_per_week NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )`);
}
