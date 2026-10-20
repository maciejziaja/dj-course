/**
 * Step definitions for the LoadingMeters value object (pure domain, no I/O).
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { LoadingMeters } from './loading-meters';
import { Length, type LengthUnit } from '../../shared/length';

interface LoadingMetersWorld {
  ldm?: LoadingMeters;
  capacity?: LoadingMeters;
  lastError?: Error;
}

When('the cargo occupies {float} {word} of floor', function (this: LoadingMetersWorld, amount: number, unit: string) {
  this.ldm = LoadingMeters.fromOccupiedFloorLength(Length.from(amount, unit as LengthUnit));
});

When('I try to declare {float} ldm', function (this: LoadingMetersWorld, amount: number) {
  this.lastError = undefined;
  try {
    this.ldm = LoadingMeters.of(amount);
  } catch (e) {
    this.lastError = e as Error;
  }
});

Given('a load space offering {float} ldm', function (this: LoadingMetersWorld, amount: number) {
  this.capacity = LoadingMeters.of(amount);
});

Then('the plan should take {float} ldm', function (this: LoadingMetersWorld, expected: number) {
  assert(this.ldm!.equals(LoadingMeters.of(expected)), `Expected ${expected} ldm, got ${this.ldm}`);
});

Then('{float} ldm should fit in it', function (this: LoadingMetersWorld, amount: number) {
  assert(!LoadingMeters.of(amount).exceeds(this.capacity!), `Expected ${amount} ldm to fit in ${this.capacity}`);
});

Then('{float} ldm should not fit in it', function (this: LoadingMetersWorld, amount: number) {
  assert(LoadingMeters.of(amount).exceeds(this.capacity!), `Expected ${amount} ldm to exceed ${this.capacity}`);
});

// "it should fail with {string}" reused from cargo-load-plan.steps.ts (shared Cucumber world)
