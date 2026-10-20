/**
 * Step definitions for the Length value object (pure domain, no I/O).
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { Length, type LengthUnit } from './length';

interface LengthWorld {
  length?: Length;
  lengths?: Length[];
  lastError?: Error;
}

function parseLengths(s: string): Length[] {
  if (s.trim() === '') return [];
  return s.split(',').map((part) => {
    const [amount, unit] = part.trim().split(/\s+/);
    return Length.from(parseFloat(amount), unit as LengthUnit);
  });
}

function assertSameLength(actual: Length, amount: number, unit: string): void {
  const expected = Length.from(amount, unit as LengthUnit);
  assert(actual.equals(expected), `Expected ${expected}, got ${actual}`);
}

Given('a length of {float} {word}', function (this: LengthWorld, amount: number, unit: string) {
  this.length = Length.from(amount, unit as LengthUnit);
});

Given('the lengths {string}', function (this: LengthWorld, lengths: string) {
  this.lengths = parseLengths(lengths);
});

When('I try to create a length of {float} {word}', function (this: LengthWorld, amount: number, unit: string) {
  this.lastError = undefined;
  try {
    this.length = Length.from(amount, unit as LengthUnit);
  } catch (e) {
    this.lastError = e as Error;
  }
});

When('I try to pick the shortest of them', function (this: LengthWorld) {
  this.lastError = undefined;
  try {
    Length.min(this.lengths!);
  } catch (e) {
    this.lastError = e as Error;
  }
});

Then('the length should equal {float} {word}', function (this: LengthWorld, amount: number, unit: string) {
  assertSameLength(this.length!, amount, unit);
});

Then('the length in {word} should be {float}', function (this: LengthWorld, unit: string, expected: number) {
  assert.strictEqual(this.length!.valueInUnit(unit as LengthUnit), expected);
});

Then('their sum should equal {float} {word}', function (this: LengthWorld, amount: number, unit: string) {
  assertSameLength(Length.sum(this.lengths!), amount, unit);
});

Then('the shortest of them should equal {float} {word}', function (this: LengthWorld, amount: number, unit: string) {
  assertSameLength(Length.min(this.lengths!), amount, unit);
});

Then('the longest of them should equal {float} {word}', function (this: LengthWorld, amount: number, unit: string) {
  assertSameLength(Length.max(this.lengths!), amount, unit);
});

Then('{float} {word} should exceed the length', function (this: LengthWorld, amount: number, unit: string) {
  const candidate = Length.from(amount, unit as LengthUnit);
  assert(candidate.exceeds(this.length!), `Expected ${candidate} to exceed ${this.length}`);
});

Then('{float} {word} should not exceed the length', function (this: LengthWorld, amount: number, unit: string) {
  const candidate = Length.from(amount, unit as LengthUnit);
  assert(!candidate.exceeds(this.length!), `Expected ${candidate} not to exceed ${this.length}`);
});

// "it should fail with {string}" reused from cargo-load-plan.steps.ts (shared Cucumber world)
