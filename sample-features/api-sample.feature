@api @P1
Feature: Billing API
  As a client
  I want to manage invoices, payments, and refunds
  So I can charge and reconcile securely

  Background:
    Given base URL "https://api.billing.example.com"
    And common headers:
      | key               | value                               |
      | Authorization     | Bearer eyJhbGciOi...<long>          |
      | Content-Type      | application/json                    |
      | Accept            | application/json                    |
      | X-Tenant          | acme-enterprise                     |

  Rule: Invoices
    @reporting
    Background:
      Given I set default currency "IDR"

    @positive @P0 @smoke @invoice
    Scenario: Create invoice (minimal)
      When I POST "/v1/invoices" with JSON body
        """
        { "customerId": "C-001", "lines":[{"sku":"SKU-1","qty":1,"amount":10000}] }
        """
      Then I get status "201"
      And response JSON path equals:
        | path            | expected |
        | $.currency      | IDR      |
        | $.lines[0].sku  | SKU-1    |

    @negative @P1 @invoice @validation
    Scenario Outline: Create invoice invalid "<case>"
      When I POST "/v1/invoices" with JSON body
        """
        { "customerId": "<customerId>", "lines":[{"sku":"<sku>","qty": <qty>,"amount": <amount>}] }
        """
      Then I get status "<status>"
      And error JSON contains code "<code>" and message "<message>"

      Examples:
        | case                 | customerId | sku   | qty | amount | status | code            | message                 |
        | missing-customerId   |            | SKU-1 | 1   | 10000  | 400    | MISSING_CID     | customerId is required  |
        | negative-qty         | C-001      | SKU-1 | -1  | 10000  | 400    | BAD_QTY         | qty must be >= 1        |

    @positive @P2 @invoice @list
    Scenario: List invoices with filter & pagination
      When I GET "/v1/invoices?status=OPEN&limit=2&cursor=abc"
      Then I get status "200"
      And response JSON should contain:
        """
        { "data": [], "nextCursor": "def" }
        """

  Rule: Payments
    @payments
    Background:
      Given I set idempotency key "IDEMP-123"

    @positive @P0 @card @3ds
    Scenario: Authorize card payment with 3DS
      When I POST "/v1/payments/authorize" with JSON body
        """
        {
          "amount": 129900, "currency": "IDR",
          "method": { "type":"CARD", "card":{"number":"4111111111111111","expMonth":12,"expYear":2030,"cvc":"123"} },
          "threeDS": {"enabled": true, "version": "2.2.0"}
        }
        """
      Then I get status "201"
      And response JSON path equals:
        | path        | expected     |
        | $.status    | AUTHORIZED   |
        | $.currency  | IDR          |

    @negative @P1 @card @validation
    Scenario Outline: Authorize card payment invalid "<case>"
      When I POST "/v1/payments/authorize" with JSON body
        """
        {
          "amount": <amount>, "currency": "<currency>",
          "method": { "type":"CARD", "card":{"number":"<number>","expMonth":<expM>,"expYear":<expY>,"cvc":"<cvc>"} }
        }
        """
      Then I get status "<status>"
      And error JSON contains code "<code>" and message "<message>"

      # Kolom pertama 'case' akan di-skip saat mapping Test Data
      Examples:
        | case            | amount | currency | number            | expM | expY | cvc | status | code           | message                |
        | bad-card        | 1000   | IDR      | 0000000000000000  | 12   | 2030 | 123 | 402    | CARD_DECLINED  | card number invalid    |
        | invalid-expiry  | 5000   | IDR      | 4111111111111111  | 00   | 1999 | 123 | 400    | BAD_EXPIRY     | expiry invalid         |

    @positive @P2 @payment @health
    Example: Payments ping endpoint
      When I GET "/v1/payments/ping"
      Then I get status "200"
      And response JSON should contain:
        """
        { "ping": "ok" }
        """

  Rule: Refunds
    @refunds
    Background:
      Given I set refund reason "CUSTOMER_REQUEST"

    @positive @P1 @refund
    Scenario: Create refund (full)
      Given I have payment id "PAY-001"
      When I POST "/v1/refunds" with JSON body
        """
        { "paymentId": "PAY-001", "amount": 5000, "reason": "CUSTOMER_REQUEST" }
        """
      Then I get status "201"
      And response JSON path equals:
        | path       | expected |
        | $.amount   | 5000     |
        | $.reason   | CUSTOMER_REQUEST |

    @negative @P2 @refund @validation
    Scenario Outline: Create refund invalid "<case>"
      When I POST "/v1/refunds" with JSON body
        """
        { "paymentId": "<pid>", "amount": <amount>, "reason": "<reason>" }
        """
      Then I get status "<status>"
      And error JSON contains code "<code>" and message "<message>"

      # Contoh Examples satu kolom → tidak menghasilkan Test Data
      Examples:
        | case |
        | missing-pid |

    @positive @P3 @refund @list
    Scenario: List refunds with window
      When I GET "/v1/refunds?from=2025-08-01T00:00:00Z&to=2025-08-31T23:59:59Z&limit=50"
      Then I get status "200"