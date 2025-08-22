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

@negative
Scenario Outline: Belanja grosir dengan payment "<payment-method>"
  Given Customer on Belanja page at Bersama Apps
  When Select product
  And Select quantity in product
  And Select type product 
  And Add to cart
  And click confirmation payment "<payment-method>"
  Then Summary will be display total product
  Examples:
    | payment-method      |
    | limit kredit        |
    | saldo bersama       |
    | cash                |
    | cash + limit kredit |
