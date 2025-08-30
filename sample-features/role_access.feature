@regression
Feature: Checkout Flows

  @guest
  Rule: Guest checkout flow

    Background:
      Given app is launched
      And user is a guest
      When user opens the checkout page
      And cart contains at least one item
      Then cart summary is visible
      And subtotal is displayed

    Scenario: Guest — successful checkout with card
      Given I am on the checkout page
      When I fill shipping address
      And I pay with a valid credit card
      Then I see order confirmation
      And a confirmation email is sent

    Scenario: Guest — missing shipping address
      Given I am on the checkout page
      When I pay with a valid credit card
      Then I see validation error for address
      And the payment is not processed

    Scenario: Guest — invalid card
      Given I am on the checkout page
      When I fill shipping address
      And I pay with an invalid credit card
      Then I see payment declined message
      And the order is not created

    Scenario: Guest — apply valid coupon
      Given I am on the checkout page
      When I apply coupon "SAVE10"
      Then I see 10 percent discount applied
      And total is reduced

    Scenario: Guest — remove item at checkout
      Given I am on the checkout page
      When I remove an item from cart
      Then the order total is recalculated
      And the removed item no longer appears

    Scenario: Guest — cancel order at review step
      Given I am on the checkout page
      When I cancel the order
      Then I return to the cart page
      And no order is created

  @member
  Rule: Member checkout flow

    Background:
      Given app is launched
      And user is logged in
      And user is already be a member
      When user navigates to the checkout page
      And selects a delivery method
      Then shipping cost is displayed
      And loyalty balance is shown

    Scenario: Member — checkout with saved card
      Given I am on the checkout page
      When I choose my saved card
      And I confirm the payment
      Then I see order confirmation
      And the order appears in purchase history

    Scenario: Member — change address at checkout
      Given I am on the checkout page
      When I change shipping address to a new one
      Then shipping cost is updated
      And the new address is saved for next time

    Scenario: Member — out of stock during checkout
      Given I am on the checkout page
      When I confirm the payment
      Then I see out of stock message
      And the order is not created

    Scenario: Member — use points for partial payment
      Given I am on the checkout page
      When I use points for payment
      Then I see remaining amount to be paid
      And points balance is reduced accordingly

    Scenario: Member — request refund after payment
      Given I am on the orders page
      When I request a refund
      Then I see refund request submitted
      And refund status is pending

    Scenario: Member — download invoice
      Given I am on the orders page
      When I download the invoice
      Then a PDF invoice is downloaded
      And invoice contains correct order details