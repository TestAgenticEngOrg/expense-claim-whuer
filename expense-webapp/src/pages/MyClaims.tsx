import { useEffect, useState, type JSX } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Chip, ListingTable, PageContent, PageTitle } from "@wso2/oxygen-ui";
import { Plus } from "@wso2/oxygen-ui-icons-react";
import { Can } from "../authz/gates";
import { expenseApi } from "../api";
import type { components } from "../generated/expense-api";

type ExpenseClaim = components["schemas"]["ExpenseClaim"];

function statusColor(status: ExpenseClaim["status"]): "warning" | "success" | "error" {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  return "warning";
}

/**
 * MyClaims — an employee's own claims and their status.
 * Re-fetches every time this screen is opened (on the `location.key`), so a
 * claim a manager just decided shows its outcome with no separate
 * notification channel (the issue's own wording, and story 7).
 */
export function MyClaimsPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [claims, setClaims] = useState<ExpenseClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setClaims(null);
    setError(null);
    void expenseApi
      .GET("/me/expense-claims", { params: { query: { limit: 100 } } })
      .then(({ data, error: apiError }) => {
        if (!live) return;
        if (apiError) {
          setError("Could not load your claims.");
          return;
        }
        setClaims(data?.data ?? []);
      })
      .catch(() => {
        if (live) setError("Could not load your claims.");
      });
    return () => {
      live = false;
    };
  }, [location.key]);

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>My Claims</PageTitle.Header>
        <PageTitle.Actions>
          {/* NewClaimUpload's own gate: GET /me/expense-claims — the same
              operation the Employee's whole claim flow shares (screens.ts). */}
          <Can op="GET /me/expense-claims">
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => navigate("/claims/new")}>
              New Claim
            </Button>
          </Can>
        </PageTitle.Actions>
      </PageTitle>

      <ListingTable.Container>
        <ListingTable>
          <ListingTable.Head>
            <ListingTable.Row>
              <ListingTable.Cell>Date</ListingTable.Cell>
              <ListingTable.Cell>Merchant</ListingTable.Cell>
              <ListingTable.Cell>Amount</ListingTable.Cell>
              <ListingTable.Cell>Category</ListingTable.Cell>
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
                    description="Submit a receipt to create your first expense claim."
                  />
                </ListingTable.Cell>
              </ListingTable.Row>
            ) : (
              claims.map((claim) => (
                <ListingTable.Row key={claim.id}>
                  <ListingTable.Cell>{claim.expenseDate}</ListingTable.Cell>
                  <ListingTable.Cell>{claim.merchant}</ListingTable.Cell>
                  <ListingTable.Cell>
                    {claim.amount.toFixed(2)} {claim.currency}
                  </ListingTable.Cell>
                  <ListingTable.Cell>{claim.category}</ListingTable.Cell>
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
