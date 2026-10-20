Feature: Loading Metres Value Object

  # ── From physical floor length ──────────────────────────────────────────────

  Scenario: Occupied floor length reads as loading metres
    When the cargo occupies 2400 MM of floor
    Then the plan should take 2.4 ldm

  Scenario: Loading metres are quoted to the centimetre
    When the cargo occupies 3456 MM of floor
    Then the plan should take 3.46 ldm

  Scenario: An empty floor takes no loading metres
    When the cargo occupies 0 MM of floor
    Then the plan should take 0 ldm

  # ── Invariants ──────────────────────────────────────────────────────────────

  Scenario: Cannot have negative loading metres
    When I try to declare -0.5 ldm
    Then it should fail with "Loading metres cannot be negative"

  # ── Capacity boundary ───────────────────────────────────────────────────────

  Scenario: A load exactly at the capacity does not exceed it
    Given a load space offering 13.6 ldm
    Then 13.6 ldm should fit in it

  Scenario: A load a centimetre beyond the capacity exceeds it
    Given a load space offering 13.6 ldm
    Then 13.61 ldm should not fit in it
