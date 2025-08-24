@P1
Feature: Login

Background:
  Given app is installed

@happy @smoke @positive @P0 @staging @production
Scenario: Successful login "pengguna"
  Given I am on login page
  When I input username "user"
  And I input password "pass"
  Then I see dashboard
  And I see greeting

@sanity @negative @staging @development
Scenario Outline: Invalid login "<case>"
  Given I am on login page
  When I input username "<u>"
  And I input password "<p>"
  Then I see an error message
  Examples:
    | case   | u     | p     |
    | case 1 | user1 | wrong |
    | case 2 |       | pass  |

@production @mvp @P0 @negative @belanja @payment @smoke @happy
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

@positive @addProducts @list @search @smoke @happy
Scenario: Add new products
  Given the following products are available:
    | code | name   | price |
    | P01  | Apple  | 1000  |
    | P02  | Orange | 2000  |
  When I search product "P01"
  Then I should see "Apple" with price 1000

  Examples:
    | code | name   | price  |
    | P01  | Apple  | 100000 |
    | P02  | Orange | 150000 |

  Rule: Successful login
    Scenario: Valid username and password
      Given I am on the login page
      When I input valid credentials
      Then I see the dashboard

  Rule: Invalid login
    Scenario: Wrong password
      Given I am on the login page
      When I input invalid password
      Then I see an error message