screen MyClaims "An employee's own submitted claims and their status"
  navbar "Expense Claims"
  sidebar "My Claims -> MyClaims | New Claim -> NewClaimUpload"
  row
    heading "My Claims"
    right
    button "New Claim" primary -> NewClaimUpload
  table "Date | Merchant | Amount | Category | Status"
    row "2026-09-12 | Uber | 24.50 | Travel | pending"
    row "2026-09-08 | Staples | 41.00 | Supplies | approved"
    row "2026-09-01 | Diner | 68.20 | Meals | rejected"

screen NewClaimUpload "Employee photographs or picks a receipt to start a claim"
  navbar "Expense Claims"
  sidebar "My Claims -> MyClaims | New Claim -> NewClaimUpload"
  heading "New Expense Claim"
  text "Upload a photo of your receipt"
  image "Receipt Photo"
  row
    button "Cancel" -> MyClaims
    right
    button "Continue" primary -> NewClaimReview

screen NewClaimReview "Employee reviews the agent's pre-filled details before submitting"
  navbar "Expense Claims"
  sidebar "My Claims -> MyClaims | New Claim -> NewClaimUpload"
  heading "Review Claim Details"
  card "Weekly limit | 150.00 | your team's limit so far this week: 120.00"
  badge "Over weekly limit" warning
  input "Amount"
  input "Merchant"
  input "Date"
  select "Category"
  image "Receipt Photo"
  row
    button "Cancel" -> MyClaims
    right
    button "Submit Claim" primary -> MyClaims

screen TeamClaims "A manager's queue of their team's submitted claims"
  navbar "Expense Claims"
  sidebar "Team Claims -> TeamClaims | Weekly Limit -> WeeklyLimit"
  heading "Team Claims"
  table "Employee | Date | Merchant | Amount | Status" -> ClaimReview
    row "Jane Doe | 2026-09-12 | Uber | 24.50 | pending"
    row "Sam Lee | 2026-09-10 | Staples | 41.00 | pending"

screen ClaimReview "A manager decides one claim"
  navbar "Expense Claims"
  sidebar "Team Claims -> TeamClaims | Weekly Limit -> WeeklyLimit"
  heading "Claim from Jane Doe"
  text "Uber - 24.50 - 2026-09-12 - Travel"
  badge "Over weekly limit" warning
  image "Receipt Photo"
  textarea "Comment (optional)"
  row
    button "Reject" danger -> TeamClaims
    right
    button "Approve" primary -> TeamClaims

screen WeeklyLimit "A manager states the team's weekly expense limit in plain language"
  navbar "Expense Claims"
  sidebar "Team Claims -> TeamClaims | Weekly Limit -> WeeklyLimit"
  heading "Team Weekly Limit"
  text "Current limit: 150.00 per week"
  textarea "Describe the weekly limit, e.g. \"no more than $150 a week per person\""
  row
    right
    button "Save" primary

flow "Submit and track claims"
  role "Employee"
  description "An employee submits a receipt, reviews the pre-filled claim, and tracks its status"
  MyClaims
  NewClaimUpload
  NewClaimReview

flow "Review team claims"
  role "Manager"
  description "A manager reviews the team's claims, decides them, and sets the team's weekly limit"
  TeamClaims
  ClaimReview
  WeeklyLimit
