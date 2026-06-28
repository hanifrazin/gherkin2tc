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

@regression
Feature: Role-based access control

  @viewer
  Rule: Viewer access

    Background:
      Given the following users exist:
        | username | role   | password |
        | vega     | viewer | 12345    |
      And feature flag "EXPORT_REPORT" is enabled
      When user "vega" logs in with password "12345"
      And user navigates to "Reports" page
      Then a read-only banner is visible
      And the header tooltip explains:
        """
        Your role is Viewer. You can open and export reports,
        but you cannot edit, delete, or change settings.
        """

    # 1
    Scenario: Viewer can open a report
      Given a report named "Q4 Revenue" exists
      When the viewer opens report "Q4 Revenue"
      Then the report content is displayed

    # 2
    Scenario: Viewer cannot edit a report
      Given a report named "Customer List" exists
      When the viewer tries to edit "Customer List"
      Then an error message is shown:
        """
        Permission denied: your role (Viewer) doesn't allow editing.
        """

    # 3
    Scenario: Viewer can export a report
      Given a report named "Inventory" exists
      When the viewer clicks "Export CSV"
      Then a file download starts
      And an audit log record is written:
        | action | target     | status |
        | export | Inventory  | OK     |

    # 4
    Scenario: Viewer cannot delete items
      Given a table "Products" is present
      When the viewer tries to delete row with id "P01"
      Then a toast appears "Delete is not allowed for your role"

    # 5
    Scenario: Viewer sees limited menu
      When the viewer opens the main menu
      Then only the following items are visible:
        | item       |
        | Dashboard  |
        | Reports    |
        | Help       |

    # 6
    Scenario: Viewer activity is audited
      When the viewer opens "System Status"
      Then an audit event is captured with details:
        """
        user=vega; action=view; target=System Status; result=OK
        """

  @admin
  Rule: Admin access

    Background:
      Given the following users exist:
        | username | role  | password |
        | ada      | admin | root     |
      And the system has the following report categories:
        | category   |
        | Sales      |
        | Finance    |
        | Operation  |
      When admin "ada" logs in with password "root"
      And admin opens "Admin Console"
      Then the dashboard widgets are visible:
        | widget          |
        | User Overview   |
        | Access Policies |
        | Audit Stream    |
      And an info box says:
        """
        You have full administrative privileges.
        Be careful when changing policies in production.
        """

    # 1
    Scenario: Admin can create a user
      When the admin creates a user:
        | username | role   | password |
        | luna     | viewer | 12345    |
      Then a success message "User created" is displayed

    # 2
    Scenario: Admin can edit a report
      Given a report named "Aging AR" exists
      When the admin changes title to "Aging Receivables"
      Then the report is saved successfully

    # 3
    Scenario: Admin can delete an item
      Given an item "PENDING_RULE" exists
      When the admin deletes "PENDING_RULE"
      Then the item no longer appears in the list

    # 4
    Scenario: Admin can change user role
      Given a user "luna" with role "viewer" exists
      When the admin updates user "luna" to role "editor"
      Then a success message is shown
      And the user details reflect:
        | username | role   |
        | luna     | editor |

    # 5
    Scenario: Admin can view audit stream
      When the admin opens "Audit Stream"
      Then the latest 20 records are shown
      And record details pane shows:
        """
        ts=2025-08-30T10:00:00Z
        actor=ada
        action=delete
        target=PENDING_RULE
        result=OK
        """

    # 6
    @negative
    Scenario: Admin cannot access billing without subscription
      Given the subscription is "FREE"
      When the admin opens "Billing"
      Then an upgrade prompt is displayed:
        """
        Billing is not available on FREE plan. Please upgrade.
        """