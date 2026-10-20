import { Weight } from '../../shared/weight';
import { Length } from '../../shared/length';

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
   * Usable width for pallets: the span **between the wheel
   * arches**, not the widest point of the body. Pallets are floor-loaded, so
   * the arches are what limits how many fit side by side.
   */
  readonly width: Length;
  /** Usable floor length. */
  readonly length: Length;
  /** Internal load height. */
  readonly height: Length;
  /** Legal payload (GVW − kerb weight): how much gross mass may be loaded. */
  readonly payloadCapacity: Weight;
}

export const FIAT_DUCATO_L2H2: VehicleModel = {
  name: 'Fiat Ducato L2H2',
  width: Length.from(1422, 'MM'),
  length: Length.from(3.12, 'M'),
  height: Length.from(1662, 'MM'),
  payloadCapacity: Weight.from(1440, 'KG'),
};

export const RENAULT_MASTER_L2H2: VehicleModel = {
  name: 'Renault Master L2H2',
  width: Length.from(1380, 'MM'),
  length: Length.from(3.08, 'M'),
  height: Length.from(1894, 'MM'),
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
  width: Length.from(2450, 'MM'),
  length: Length.from(6.2, 'M'),
  height: Length.from(2400, 'MM'),
  payloadCapacity: Weight.from(3500, 'KG'),
};
