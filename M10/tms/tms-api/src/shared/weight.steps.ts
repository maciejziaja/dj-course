/**
 * Step definitions for the Weight value object (pure domain, no I/O).
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { Weight, type WeightUnit } from './weight';

interface WeightWorld {
  weight?: Weight;
  weights?: Weight[];
  lastError?: Error;
}

function parseWeights(s: string): Weight[] {
  if (s.trim() === '') return [];
  return s.split(',').map((part) => {
    const [amount, unit] = part.trim().split(/\s+/);
    return Weight.from(parseFloat(amount), unit as WeightUnit);
  });
}

function assertSameWeight(actual: Weight, amount: number, unit: string): void {
  const expected = Weight.from(amount, unit as WeightUnit);
  assert(actual.equals(expected), `Expected ${expected}, got ${actual}`);
}

Given('a weight of {float} {word}', function (this: WeightWorld, amount: number, unit: string) {
  this.weight = Weight.from(amount, unit as WeightUnit);
});

Given('the weights {string}', function (this: WeightWorld, weights: string) {
  this.weights = parseWeights(weights);
});

When('I try to create a weight of {float} {word}', function (this: WeightWorld, amount: number, unit: string) {
  this.lastError = undefined;
  try {
    this.weight = Weight.from(amount, unit as WeightUnit);
  } catch (e) {
    this.lastError = e as Error;
  }
});

When('I try to pick the lightest of them', function (this: WeightWorld) {
  this.lastError = undefined;
  try {
    Weight.min(this.weights!);
  } catch (e) {
    this.lastError = e as Error;
  }
});

Then('the weight should equal {float} {word}', function (this: WeightWorld, amount: number, unit: string) {
  assertSameWeight(this.weight!, amount, unit);
});

Then('the weight should be zero', function (this: WeightWorld) {
  assert(this.weight!.isZero(), `Expected ${this.weight} to be zero`);
});

Then('the weight should not be zero', function (this: WeightWorld) {
  assert(!this.weight!.isZero(), `Expected ${this.weight} not to be zero`);
});

Then('their total should equal {float} {word}', function (this: WeightWorld, amount: number, unit: string) {
  assertSameWeight(Weight.sum(this.weights!), amount, unit);
});

Then('the lightest of them should equal {float} {word}', function (this: WeightWorld, amount: number, unit: string) {
  assertSameWeight(Weight.min(this.weights!), amount, unit);
});

// "it should fail with {string}" reused from cargo-load-plan.steps.ts (shared Cucumber world)
