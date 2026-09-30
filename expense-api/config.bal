// Config read from environment variables, in one place, by name.
//
// The `expense-db` platform-resource (postgres-cnpg) injects these five, wired verbatim
// from specs/design/components/expense-api/design.json's `envBindings`. Empty is a valid
// value here: the platform always supplies real ones at deploy time, and a build (which
// never executes this module) never reads them at all.

import ballerina/os;

configurable string expenseDbHost = os:getEnv("EXPENSE_DB_HOST");
configurable string expenseDbPort = os:getEnv("EXPENSE_DB_PORT");
configurable string expenseDbName = os:getEnv("EXPENSE_DB_DBNAME");
configurable string expenseDbUser = os:getEnv("EXPENSE_DB_USER");
configurable string expenseDbPassword = os:getEnv("EXPENSE_DB_PASSWORD");
