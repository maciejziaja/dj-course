Feature: Weight Value Object

  # ── Units ───────────────────────────────────────────────────────────────────

  Scenario: The same mass expressed in different units is equal
    Given a weight of 1.2 TONNE
    Then the weight should equal 1200 KG

  Scenario: Cannot create a negative weight
    When I try to create a weight of -1 KG
    Then it should fail with "Weight cannot be negative"

  Scenario: Only an empty weight is zero
    Given a weight of 0 KG
    Then the weight should be zero

  Scenario: A non-empty weight is not zero
    Given a weight of 0.001 KG
    Then the weight should not be zero

  # ── Aggregation ─────────────────────────────────────────────────────────────

  Scenario: Weights in mixed units sum up
    Given the weights "800 KG, 1.2 TONNE"
    Then their total should equal 2000 KG

  Scenario: The lightest weight is picked across units
    Given the weights "1440 KG, 1.4 TONNE, 3500 KG"
    Then the lightest of them should equal 1400 KG

  Scenario: Cannot pick the lightest of no weights
    Given the weights ""
    When I try to pick the lightest of them
    Then it should fail with "empty set of weights"
