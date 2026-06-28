@feature @checkout @ewallet
Feature: Checkout with E-Wallet
  As a registered user
  I want to pay using my e-wallet
  So that I can complete purchases quickly and securely

  Background:
    Given the app is installed
    And I am a registered user
    And I am on the checkout page with items in the cart

  # =====================
  # P0 (Critical) Scenarios
  # =====================

  @P0 @positive @smoke
  Scenario: Successful checkout with sufficient balance
    Given my e-wallet balance is ">= total amount"
    When I select "E-Wallet" as payment method
    And I confirm the payment
    Then the payment is processed successfully
    And I see an order confirmation with a transaction ID
    And my e-wallet balance is deducted by the order total

  @P0 @negative @blocker
  Scenario Outline: Blocking validations for mandatory checkout fields
    Given my e-wallet balance is ">= total amount"
    And I have the following missing/invalid field "<field>"
    When I attempt to place the order
    Then I see a blocking validation error for "<field>"
    And the order is not created

    Examples: Decision Table - Mandatory Field Validations
      | field            |
      | shippingAddress  |
      | contactNumber    |
      | paymentMethod    |

  # =====================
  # P1 (High) Scenarios
  # =====================

  @P1 @positive
  Scenario: Retry once when gateway times out and then succeeds
    Given my e-wallet balance is ">= total amount"
    And the payment gateway will timeout on the first attempt
    When I select "E-Wallet" as payment method
    And I confirm the payment
    Then the system retries the payment automatically once
    And the payment succeeds on retry
    And I see an order confirmation with a transaction ID

  @P1 @negative
  Scenario: Fail payment when user cancels on confirmation dialog
    Given my e-wallet balance is ">= total amount"
    When I select "E-Wallet" as payment method
    And I cancel on the final confirmation dialog
    Then the payment is not processed
    And I remain on the checkout page
    And no order is created

  # =====================
  # P2 (Medium) Scenarios
  # =====================

  @P2 @negative
  Scenario Outline: Input validation messages for e-wallet PIN
    Given my e-wallet balance is ">= total amount"
    When I enter e-wallet PIN "<pin>"
    And I confirm the payment
    Then I see validation "<message>"
    And the payment is not processed

    Examples: Decision Table - PIN Validation
      | pin       | message                      |
      |           | PIN is required              |
      | 12        | PIN must be 6 digits         |
      | abc123    | PIN must be numeric          |
      | 000000    | PIN cannot be a trivial PIN  |

  @P2 @positive
  Scenario: Remember last used payment method (opt-in)
    Given I opted in to remember the last payment method
    And I previously completed a payment using "E-Wallet"
    When I revisit the checkout page
    Then "E-Wallet" is preselected as the payment method

  # =====================
  # P3 (Low) Scenarios
  # =====================

  @P3 @positive
  Scenario: Graceful handling when promo banner fails to load
    Given there is an intermittent error loading the promo banner
    When I open the checkout page
    Then the page still renders core checkout components
    And I can continue to place an order

  @P3 @negative
  Scenario: Non-blocking warning when network is slow
    Given my network latency is "high"
    When I proceed to payment
    Then I see a non-blocking warning "Your connection is slow"
    And I can still attempt the payment

  # =====================
  # Comprehensive Decision Table for Payment Outcomes
  # Use with Scenario Outline below to cover positive & negative paths in one matrix.
  # =====================

  @matrix @P0 @P1 @positive @negative
  Scenario Outline: E-Wallet payment outcomes matrix
    Given I have a cart total of "<amount>"
    And my e-wallet balance is "<balance>"
    And payment gateway behavior is "<gateway>"
    When I pay using "E-Wallet"
    Then the outcome should be "<expectedOutcome>"
    And the user message should be "<userMessage>"

    Examples: Decision Table - Payment Outcomes
      | amount | balance           | gateway    | expectedOutcome | userMessage                                 |
      | 50     | >=50              | success    | success         | Payment successful                           |
      | 50     | <50               | success    | failure         | Insufficient balance                         |
      | 50     | >=50              | timeout    | retry_success   | Payment succeeded after retry                |
      | 50     | >=50              | timeout2x  | failure         | Payment failed due to network timeout        |
      | 50     | >=50              | declined   | failure         | Payment declined by provider                 |
      | 50     | >=50              | error_5xx  | failure         | Service temporarily unavailable, try again   |

