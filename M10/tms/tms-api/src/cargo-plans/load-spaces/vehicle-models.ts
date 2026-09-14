import { Weight } from '../../shared/weight';

/**
 * A concrete vehicle configuration that can carry palletised cargo.
 *
 * Reference data, not a domain concept the planning rules speak: no invariant
 * asks which make a load space is. Models exist here only so a capacity class
 * can derive its guaranteed envelope from real vehicles instead of numbers
 * somebody typed in.
 *
 * Figures describe one representative configuration per model and would need
 * verifying against the actual Certificate of Conformity before real use —
 * payload in particular swings by several hundred kg with engine, trim and
 * optional equipment.
 */
export interface VehicleModel {
  readonly name: string;
  /**
   * Usable width for pallets in millimetres: the span **between the wheel
   * arches**, not the widest point of the body. Pallets are floor-loaded, so
   * the arches are what limits how many fit side by side.
   */
  readonly widthMm: number;
  /** Usable floor length in metres. */
  readonly lengthM: number;
  /** Internal load height in millimetres. */
  readonly heightMm: number;
  /** Legal payload (GVW − kerb weight): how much gross mass may be loaded. */
  readonly payloadCapacity: Weight;
}

export const FIAT_DUCATO_L2H2: VehicleModel = {
  name: 'Fiat Ducato L2H2',
  widthMm: 1422,
  lengthM: 3.12,
  heightMm: 1662,
  payloadCapacity: Weight.from(1440, 'KG'),
};

export const RENAULT_MASTER_L2H2: VehicleModel = {
  name: 'Renault Master L2H2',
  widthMm: 1380,
  lengthM: 3.08,
  heightMm: 1894,
  payloadCapacity: Weight.from(1400, 'KG'),
};

/**
 * MAN TGL 8.180 with a standard box body.
 *
 * A TGL is a *chassis*: its load space comes from the bodybuilder, not from
 * MAN. That is precisely why planning against a class rather than a model is
 * the sounder shape — "MAN TGL" alone does not describe a load space at all.
 */
export const MAN_TGL_8180_BOX: VehicleModel = {
  name: 'MAN TGL 8.180 (box body)',
  widthMm: 2450,
  lengthM: 6.2,
  heightMm: 2400,
  payloadCapacity: Weight.from(3500, 'KG'),
};
