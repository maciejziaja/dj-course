Feature: Cargo Load Plan Aggregate

  # ── Finalization ──────────────────────────────────────────────────────────────

  Scenario: Cannot finalize empty plan
    Given an empty load plan with standard curtainside trailer
    When I try to finalize the plan
    Then it should fail with "Cannot finalize empty plan."

  Scenario: Can finalize plan with at least one unit
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 500 kg
    When I finalize the plan
    Then the plan status should be FINALIZED

  # ── Finalized plan is immutable ──────────────────────────────────────────────────

  Scenario: Cannot add unit to finalized plan
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 500 kg
    And the plan is finalized
    When I try to add another general cargo pallet unit with weight 400 kg
    Then it should fail with "Finalized plan cannot be modified."

  Scenario: Cannot remove unit from finalized plan
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 500 kg
    And the plan is finalized
    When I try to remove pallet unit with id "unit-1"
    Then it should fail with "Finalized plan cannot be modified."

  Scenario: Cannot change load space when plan is finalized
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 500 kg
    And the plan is finalized
    When I try to change the load space to mega trailer
    Then it should fail with "Finalized plan cannot be modified."

  # ── Cargo co-loading compatibility (Food vs Dangerous) ──────────────────────────

  Scenario: Cannot mix food with dangerous goods
    Given a load plan with refrigerated trailer
    And the plan has a food pallet unit with weight 300 kg
    When I try to add a dangerous goods pallet unit with weight 400 kg
    Then it should fail with "Incompatible cargo"

  Scenario: Cannot mix food with chemical
    Given a load plan with refrigerated trailer
    And the plan has a food pallet unit with weight 300 kg
    When I try to add a chemical pallet unit with weight 400 kg
    Then it should fail with "Incompatible cargo"

  # ── Removing a unit ─────────────────────────────────────────────────────────────

  Scenario: Cannot remove non-existent unit
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 500 kg
    When I try to remove pallet unit with id "non-existent-id"
    Then it should fail with "not found"

  # ── Capacity (weight, LDM) ───────────────────────────────────────────────────────

  Scenario: Adding unit exceeding weight capacity fails
    Given a load plan with trailer having max weight 1000 kg
    And the plan has a general cargo pallet unit with weight 600 kg
    When I try to add another general cargo pallet unit with weight 500 kg
    Then it should fail with "Weight capacity exceeded"

  Scenario: Adding unit exceeding LDM capacity fails
    Given an empty load plan with trailer having max LDM 0.5 m
    When I try to add a general cargo pallet unit with weight 500 kg
    Then it should fail with "LDM capacity exceeded"

  # ── Load space requirements (climate, height) ───────────────────────────────────

  Scenario: Temperature-controlled cargo requires climate-controlled trailer
    Given an empty load plan with standard curtainside trailer
    When I try to add a food pallet unit with weight 300 kg and temperature control required
    Then it should fail with "climate control required"

  Scenario: Unit exceeding trailer height is rejected
    Given an empty load plan with trailer having height 1500 mm
    When I try to add a general cargo pallet unit with total height 2000 mm and weight 500 kg
    Then it should fail with "too tall"

  # ── Rigid vehicle classes (non-TIR) – payload ───────────────────────────────────
  #
  # Trailer: the plan commits to a CLASS and the tractor unit is reserved later –
  # so the rig's payload is somebody else's check, later on. Rigid vehicle: the
  # class settles the vehicle well enough that "can it carry this?" has to be
  # answered while planning.
  #
  # Every figure of a class is a GUARANTEED MINIMUM across its members, not an
  # average – a plan is a promise, so overstating fails on the ramp, not in the office.

  Scenario Outline: Rigid vehicle class rejects a load beyond its guaranteed payload
    # In every case the cargo alone fits the payload – it is the gross weight,
    # cargo plus pallet (EPAL 1 = 25 kg), that tips it over.
    Given an empty load plan with load space "<loadSpace>"
    When I try to add a general cargo pallet unit with weight <cargoKg> kg
    Then it should fail with "Vehicle payload exceeded"

    Examples:
      | loadSpace    | cargoKg |
      | van-medium   | 1590    |
      | box-truck-8t | 3690    |

  Scenario: Class payload is the lowest of its members, not the average
    # A Ducato carries 1440 kg, a Master 1400 kg (1640 / 1600 kg with tolerance).
    # The class guarantees 1400 + 200 kg, so 1615 kg gross, which only a Ducato
    # could take, is rejected – dispatch may send any van in the class and the
    # plan must still hold.
    Given an empty load plan with load space "van-medium"
    When I try to add a general cargo pallet unit with weight 1590 kg
    Then it should fail with "Vehicle payload exceeded"

  Scenario: Rigid vehicle class accepts a load within its payload
    Given an empty load plan with load space "van-medium"
    And the plan has a general cargo pallet unit with weight 1000 kg
    When I finalize the plan
    Then the plan status should be FINALIZED

  Scenario: Pallet tare counts towards the load
    Given an empty load plan with load space "box-truck-8t"
    And the plan has a general cargo pallet unit with weight 1000 kg
    Then the planned gross weight should be 1025 kg

  Scenario: Trailer plans are not subject to the vehicle payload rule
    Given an empty load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 1430 kg
    Then the plan should contain 1 cargo unit

  Scenario: Moving a planned load onto a van class re-runs the payload rule
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 1590 kg
    When I try to change the load space to "van-medium"
    Then it should fail with "Vehicle payload exceeded"

  Scenario: Van runs out of floor length before it runs out of payload
    Given an empty load plan with load space "van-medium"
    And the plan has a general cargo pallet unit with weight 100 kg
    And the plan has a general cargo pallet unit with weight 100 kg
    When I try to add another general cargo pallet unit with weight 100 kg
    Then it should fail with "LDM capacity exceeded"

  # ── GVW tolerance: +200 kg ───────────────────────────────────────────────────────
  #
  # Unwritten rule: exceeding a vehicle's GVW by at most 200 kg draws no penalty,
  # so we plan up to that limit – often it is exactly the one extra pallet.
  # The tolerance applies to GVW only (a rigid vehicle's payload), never to the
  # structural capacity of a trailer floor.
  #
  # van-medium: payload 1400 kg → 1600 kg gross permitted
  # box-truck-8t: payload 3500 kg → 3700 kg gross permitted
  # EPAL 1 weighs 25 kg.

  Scenario: Load over the payload but within the tolerance is accepted
    Given an empty load plan with load space "van-medium"
    When I try to add a general cargo pallet unit with weight 1500 kg
    Then the plan should contain 1 cargo unit
    And the planned gross weight should be 1525 kg

  Scenario: Plan loaded within the tolerance can be finalized
    Given an empty load plan with load space "van-medium"
    And the plan has a general cargo pallet unit with weight 1500 kg
    When I finalize the plan
    Then the plan status should be FINALIZED

  Scenario Outline: Load exactly at payload plus tolerance is accepted
    Given an empty load plan with load space "<loadSpace>"
    When I try to add a general cargo pallet unit with weight <cargoKg> kg
    Then the plan should contain 1 cargo unit
    And the planned gross weight should be <grossKg> kg

    Examples:
      | loadSpace    | cargoKg | grossKg |
      | van-medium   | 1575    | 1600    |
      | box-truck-8t | 3675    | 3700    |

  Scenario Outline: Load even 1 kg beyond the tolerance is rejected
    Given an empty load plan with load space "<loadSpace>"
    When I try to add a general cargo pallet unit with weight <cargoKg> kg
    Then it should fail with "Vehicle payload exceeded"
    And the plan should contain 0 cargo units

    Examples:
      | loadSpace    | cargoKg |
      | van-medium   | 1576    |
      | box-truck-8t | 3676    |

  Scenario: Rejection names the payload and the tolerance applied
    Given an empty load plan with load space "van-medium"
    When I try to add a general cargo pallet unit with weight 1576 kg
    Then it should fail with "cannot carry 1601kg gross (payload 1400kg + 200kg tolerance)"

  Scenario: The tolerance lets one more pallet go on board
    # 700 + 25 = 725 kg gross per pallet. Two make 1450 kg – over the 1400 kg
    # payload, but within tolerance. A third (2175 kg) is not.
    Given an empty load plan with load space "van-medium"
    And the plan has a general cargo pallet unit with weight 700 kg
    When I try to add another general cargo pallet unit with weight 700 kg
    Then the plan should contain 2 cargo units
    When I try to add another general cargo pallet unit with weight 700 kg
    Then it should fail with "Vehicle payload exceeded"
    And the plan should contain 2 cargo units

  Scenario: Trailer floor capacity gets no tolerance
    # Floor capacity is physics, not regulation – the GVW tolerance does not apply.
    # 2 × (500 + 25) = 1050 kg: only 50 kg over, and still rejected.
    Given a load plan with trailer having max weight 1000 kg
    And the plan has a general cargo pallet unit with weight 500 kg
    When I try to add another general cargo pallet unit with weight 500 kg
    Then it should fail with "Weight capacity exceeded"

  Scenario: Moving a load onto a van class honours the tolerance
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 1500 kg
    When I try to change the load space to "van-medium"
    Then the load space should be "van-medium"

  # ── Load space dimensions: not just height ──────────────────────────────────────
  #
  # LdmCalculator starts a new row for a pallet that fits no existing one – which
  # on its own would accept a pallet wider than the floor. On a trailer the margin
  # over the widest pallet is 1340 mm, on a van 240 mm.

  Scenario: Pallet wider than the load space is rejected
    Given an empty load plan with load space having width 1000 mm
    When I try to add a chemical pallet unit on a "cp3" pallet with weight 100 kg
    Then it should fail with "too wide"

  Scenario: Pallet that fits the floor width is accepted
    Given an empty load plan with load space having width 1200 mm
    When I try to add a chemical pallet unit on a "cp3" pallet with weight 100 kg
    Then the plan should contain 1 cargo unit
