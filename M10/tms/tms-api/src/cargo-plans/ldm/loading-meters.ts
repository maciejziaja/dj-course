import { Length } from '../../shared/length';

/**
 * Loading metres (LDM) – how much of a load space's capacity a plan consumes.
 *
 * Deliberately *not* a {@link Length}, even though both read "metres": LDM is a
 * road-freight capacity unit (1 ldm = 1 running metre of a 2.4 m wide floor),
 * priced and rounded by its own rules. Keeping it a separate type stops it from
 * being compared with a pallet height or added to a floor width.
 *
 * The only way in from physical dimensions is {@link fromOccupiedFloorLength},
 * which makes the jump from geometry to capacity explicit.
 */
export class LoadingMeters {
  private constructor(private readonly amount: number) {}

  /** A figure already expressed in LDM – catalog data or a persisted value. */
  static of(amount: number): LoadingMeters {
    if (amount < 0) throw new Error('Loading metres cannot be negative');
    return new LoadingMeters(LoadingMeters.round(amount));
  }

  static zero(): LoadingMeters {
    return new LoadingMeters(0);
  }

  /**
   * Floor length taken up by the cargo, read as LDM.
   *
   * Summing happens on {@link Length} and converts once, so rounding never
   * accumulates across rows.
   */
  static fromOccupiedFloorLength(length: Length): LoadingMeters {
    return LoadingMeters.of(length.valueInUnit('M'));
  }

  /** LDM is quoted to the centimetre – anything finer is noise. */
  private static round(amount: number): number {
    return Number(amount.toFixed(2));
  }

  get valueInLdm(): number {
    return this.amount;
  }

  /** True when this load strictly needs more floor than `other` offers. */
  exceeds(other: LoadingMeters): boolean {
    return this.amount > other.amount;
  }

  equals(other: LoadingMeters): boolean {
    return this.amount === other.amount;
  }

  toString(): string {
    return `${this.amount} ldm`;
  }
}
