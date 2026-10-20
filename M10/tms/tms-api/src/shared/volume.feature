Feature: Volume Value Object

  Scenario: A cubic metre holds a thousand litres
    Given a volume of 1 M3
    Then the volume should equal 1000 L

  Scenario: A van fuel tank expressed in cubic metres
    Given a volume of 90 L
    Then the volume in M3 should be 0.09

  Scenario: Cannot create a negative volume
    When I try to create a volume of -5 L
    Then it should fail with "Volume cannot be negative"
