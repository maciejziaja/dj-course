Feature: Cargo Load Plan Aggregate

  # ── Finalizacja ───────────────────────────────────────────────────────────────

  Scenario: Cannot finalize empty plan
    Given an empty load plan with standard curtainside trailer
    When I try to finalize the plan
    Then it should fail with "Cannot finalize empty plan."

  Scenario: Can finalize plan with at least one unit
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 500 kg
    When I finalize the plan
    Then the plan status should be FINALIZED

  # ── Niezmienność zfinalizowanego planu ───────────────────────────────────────────

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

  # ── Kompatybilność ładunków (Food vs Dangerous) ─────────────────────────────────

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

  # ── Usuwanie jednostki ──────────────────────────────────────────────────────────

  Scenario: Cannot remove non-existent unit
    Given a load plan with standard curtainside trailer
    And the plan has a general cargo pallet unit with weight 500 kg
    When I try to remove pallet unit with id "non-existent-id"
    Then it should fail with "not found"

  # ── Pojemność (waga, LDM) ────────────────────────────────────────────────────────

  Scenario: Adding unit exceeding weight capacity fails
    Given a load plan with trailer having max weight 1000 kg
    And the plan has a general cargo pallet unit with weight 600 kg
    When I try to add another general cargo pallet unit with weight 500 kg
    Then it should fail with "Weight capacity exceeded"

  Scenario: Adding unit exceeding LDM capacity fails
    Given an empty load plan with trailer having max LDM 0.5 m
    When I try to add a general cargo pallet unit with weight 500 kg
    Then it should fail with "LDM capacity exceeded"

  # ── Wymagania naczepy (klimat, wysokość) ────────────────────────────────────────

  Scenario: Temperature-controlled cargo requires climate-controlled trailer
    Given an empty load plan with standard curtainside trailer
    When I try to add a food pallet unit with weight 300 kg and temperature control required
    Then it should fail with "Climate control required"

  Scenario: Unit exceeding trailer height is rejected
    Given an empty load plan with trailer having height 1500 mm
    When I try to add a general cargo pallet unit with total height 2000 mm and weight 500 kg
    Then it should fail with "too tall"

  # ── Klasy pojazdów sztywnych (nie-TIRy) – ładowność ─────────────────────────────
  #
  # Naczepa: plan deklaruje KLASĘ, a pojazd (ciągnik) rezerwuje się później – więc
  # ładowność zestawu weryfikuje ktoś inny, potem. Pojazd sztywny: klasa przesądza
  # o pojeździe na tyle, że pytanie "czy on to uwiezie" musi paść już przy planowaniu.
  #
  # Każda liczba klasy to GWARANTOWANE MINIMUM po jej członkach, nie średnia –
  # plan jest obietnicą, więc zawyżenie kończy się na rampie, a nie w biurze.

  Scenario Outline: Rigid vehicle class rejects a load beyond its guaranteed payload
    # W każdym przypadku sam towar mieści się w ładowności – przeważa dopiero
    # masa brutto, czyli towar razem z paletą (EPAL 1 = 25 kg).
    Given an empty load plan with load space "<loadSpace>"
    When I try to add a general cargo pallet unit with weight <cargoKg> kg
    Then it should fail with "Vehicle payload exceeded"

    Examples:
      | loadSpace    | cargoKg |
      | van-medium   | 1390    |
      | box-truck-8t | 3490    |

  Scenario: Class payload is the lowest of its members, not the average
    # Ducato uniósłby 1440 kg, Master 1400 kg. Klasa gwarantuje 1400 kg, więc
    # ładunek, który zmieściłby się tylko w Ducato, jest odrzucany – dyspozytor
    # ma wysłać dowolny bus z klasy i plan nadal ma się zgadzać.
    Given an empty load plan with load space "van-medium"
    When I try to add a general cargo pallet unit with weight 1410 kg
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
    And the plan has a general cargo pallet unit with weight 1430 kg
    When I try to change the load space to "van-medium"
    Then it should fail with "Vehicle payload exceeded"

  Scenario: Van runs out of floor length before it runs out of payload
    Given an empty load plan with load space "van-medium"
    And the plan has a general cargo pallet unit with weight 100 kg
    And the plan has a general cargo pallet unit with weight 100 kg
    When I try to add another general cargo pallet unit with weight 100 kg
    Then it should fail with "LDM capacity exceeded"

  # ── Wymiary przestrzeni: nie tylko wysokość ─────────────────────────────────────
  #
  # LdmCalculator zakłada nowy rząd dla palety, która nie mieści się w żadnym
  # istniejącym – co samo w sobie przyjęłoby paletę szerszą niż podłoga.
  # Na naczepie zapas nad najszerszą paletą to 1340 mm, na busie 240 mm.

  Scenario: Pallet wider than the load space is rejected
    Given an empty load plan with load space having width 1000 mm
    When I try to add a chemical pallet unit on a "cp3" pallet with weight 100 kg
    Then it should fail with "too wide"

  Scenario: Pallet that fits the floor width is accepted
    Given an empty load plan with load space having width 1200 mm
    When I try to add a chemical pallet unit on a "cp3" pallet with weight 100 kg
    Then the plan should contain 1 cargo unit
