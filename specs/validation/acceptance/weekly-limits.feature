Feature: Team weekly expense limits

  @story-8
  Rule: A manager states the team's weekly expense limit in plain language

    Scenario: Setting the weekly limit in plain language
      Given Morgan the manager has not set a weekly limit yet
      When Morgan states the weekly limit as "no more than $150 a week per person"
      Then the team's weekly limit shows as "150.00" per week

    Scenario: Restating the weekly limit changes it
      Given Morgan the manager's team weekly limit is "150.00" per week
      When Morgan states the weekly limit as "200 a week per person"
      Then the team's weekly limit shows as "200.00" per week

  @story-9
  Rule: An employee sees their team's weekly limit when submitting a claim, and a warning if they would go over it

    Scenario: Seeing the team's weekly limit while submitting
      Given Priya the employee's team weekly limit is "150.00" per week
      When she starts submitting a new claim
      Then she sees the team's weekly limit of "150.00" per week

    Scenario: Warned when a claim would exceed the weekly limit
      Given Priya the employee's team weekly limit is "150.00" per week and she has already claimed "120.00" this week
      When she submits a new claim for "50.00"
      Then she is warned that this claim puts her over the team's weekly limit

    Scenario: Submitting anyway after being warned
      Given Priya the employee has been warned that a new claim would put her over the team's weekly limit
      When she submits the claim anyway
      Then her claims list shows the new claim with status "pending"
