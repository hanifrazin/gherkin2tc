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
Scenario Outline: Invalid login "<case>"
  Given I am on login page
  When I input username "<u>"
  And I input password "<p>"
  Then I see an error message
  Examples:
    | case   | u     | p     |
    | case 1 | user1 | wrong |
    | case 2 |       | pass  |
