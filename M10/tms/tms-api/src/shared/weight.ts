export type WeightUnit = 'KG' | 'TONNE' | 'LB';

interface UnitDefinition {
  readonly factorToKg: number;
  readonly symbol: string;
}

const UNITS: Record<WeightUnit, UnitDefinition> = {
  KG:    { factorToKg: 1,           symbol: 'kg' },
  TONNE: { factorToKg: 1000,        symbol: 't'  },
  LB:    { factorToKg: 0.45359237,  symbol: 'lb' },
};

export class Weight {
  static readonly allowedUnits: WeightUnit[] = Object.keys(UNITS) as WeightUnit[];

  private constructor(
    private readonly amount: number,
    private readonly unit: WeightUnit
  ) {}

  static from(amount: number, unit: WeightUnit): Weight {
    if (amount < 0) throw new Error('Weight cannot be negative');
    return new Weight(amount, unit);
  }

  get valueInKg(): number {
    return this.amount * UNITS[this.unit].factorToKg;
  }

  valueInUnit(targetUnit: WeightUnit): number {
    return this.valueInKg / UNITS[targetUnit].factorToKg;
  }

  /** Adds two weights. The result is expressed in kilograms. */
  plus(other: Weight): Weight {
    return new Weight(this.valueInKg + other.valueInKg, 'KG');
  }

  /** Totals a collection of weights, so callers never fall back to raw numbers. */
  static sum(weights: readonly Weight[]): Weight {
    return weights.reduce<Weight>((total, w) => total.plus(w), Weight.from(0, 'KG'));
  }

  /** True when this weight is strictly heavier than `other`. */
  isHeavierThan(other: Weight): boolean {
    return this.valueInKg > other.valueInKg;
  }

  toUnit(targetUnit: WeightUnit): Weight {
    return new Weight(this.valueInUnit(targetUnit), targetUnit);
  }

  equals(other: Weight): boolean {
    // Using an epsilon to handle floating point precision issues across systems
    const EPSILON = 0.0000001;
    return Math.abs(this.valueInKg - other.valueInKg) < EPSILON;
  }

  toString(): string {
    const symbol = UNITS[this.unit].symbol;
    return `${this.amount} ${symbol}`;
  }
}
