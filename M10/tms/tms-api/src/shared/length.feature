Feature: Length Value Object

  # ── Units ───────────────────────────────────────────────────────────────────

  Scenario: The same extent expressed in different units is equal
    Given a length of 1.2 M
    Then the length should equal 1200 MM
    And the length should equal 120 CM
    And the length in MM should be 1200

  Scenario: Cannot create a negative length
    When I try to create a length of -1 MM
    Then it should fail with "Length cannot be negative"

  # ── Aggregation ─────────────────────────────────────────────────────────────

  Scenario: Lengths in mixed units sum up
    Given the lengths "800 MM, 1.2 M, 40 CM"
    Then their sum should equal 2400 MM

  Scenario: Summing no lengths gives zero
    Given the lengths ""
    Then their sum should equal 0 MM

  Scenario: Shortest and longest are picked across units
    Given the lengths "1422 MM, 1.38 M, 2450 MM"
    Then the shortest of them should equal 1380 MM
    And the longest of them should equal 2450 MM

  Scenario: Cannot pick the shortest of no lengths
    Given the lengths ""
    When I try to pick the shortest of them
    Then it should fail with "empty set of lengths"

  # ── Comparison ──────────────────────────────────────────────────────────────

  Scenario: A length equal to the limit does not exceed it
    Given a length of 2480 MM
    Then 2480 MM should not exceed the length
    And 248 CM should not exceed the length

  Scenario: A length beyond the limit exceeds it
    Given a length of 2480 MM
    Then 2481 MM should exceed the length
