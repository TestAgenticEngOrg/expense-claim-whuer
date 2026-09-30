Feature: Expense claims

  @story-1 @story-2
  Rule: An employee submits a claim with a receipt photo, pre-filled by an agent

    Scenario: Submitting a claim from a receipt photo
      Given Priya the employee has photographed a receipt from "Uber" for "24.50"
      When she submits it as an expense claim
      Then her claims list shows a claim from "Uber" for "24.50" with status "pending"

  @story-3
  Rule: The employee may correct the pre-filled details before submitting

    Scenario: Correcting a misread amount before submitting
      Given Priya the employee is reviewing a claim pre-filled with amount "24.50"
      When she corrects the amount to "42.50" before submitting
      Then her claims list shows the claim for "42.50", not "24.50"

  @story-4
  Rule: An employee sees the status of every claim they have submitted

    Scenario: Checking claim statuses
      Given Priya the employee has submitted a claim from "Uber" and a claim from "Staples"
      When she opens her claims list
      Then she sees the "Uber" claim and the "Staples" claim, each with its own status

  Rule: Only the submitting employee may see or follow their own claim

    @negative
    Scenario: A claim does not appear on another employee's list
      Given Priya the employee has submitted a claim from "Uber"
      When Sam the employee opens his own claims list
      Then Sam's claims list does not show the "Uber" claim

  @story-5
  Rule: A manager sees the claims submitted by their own team

    Scenario: Viewing the team's submitted claims
      Given Priya the employee, who reports to Morgan the manager, has submitted a claim from "Uber"
      When Morgan opens the team claims queue
      Then Morgan sees the "Uber" claim from Priya

    @negative
    Scenario: A manager does not see another team's claims
      Given Dana the employee, who reports to a different manager, has submitted a claim from "Diner"
      When Morgan the manager opens the team claims queue
      Then Morgan does not see the "Diner" claim

  @story-6
  Rule: A manager approves or rejects a submitted claim, optionally with a comment

    Scenario: Approving a claim
      Given Priya the employee has a pending claim from "Uber" for "24.50"
      When Morgan the manager approves it with the comment "Looks good"
      Then Priya's claim from "Uber" shows status "approved"

    Scenario: Rejecting a claim
      Given Priya the employee has a pending claim from "Diner" for "68.20"
      When Morgan the manager rejects it with the comment "Missing itemization"
      Then Priya's claim from "Diner" shows status "rejected"

  @story-7
  Rule: The employee is notified when their claim is approved or rejected

    Scenario: Notified after approval
      Given Priya the employee has a pending claim from "Uber"
      When Morgan the manager approves it
      Then Priya is notified that her "Uber" claim was approved
