@P1
Feature: Login

Background:
  Given app is installed

Scenario: Successful payment product using Virtual Account
Scenario: Successful payment product using Bank Transfer

Background:
  Given user has already e-wallet
Scenario: Successful payment product using e-wallet
Scenario: Successful payment product using pay later

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
    | code | name   | price |
    | P01  | Apple  | 1000  |
    | P02  | Orange | 2000  |
  Then I should see "Apple" with price 1000
    | code | name   | price |
    | P01  | Apple  | 1000  |
    | P02  | Orange | 2000  |

  Examples:
    | code | name   | price  |
    | P01  | Apple  | 100000 |
    | P02  | Orange | 150000 |

@positive @addProducts @list @search @smoke @happy
Rule: Successful login
  Scenario: Valid username and password
    Given I am on the login page
    When I input valid credentials
    Then I see the dashboard

@positive @addProducts @list @search @smoke @happy
Rule: Invalid login
  Scenario: Wrong password
    Given I am on the login page
    When I input invalid password
    Then I see an error message

@negative @addProducts @list @search @smoke @happy
Rule: There can be only One

  Example: Only One -- More than one alive
    Given there are 3 ninjas
    And there are more than one ninja alive
    When 2 ninjas meet, they will fight
    Then one ninja dies (but not me)
    And there is one ninja less alive

  Scenario: Only One -- One alive
    Given there is only 1 ninja alive
    Then they will live forever ;-)
