export type VolumeUnit = 'L' | 'M3';

interface UnitDefinition {
  readonly factorToLitres: number;
  readonly symbol: string;
}

const UNITS: Record<VolumeUnit, UnitDefinition> = {
  L:  { factorToLitres: 1,    symbol: 'L'  },
  M3: { factorToLitres: 1000, symbol: 'm³' },
};

/**
 * A three-dimensional capacity, e.g. a fuel tank.
 *
 * Not derived from {@link Length}: no rule multiplies dimensions into a volume,
 * so the two stay unrelated until one does.
 */
export class Volume {
  private constructor(
    private readonly amount: number,
    private readonly unit: VolumeUnit
  ) {}

  static from(amount: number, unit: VolumeUnit): Volume {
    if (amount < 0) throw new Error('Volume cannot be negative');
    return new Volume(amount, unit);
  }

  get valueInLitres(): number {
    return this.amount * UNITS[this.unit].factorToLitres;
  }

  valueInUnit(targetUnit: VolumeUnit): number {
    return this.valueInLitres / UNITS[targetUnit].factorToLitres;
  }

  equals(other: Volume): boolean {
    // Using an epsilon to handle floating point precision issues across systems
    const EPSILON = 0.0000001;
    return Math.abs(this.valueInLitres - other.valueInLitres) < EPSILON;
  }

  toString(): string {
    return `${this.amount} ${UNITS[this.unit].symbol}`;
  }
}
