import { useEffect, useState, type JSX } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Chip, ListingTable, PageContent, PageTitle } from "@wso2/oxygen-ui";
import { expenseApi } from "../api";
import type { components } from "../generated/expense-api";

type ExpenseClaim = components["schemas"]["ExpenseClaim"];

function statusColor(status: ExpenseClaim["status"]): "warning" | "success" | "error" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "warning";
}

/**
 * TeamClaims — the manager's team queue. Clicking a row opens ClaimReview.
 *
 * The wireframe's "Employee" column has no name to join on: expense-api's
 * contract returns only `employeeId` (ExpenseClaim), and no operation in any
 * committed contract resolves an id to a display name (no user-directory
 * dependency is declared). The column is kept — dropping it entirely would be
 * worse than an id — showing `employeeId` rather than a name; see the report.
 */
export function TeamClaimsPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [claims, setClaims] = useState<ExpenseClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setClaims(null);
    setError(null);
    void expenseApi
      .GET("/me/team/expense-claims", { params: { query: { limit: 100 } } })
      .then(({ data, error: apiError }) => {
        if (!live) return;
        if (apiError) {
          setError("Could not load the team's claims.");
          return;
        }
        setClaims(data?.data ?? []);
      })
      .catch(() => {
        if (live) setError("Could not load the team's claims.");
      });
    return () => {
      live = false;
    };
  }, [location.key]);

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Team Claims</PageTitle.Header>
      </PageTitle>

      <ListingTable.Container>
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Employee</ListingTable.Cell>
              <ListingTable.Cell>Date</ListingTable.Cell>
              <ListingTable.Cell>Merchant</ListingTable.Cell>
              <ListingTable.Cell>Amount</ListingTable.Cell>
              <ListingTable.Cell>Status</ListingTable.Cell>
            </ListingTable.Row>
          </ListingTable.Head>
          <ListingTable.Body>
            {error ? (
              <ListingTable.Row>
                <ListingTable.Cell colSpan={5}>{error}</ListingTable.Cell>
              </ListingTable.Row>
            ) : claims === null ? (
              <ListingTable.Row>
                <ListingTable.Cell colSpan={5}>Loading…</ListingTable.Cell>
              </ListingTable.Row>
            ) : claims.length === 0 ? (
              <ListingTable.Row>
                <ListingTable.Cell colSpan={5}>
                  <ListingTable.EmptyState
                    title="No claims yet"
                    description="Your team has not submitted any expense claims."
                  />
                </ListingTable.Cell>
              </ListingTable.Row>
            ) : (
              claims.map((claim) => (
                <ListingTable.Row
                  key={claim.id}
                  clickable
                  onClick={() => navigate(`/team/claims/${claim.id}`)}
                >
                  <ListingTable.Cell>{claim.employeeId}</ListingTable.Cell>
                  <ListingTable.Cell>{claim.expenseDate}</ListingTable.Cell>
                  <ListingTable.Cell>{claim.merchant}</ListingTable.Cell>
                  <ListingTable.Cell>
                    {claim.amount.toFixed(2)} {claim.currency}
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <Chip label={claim.status} color={statusColor(claim.status)} size="small" />
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))
            )}
          </ListingTable.Body>
        </ListingTable>
      </ListingTable.Container>
    </PageContent>
  );
}
