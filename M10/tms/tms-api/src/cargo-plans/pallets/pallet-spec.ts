import { CargoType } from '../cargo/cargo.types';
import { Weight } from '../../shared/weight';
import { Length } from '../../shared/length';
import { UnknownPalletTypeError } from './pallet-spec.errors';

/** Pallet dimensions are standardised in millimetres. */
const mm = (amount: number): Length => Length.from(amount, 'MM');

export type Material = 'Wood' | 'Plastic' | 'Metal' | 'HDPE';

/**
 * Immutable definition of a pallet type (Value Object).
 */
export class PalletSpec {
  static fromType(type: string): PalletSpec {
    const factory = REGISTRY[type];
    if (!factory) throw new UnknownPalletTypeError(type, Object.keys(REGISTRY));
    return factory();
  }

  constructor( // (!) 🤨🤨🤨 "public readonly" all the things?!
    /** Key this spec is stored and requested under ("epal1"). The contract's `PalletType` value. */
    public readonly typeKey: string,
    public readonly label: string,
    public readonly material: Material,
    public readonly allowedCargoTypes: CargoType[],
    public readonly width: Length,
    public readonly length: Length,
    /** Base height of the empty pallet */
    public readonly height: Length,
    public readonly maxLoadCapacity: Weight,
    /** Weight of the empty pallet itself. Counts against every capacity limit. */
    public readonly tareWeight: Weight
  ) {
    this.validate();
    Object.freeze(this); // 🔥🔥🔥 immutability in runtime
  }

  isCargoTypeAllowed(cargoType: CargoType): boolean {
    return this.allowedCargoTypes.includes(cargoType);
  }

  isWeightExceeded(cargoWeight: Weight): boolean {
    return cargoWeight.isHeavierThan(this.maxLoadCapacity);
  }

  /** Cargo plus the pallet carrying it – what actually presses on the load floor. */
  grossWeightOf(cargoWeight: Weight): Weight {
    return cargoWeight.plus(this.tareWeight);
  }

  // 🔥🔥🔥 technical validation
  private validate(): void {
    if (!this.typeKey || this.typeKey.trim().length === 0) {
      throw new Error('Type key cannot be empty');
    }
    if (!this.label || this.label.trim().length === 0) {
      throw new Error('Label cannot be empty');
    }
    if (!this.allowedCargoTypes || this.allowedCargoTypes.length === 0) {
      throw new Error('Pallet must have at least one allowed cargo type');
    }
    if (this.width.isZero() || this.length.isZero() || this.height.isZero()) {
      throw new Error('Dimensions must be positive values');
    }
    if (this.maxLoadCapacity.valueInKg <= 0) {
      throw new Error('Max load capacity must be a positive value');
    }
    if (this.tareWeight.valueInKg <= 0) {
      throw new Error('Tare weight must be a positive value');
    }
  }

  static epal1(): PalletSpec {
    return new PalletSpec('epal1', 'EPAL 1', 'Wood', [CargoType.GENERAL, CargoType.FOOD, CargoType.ELECTRONICS], mm(800), mm(1200), mm(144), Weight.from(4000, 'KG'), Weight.from(25, 'KG'));
  }

  static industrial(): PalletSpec {
    return new PalletSpec('industrial', 'ISO-2', 'Wood', [CargoType.GENERAL, CargoType.ELECTRONICS], mm(1000), mm(1200), mm(162), Weight.from(1500, 'KG'), Weight.from(32, 'KG'));
  }

  static half(): PalletSpec {
    return new PalletSpec('half', 'EPAL-6', 'Wood', [CargoType.GENERAL, CargoType.FOOD], mm(600), mm(800), mm(144), Weight.from(750, 'KG'), Weight.from(10, 'KG'));
  }

  static cp1(): PalletSpec {
    return new PalletSpec('cp1', 'CP1', 'Wood', [CargoType.CHEMICAL, CargoType.DANGEROUS_GOODS], mm(1000), mm(1200), mm(138), Weight.from(1190, 'KG'), Weight.from(23, 'KG'));
  }

  static cp3(): PalletSpec {
    return new PalletSpec('cp3', 'CP-3', 'Wood', [CargoType.CHEMICAL, CargoType.DANGEROUS_GOODS], mm(1140), mm(1140), mm(138), Weight.from(1200, 'KG'), Weight.from(22, 'KG'));
  }

  static h1(): PalletSpec {
    return new PalletSpec('h1', 'H1', 'HDPE', [CargoType.FOOD], mm(800), mm(1200), mm(160), Weight.from(5000, 'KG'), Weight.from(15, 'KG'));
  }
}

/**
 * Lookup by the key the spec itself declares – the mapping cannot drift,
 * because there is only one place the key is written.
 */
const REGISTRY: Record<string, () => PalletSpec> = Object.fromEntries(
  [
    PalletSpec.epal1,
    PalletSpec.industrial,
    PalletSpec.half,
    PalletSpec.cp1,
    PalletSpec.cp3,
    PalletSpec.h1,
  ].map(factory => [factory().typeKey, factory]),
);
