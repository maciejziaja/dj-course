/**
 * Step definitions for the Volume value object (pure domain, no I/O).
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

import { Volume, type VolumeUnit } from './volume';

interface VolumeWorld {
  volume?: Volume;
  lastError?: Error;
}

Given('a volume of {float} {word}', function (this: VolumeWorld, amount: number, unit: string) {
  this.volume = Volume.from(amount, unit as VolumeUnit);
});

When('I try to create a volume of {float} {word}', function (this: VolumeWorld, amount: number, unit: string) {
  this.lastError = undefined;
  try {
    this.volume = Volume.from(amount, unit as VolumeUnit);
  } catch (e) {
    this.lastError = e as Error;
  }
});

Then('the volume should equal {float} {word}', function (this: VolumeWorld, amount: number, unit: string) {
  const expected = Volume.from(amount, unit as VolumeUnit);
  assert(this.volume!.equals(expected), `Expected ${expected}, got ${this.volume}`);
});

Then('the volume in {word} should be {float}', function (this: VolumeWorld, unit: string, expected: number) {
  assert.strictEqual(this.volume!.valueInUnit(unit as VolumeUnit), expected);
});

// "it should fail with {string}" reused from cargo-load-plan.steps.ts (shared Cucumber world)
