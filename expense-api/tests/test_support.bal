// Shared test setup. Every assertion this suite sends is minted with the throwaway RSA
// keypair under tests/resources/ — never a real gateway. The three GATEWAY_ASSERTION_*
// env vars must be exported before `bal test` runs (see the ballerina skill): they are
// read once, at AssertionInterceptor construction, from the process environment.

import ballerina/http;
import ballerina/jwt;
import ballerina/test;

const string TEST_ISSUER = "test-gateway";
const string TEST_HEADER = "x-jwt-assertion";
const string GATEWAY_KEY_FILE = "tests/resources/gateway-key.pem";
const string OTHER_KEY_FILE = "tests/resources/other-key.pem";

final http:Client testClient = check new ("http://localhost:9090");

@test:BeforeSuite
function setUpStore() {
    claimStore = new InMemoryClaimStore();
}

# Mints a gateway assertion signed with the given private key file, naming the caller.
#
# + userId - the assertion's `sub`
# + username - the assertion's `username` claim
# + orgHandle - the assertion's `ouHandle` claim
# + scopes - the whole handles to put on the `scope` claim, space-separated
# + keyFile - which private key to sign with — the real gateway key unless a test wants a
#             signature this service must not trust
# + return - the signed JWT
function mintAssertion(string userId, string username, string orgHandle, string[] scopes,
        string keyFile = GATEWAY_KEY_FILE) returns string {
    string scopeClaim = "";
    foreach int i in 0 ..< scopes.length() {
        scopeClaim = i == 0 ? scopes[i] : scopeClaim + " " + scopes[i];
    }
    jwt:IssuerConfig config = {
        issuer: TEST_ISSUER,
        username: userId,
        expTime: 300,
        customClaims: {
            "username": username,
            "ouHandle": orgHandle,
            "scope": scopeClaim
        },
        signatureConfig: {
            algorithm: jwt:RS256,
            config: {keyFile: keyFile, keyPassword: ""}
        }
    };
    string|jwt:Error token = jwt:issue(config);
    if token is jwt:Error {
        test:assertFail("failed to mint test assertion: " + token.message());
    }
    return token;
}

function authHeaders(string token) returns map<string|string[]> {
    return {[TEST_HEADER]: token};
}
