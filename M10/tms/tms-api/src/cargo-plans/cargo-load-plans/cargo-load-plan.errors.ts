export class PlanAlreadyFinalizedError {
  readonly kind = 'PlanAlreadyFinalizedError' as const;
  readonly message = 'Finalized plan cannot be modified.';
}

export class EmptyPlanError {
  readonly kind = 'EmptyPlanError' as const;
  readonly message = 'Cannot finalize empty plan.';
}

export class WeightCapacityExceededError {
  readonly kind = 'WeightCapacityExceededError' as const;
  readonly message: string;
  constructor(readonly actualKg: number, readonly maxKg: number) {
    this.message = `Weight capacity exceeded: ${actualKg}kg > ${maxKg}kg`;
  }
}

export class LdmCapacityExceededError {
  readonly kind = 'LdmCapacityExceededError' as const;
  readonly message: string;
  constructor(readonly actualLdm: number, readonly maxLdm: number) {
    this.message = `LDM capacity exceeded: ${actualLdm}m > ${maxLdm}m`;
  }
}

export class CargoTooTallForLoadSpaceError {
  readonly kind = 'CargoTooTallForLoadSpaceError' as const;
  readonly message: string;
  constructor(
    readonly unitId: string,
    readonly unitHeightMm: number,
    readonly loadSpaceType: string,
    readonly loadSpaceHeightMm: number
  ) {
    this.message = `Unit ${unitId} is too tall (${unitHeightMm}mm) for load space ${loadSpaceType} (${loadSpaceHeightMm}mm).`;
  }
}

export class CargoTooWideForLoadSpaceError {
  readonly kind = 'CargoTooWideForLoadSpaceError' as const;
  readonly message: string;
  constructor(
    readonly unitId: string,
    readonly palletWidthMm: number,
    readonly loadSpaceType: string,
    readonly loadSpaceWidthMm: number
  ) {
    this.message = `Unit ${unitId} is too wide (${palletWidthMm}mm) for load space ${loadSpaceType} (${loadSpaceWidthMm}mm).`;
  }
}

export class LoadSpaceCapabilityMismatchError {
  readonly kind = 'LoadSpaceCapabilityMismatchError' as const;
  readonly message: string;
  constructor(readonly reason: string) {
    this.message = `Load space capability mismatch: ${reason}`;
  }
}

/**
 * The chosen rigid vehicle cannot legally carry the planned load.
 *
 * Only reachable for rigid vehicles: picking one at planning time *is* picking
 * the vehicle, so its payload has to hold now rather than at reservation time.
 * Measured on gross weight – cargo plus the pallets carrying it.
 */
export class VehiclePayloadExceededError {
  readonly kind = 'VehiclePayloadExceededError' as const;
  readonly message: string;
  constructor(
    readonly vehicleType: string,
    readonly grossKg: number,
    readonly payloadKg: number
  ) {
    this.message = `Vehicle payload exceeded: ${vehicleType} cannot carry ${grossKg}kg gross (payload ${payloadKg}kg).`;
  }
}

export class IncompatibleCargoColoadingError {
  readonly kind = 'IncompatibleCargoColoadingError' as const;
  readonly message = 'Incompatible cargo: Cannot mix Food with Dangerous goods.';
}

export class CargoUnitNotFoundError {
  readonly kind = 'CargoUnitNotFoundError' as const;
  readonly message: string;
  constructor(readonly unitId: string) {
    this.message = `Unit with ID ${unitId} not found.`;
  }
}

import {
  PalletWeightExceedsCapacityError,
  PalletCargoTypeNotAllowedError,
} from '../pallets/pallet-spec.errors';

export type { PalletWeightExceedsCapacityError, PalletCargoTypeNotAllowedError };

export type CargoLoadPlanDomainError =
  | PlanAlreadyFinalizedError
  | EmptyPlanError
  | WeightCapacityExceededError
  | VehiclePayloadExceededError
  | LdmCapacityExceededError
  | CargoTooTallForLoadSpaceError
  | CargoTooWideForLoadSpaceError
  | LoadSpaceCapabilityMismatchError
  | IncompatibleCargoColoadingError
  | CargoUnitNotFoundError
  | PalletWeightExceedsCapacityError
  | PalletCargoTypeNotAllowedError;
