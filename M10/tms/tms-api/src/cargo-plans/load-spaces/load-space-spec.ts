import { Weight } from '../../shared/weight';
import type { VehicleModel } from './vehicle-models';

/** Defines specific functional features of a cargo load space. */
export interface LoadSpaceCapabilities {
  /** Indicates presence of temperature regulation systems. Example cargo: Frozen meat. */
  readonly hasClimateControl: boolean;
  /** Confirms if cargo can be loaded from the side. Example cargo: Long timber. */
  readonly supportsSideLoading: boolean;
  /** Specifies reinforced locking mechanisms for high-value goods. Example cargo: Electronics. */
  readonly hasHighSecurityLock: boolean;
  /** Determines suitability for transporting loose bulk materials. Example cargo: Grain. */
  readonly isBulkReady: boolean;
}

/**
 * Tells us *when* the vehicle carrying this load space gets decided.
 *
 * - `TRAILER` – detachable. Planning commits to a trailer **type** only; which
 *   tractor unit pulls it is somebody else's problem, settled after the plan is
 *   agreed with the customer. Payload of the whole rig is verified later.
 * - `RIGID_VEHICLE` – integral. The load space *is* the vehicle, so choosing it
 *   at planning time already commits to one concrete vehicle model. There is no
 *   "later" in which to check whether it can carry the load – hence
 *   {@link RigidVehicleSpace.payloadCapacity}.
 */
export type LoadSpaceKind = 'TRAILER' | 'RIGID_VEHICLE';

/** General physical and functional description of a cargo load space. */
export interface LoadSpaceSpec {
  /** Whether the load space is detachable from its vehicle. Drives the reservation lifecycle. */
  readonly kind: LoadSpaceKind;
  /**
   * Key this class is stored and requested under ("reefer"), i.e. the
   * contract's `LoadSpaceType` value. Distinct from {@link type}, which is the
   * label a human reads.
   */
  readonly typeKey: string;
  /** Categorization of the load space. Example: "Reefer", "Fiat Ducato L2H2". */
  readonly type: string;
  /** Embedded set of specific operational capabilities and features. */
  readonly capabilities: LoadSpaceCapabilities;
  /** Boolean flag for standard palletized cargo compatibility. Example: True. */
  readonly canCarryPallets: boolean;
  /** Structural limit of cargo mass the load floor supports. Example: 24000kg. */
  readonly maxWeightCapacity: Weight;
}

/** Specialized specification for load spaces designed for pallet transport. */
export type PalletLoadableSpace = LoadSpaceSpec & {
  /** Explicit requirement for pallet loading capability. Example: True. */
  readonly canCarryPallets: true;
  /**
   * Usable horizontal span for pallets, in millimetres. Example: 2480.
   *
   * For vans this is the span **between the wheel arches**, not the widest
   * point of the body: pallets are floor-loaded, so the arches are what limits
   * how many fit side by side.
   */
  readonly widthMm: number;
  /** Internal vertical clearance of the load space in millimetres. Example: 2700. */
  readonly heightMm: number;
  /**
   * Maximum loading length available for cargo placement, in metres. Example: 13.6 (typical for TIR 😎).
   *
   * For trailers this is LDM in the road-freight sense (1 ldm = 1 running metre
   * of a 2.4 m wide floor). For rigid vehicles, whose floors are far narrower
   * than 2.4 m, the same number simply means usable floor length in metres.
   */
  readonly maxLdm: number;
};

/**
 * A class of vehicles that cannot be separated from their load space (vans,
 * box trucks) – for example "medium van", covering a Ducato and a Master alike.
 *
 * Planning commits to the class, never to a make and model. Every figure on it
 * is a **guaranteed minimum** across {@link fitsVehicles}: whatever vehicle
 * dispatch actually sends, it can honour a plan that fits the class. That is
 * why the envelope is the worst case and never an average – a plan is a promise
 * to the customer, so overstating capacity is the one direction that fails on
 * the loading ramp rather than in the office.
 *
 * It still carries a payload, because unlike a trailer the class determines the
 * vehicle well enough to answer "can it carry this?" while planning.
 */
export type RigidVehicleSpace = PalletLoadableSpace & {
  readonly kind: 'RIGID_VEHICLE';
  /**
   * Lowest legal payload in the class, counted against **gross** mass (cargo
   * plus the pallets carrying it).
   */
  readonly payloadCapacity: Weight;
  /** Concrete models that can honour a plan made against this class. */
  readonly fitsVehicles: readonly VehicleModel[];
};

export function isPalletLoadable(spec: LoadSpaceSpec): spec is PalletLoadableSpace {
  return spec.canCarryPallets === true && 'widthMm' in spec && 'maxLdm' in spec;
}

export function isRigidVehicle(spec: PalletLoadableSpace): spec is RigidVehicleSpace {
  return spec.kind === 'RIGID_VEHICLE';
}
