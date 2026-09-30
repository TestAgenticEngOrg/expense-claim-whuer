// Wire types for the Expense API contract (specs/design/components/expense-api/openapi.yaml).
// Hand-maintained from the `bal openapi --mode service` scaffold: date/date-time fields keep
// the `string` shape the generator falls back to (unsupported `format`), and a couple of
// per-status response wrappers were added where the scaffold left the default 200 status.

import ballerina/http;

public type Error record {|
    # HTTP or application error code
    int code;
    # short human-readable label
    string message;
    # detailed explanation
    string description?;
    # URI to documentation
    string moreInfo?;
|};

public type ErrorBadRequest record {|
    *http:BadRequest;
    Error body;
|};

public type ErrorUnauthorized record {|
    *http:Unauthorized;
    Error body;
|};

public type ErrorNotFound record {|
    *http:NotFound;
    Error body;
|};

public type ExpenseClaim record {|
    string id;
    string employeeId;
    decimal amount;
    string currency;
    string merchant;
    string expenseDate;
    string category;
    string receiptImageUrl;
    "pending"|"approved"|"rejected" status;
    string? managerComment?;
    string createdAt;
|};

public type ExpenseClaimCreated record {|
    *http:Created;
    ExpenseClaim body;
|};

public type ExpenseClaimOk record {|
    *http:Ok;
    ExpenseClaim body;
|};

public type NewExpenseClaim record {|
    decimal amount;
    string currency;
    string merchant;
    string expenseDate;
    string category;
    string receiptImageUrl;
|};

public type ClaimDecision record {|
    string? comment?;
|};

public type ExpenseClaimPage record {|
    # total matching items
    int count;
    # relative URI of the next page
    string? next = ();
    # relative URI of the previous page
    string? previous = ();
    ExpenseClaim[] data;
|};

public type WeeklyLimit record {|
    string naturalLanguageText;
    decimal amountPerWeek;
    string currency;
    string updatedAt;
|};

public type NewWeeklyLimit record {|
    string naturalLanguageText;
    decimal amountPerWeek;
    string currency;
|};
