@P1
Feature: Login

Background:
  Given app is installed

@happy @smoke
Scenario: Successful login
  Given I am on login page
  When I input username "user"
  And I input password "pass"
  Then I see dashboard
  And I see greeting

@negative
Scenario Outline: Invalid login
  Given I am on login page
  When I input username "<u>"
  And I input password "<p>"
  Then I see an error message
  Examples:
    | u     | p     |
    | user1 | wrong |
    |      | pass  |
