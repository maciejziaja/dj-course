export type LengthUnit = 'MM' | 'CM' | 'M';

interface UnitDefinition {
  readonly factorToMm: number;
  readonly symbol: string;
}

const UNITS: Record<LengthUnit, UnitDefinition> = {
  MM: { factorToMm: 1,    symbol: 'mm' },
  CM: { factorToMm: 10,   symbol: 'cm' },
  M:  { factorToMm: 1000, symbol: 'm'  },
};

/**
 * A one-dimensional physical extent: width, length or height alike.
 *
 * One class for all three on purpose – they are the same quantity, convertible
 * between units with no extra context. Deliberately absent: subtraction (no rule
 * needs it) and multiplication (no rule speaks of areas yet).
 */
export class Length {
  private constructor(
    private readonly amount: number,
    private readonly unit: LengthUnit
  ) {}

  static from(amount: number, unit: LengthUnit): Length {
    if (amount < 0) throw new Error('Length cannot be negative');
    return new Length(amount, unit);
  }

  get valueInMm(): number {
    return this.amount * UNITS[this.unit].factorToMm;
  }

  valueInUnit(targetUnit: LengthUnit): number {
    return this.valueInMm / UNITS[targetUnit].factorToMm;
  }

  /** Adds two lengths. The result is expressed in millimetres. */
  plus(other: Length): Length {
    return new Length(this.valueInMm + other.valueInMm, 'MM');
  }

  /** Totals a collection of lengths – an empty one totals zero. */
  static sum(lengths: readonly Length[]): Length {
    return lengths.reduce<Length>((total, l) => total.plus(l), Length.from(0, 'MM'));
  }

  static min(lengths: readonly Length[]): Length {
    return Length.nonEmpty(lengths).reduce((shortest, l) => (shortest.exceeds(l) ? l : shortest));
  }

  static max(lengths: readonly Length[]): Length {
    return Length.nonEmpty(lengths).reduce((longest, l) => (l.exceeds(longest) ? l : longest));
  }

  private static nonEmpty(lengths: readonly Length[]): readonly Length[] {
    if (lengths.length === 0) throw new Error('Cannot pick from an empty set of lengths');
    return lengths;
  }

  /** Sort comparator: negative when `a` is shorter, positive when longer. */
  static compare(a: Length, b: Length): number {
    return a.valueInMm - b.valueInMm;
  }

  /** True when this length is strictly greater than `other`. */
  exceeds(other: Length): boolean {
    return this.valueInMm > other.valueInMm;
  }

  isZero(): boolean {
    return this.valueInMm === 0;
  }

  equals(other: Length): boolean {
    // Using an epsilon to handle floating point precision issues across systems
    const EPSILON = 0.0000001;
    return Math.abs(this.valueInMm - other.valueInMm) < EPSILON;
  }

  toString(): string {
    return `${this.amount} ${UNITS[this.unit].symbol}`;
  }
}
