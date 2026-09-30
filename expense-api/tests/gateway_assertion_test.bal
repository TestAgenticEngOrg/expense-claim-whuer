// The four cases the `ballerina` skill asks for: a valid assertion is accepted, one signed
// by a different key is a 401, one tampered with after signing is a 401 (never anonymous),
// and a `security: []` resource (here, /health) answers 200 with no assertion at all.

import ballerina/http;
import ballerina/test;

@test:Config {}
function testValidAssertionIsAccepted() returns error? {
    claimStore = new InMemoryClaimStore();
    string token = mintAssertion("emp-valid", "priya", "org-a", ["claims:read"]);
    http:Response res = check testClient->get("/me/expense-claims", authHeaders(token));
    test:assertEquals(res.statusCode, 200);
}

@test:Config {}
function testAssertionSignedByDifferentKeyIs401() returns error? {
    claimStore = new InMemoryClaimStore();
    string token = mintAssertion("emp-valid", "priya", "org-a", ["claims:read"], keyFile = OTHER_KEY_FILE);
    http:Response res = check testClient->get("/me/expense-claims", authHeaders(token));
    test:assertEquals(res.statusCode, 401);
}

@test:Config {}
function testTamperedAssertionIs401() returns error? {
    claimStore = new InMemoryClaimStore();
    string valid = mintAssertion("emp-valid", "priya", "org-a", ["claims:read"]);
    string tampered = tamperPayload(valid);
    http:Response res = check testClient->get("/me/expense-claims", authHeaders(tampered));
    test:assertEquals(res.statusCode, 401);
}

@test:Config {}
function testPublicResourceNeedsNoAssertion() returns error? {
    http:Response res = check testClient->get("/health");
    test:assertEquals(res.statusCode, 200);
}

# Flips one character inside the JWT's payload segment so the decoded claims change but the
# signature (computed over the original bytes) no longer matches — never touches the header
# or signature segments themselves.
function tamperPayload(string token) returns string {
    string[] parts = re `\.`.split(token);
    string payload = parts[1];
    string lastChar = payload.substring(payload.length() - 1, payload.length());
    string replacement = lastChar == "A" ? "B" : "A";
    string newPayload = payload.substring(0, payload.length() - 1) + replacement;
    return parts[0] + "." + newPayload + "." + parts[2];
}
