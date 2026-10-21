Feature: Domain arithmetic stays inside value objects

  # Weights, lengths and loading metres are value objects precisely so that
  # their arithmetic lives in one place. Unwrapping one into a number is allowed
  # only at the edges – persistence, read models, HTTP – or to word an error
  # message. Anywhere else it is a domain rule leaking out of its value object.

  Scenario: Domain and application code never unwrap a measure to compute with it
    Given the domain and application sources of the cargo-plans context
    Then no source unwraps a measure into a number

  Scenario: Extremes of measures are picked by the value objects themselves
    Given the domain and application sources of the cargo-plans context
    Then no source picks extremes with Math.min or Math.max
