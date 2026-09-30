// End-to-end coverage against the running service (tests/test_support.bal wires the
// http:Client and the assertion minting), exercising the acceptance scenarios in
// specs/validation/acceptance/expense-claims.feature and weekly-limits.feature — with the
// team-scoping design decision this component implements: the caller's `orgHandle` IS the
// team identifier, since no directory/groups claim reaches this service.

import ballerina/http;
import ballerina/test;

const string EMP_A = "employee-priya";
const string EMP_B = "employee-sam";
const string EMP_DANA = "employee-dana";
const string ORG_A = "org-morgan-team";
const string ORG_B = "org-other-team";

function submitClaim(string employeeId, string orgHandle, decimal amount, string merchant) returns json {
    string token = mintAssertion(employeeId, employeeId, orgHandle, ["claims:submit"]);
    json payload = {
        amount: amount,
        currency: "USD",
        merchant: merchant,
        expenseDate: "2026-09-15",
        category: "travel",
        receiptImageUrl: "https://example.com/receipt.jpg"
    };
    http:Response|error res = testClient->post("/me/expense-claims", payload, authHeaders(token));
    if res is error {
        test:assertFail("submit failed: " + res.message());
    }
    test:assertEquals(res.statusCode, 201);
    json|error body = res.getJsonPayload();
    if body is error {
        test:assertFail("no json body: " + body.message());
    }
    return body;
}

@test:Config {}
function testEmployeeSeesOwnSubmittedClaimAsPending() returns error? {
    claimStore = new InMemoryClaimStore();
    json created = submitClaim(EMP_A, ORG_A, 24.50d, "Uber");
    test:assertEquals(check created.status, "pending");
    test:assertEquals(check created.merchant, "Uber");

    string token = mintAssertion(EMP_A, EMP_A, ORG_A, ["claims:read"]);
    http:Response listRes = check testClient->get("/me/expense-claims", authHeaders(token));
    test:assertEquals(listRes.statusCode, 200);
    json page = check listRes.getJsonPayload();
    json[] data = check page.data.ensureType();
    test:assertEquals(data.length(), 1);
    test:assertEquals(check data[0].merchant, "Uber");
}

@test:Config {}
function testEmployeeDoesNotSeeAnotherEmployeesClaim() returns error? {
    claimStore = new InMemoryClaimStore();
    _ = submitClaim(EMP_A, ORG_A, 24.50d, "Uber");

    string samToken = mintAssertion(EMP_B, EMP_B, ORG_A, ["claims:read"]);
    http:Response res = check testClient->get("/me/expense-claims", authHeaders(samToken));
    test:assertEquals(res.statusCode, 200);
    json page = check res.getJsonPayload();
    test:assertEquals(check page.count, 0);
}

@test:Config {}
function testManagerSeesOwnTeamsClaimsNotAnotherTeams() returns error? {
    claimStore = new InMemoryClaimStore();
    _ = submitClaim(EMP_A, ORG_A, 24.50d, "Uber");
    _ = submitClaim(EMP_DANA, ORG_B, 68.20d, "Diner");

    string managerToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["claims:review-team"]);
    http:Response res = check testClient->get("/me/team/expense-claims", authHeaders(managerToken));
    test:assertEquals(res.statusCode, 200);
    json page = check res.getJsonPayload();
    json[] data = check page.data.ensureType();
    test:assertEquals(data.length(), 1);
    test:assertEquals(check data[0].merchant, "Uber");
}

@test:Config {}
function testManagerApprovesClaimWithCommentAndEmployeeSeesIt() returns error? {
    claimStore = new InMemoryClaimStore();
    json created = submitClaim(EMP_A, ORG_A, 24.50d, "Uber");
    string claimId = check created.id;

    string managerToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["claims:approve"]);
    http:Response approveRes = check testClient->post("/me/team/expense-claims/" + claimId + "/approve",
        {comment: "Looks good"}, authHeaders(managerToken));
    test:assertEquals(approveRes.statusCode, 200);
    json approved = check approveRes.getJsonPayload();
    test:assertEquals(check approved.status, "approved");
    test:assertEquals(check approved.managerComment, "Looks good");

    string empToken = mintAssertion(EMP_A, EMP_A, ORG_A, ["claims:read"]);
    http:Response listRes = check testClient->get("/me/expense-claims", authHeaders(empToken));
    json page = check listRes.getJsonPayload();
    json[] data = check page.data.ensureType();
    test:assertEquals(check data[0].status, "approved");
}

@test:Config {}
function testManagerRejectsClaimWithComment() returns error? {
    claimStore = new InMemoryClaimStore();
    json created = submitClaim(EMP_A, ORG_A, 68.20d, "Diner");
    string claimId = check created.id;

    string managerToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["claims:reject"]);
    http:Response rejectRes = check testClient->post("/me/team/expense-claims/" + claimId + "/reject",
        {comment: "Missing itemization"}, authHeaders(managerToken));
    test:assertEquals(rejectRes.statusCode, 200);
    json rejected = check rejectRes.getJsonPayload();
    test:assertEquals(check rejected.status, "rejected");
}

@test:Config {}
function testApproveOnAnotherTeamsClaimIs404NotForbidden() returns error? {
    claimStore = new InMemoryClaimStore();
    json created = submitClaim(EMP_DANA, ORG_B, 68.20d, "Diner");
    string claimId = check created.id;

    // Morgan manages ORG_A, this claim belongs to ORG_B.
    string managerToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["claims:approve"]);
    http:Response res = check testClient->post("/me/team/expense-claims/" + claimId + "/approve",
        (), authHeaders(managerToken));
    test:assertEquals(res.statusCode, 404);
}

@test:Config {}
function testApproveUnknownClaimIs404() returns error? {
    claimStore = new InMemoryClaimStore();
    string managerToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["claims:approve"]);
    http:Response res = check testClient->post("/me/team/expense-claims/does-not-exist/approve",
        (), authHeaders(managerToken));
    test:assertEquals(res.statusCode, 404);
}

@test:Config {}
function testSubmitWithNonPositiveAmountIs400() returns error? {
    claimStore = new InMemoryClaimStore();
    string token = mintAssertion(EMP_A, EMP_A, ORG_A, ["claims:submit"]);
    json payload = {
        amount: 0,
        currency: "USD",
        merchant: "Uber",
        expenseDate: "2026-09-15",
        category: "travel",
        receiptImageUrl: "https://example.com/receipt.jpg"
    };
    http:Response res = check testClient->post("/me/expense-claims", payload, authHeaders(token));
    test:assertEquals(res.statusCode, 400);
}

@test:Config {}
function testManagerSetsWeeklyLimitInPlainLanguageAndItRoundTrips() returns error? {
    claimStore = new InMemoryClaimStore();
    string managerToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["weekly-limit:set"]);
    json payload = {naturalLanguageText: "no more than $150 a week per person", amountPerWeek: 150.00, currency: "USD"};
    http:Response putRes = check testClient->put("/me/team/weekly-limit", payload, authHeaders(managerToken));
    test:assertEquals(putRes.statusCode, 200);
    json saved = check putRes.getJsonPayload();
    test:assertEquals(check saved.amountPerWeek, 150.00d);

    string readToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["weekly-limit:read"]);
    http:Response getRes = check testClient->get("/me/team/weekly-limit", authHeaders(readToken));
    test:assertEquals(getRes.statusCode, 200);
    json fetched = check getRes.getJsonPayload();
    test:assertEquals(check fetched.amountPerWeek, 150.00d);

    // Restating changes it.
    json restatement = {naturalLanguageText: "200 a week per person", amountPerWeek: 200.00, currency: "USD"};
    http:Response putRes2 = check testClient->put("/me/team/weekly-limit", restatement, authHeaders(managerToken));
    json saved2 = check putRes2.getJsonPayload();
    test:assertEquals(check saved2.amountPerWeek, 200.00d);
}

@test:Config {}
function testEmployeeCanReadTeamWeeklyLimitEvenThoughPathIsUnderMeTeam() returns error? {
    claimStore = new InMemoryClaimStore();
    string managerToken = mintAssertion("manager-morgan", "morgan", ORG_A, ["weekly-limit:set"]);
    json payload = {naturalLanguageText: "no more than $150 a week per person", amountPerWeek: 150.00, currency: "USD"};
    http:Response putRes = check testClient->put("/me/team/weekly-limit", payload, authHeaders(managerToken));
    test:assertEquals(putRes.statusCode, 200);

    string employeeToken = mintAssertion(EMP_A, EMP_A, ORG_A, ["weekly-limit:read"]);
    http:Response getRes = check testClient->get("/me/team/weekly-limit", authHeaders(employeeToken));
    test:assertEquals(getRes.statusCode, 200);
    json fetched = check getRes.getJsonPayload();
    test:assertEquals(check fetched.amountPerWeek, 150.00d);
}

@test:Config {}
function testWeeklyLimitNotYetSetIs404() returns error? {
    claimStore = new InMemoryClaimStore();
    string token = mintAssertion(EMP_A, EMP_A, "org-with-no-limit-yet", ["weekly-limit:read"]);
    http:Response res = check testClient->get("/me/team/weekly-limit", authHeaders(token));
    test:assertEquals(res.statusCode, 404);
}
