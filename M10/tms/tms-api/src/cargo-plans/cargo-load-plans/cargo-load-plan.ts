import { CargoType, requirementsFor } from '../cargo/cargo.types';
import { CargoLoadPlanStatus } from './cargo-load-plan.types';
import { PalletUnit } from '../pallets/pallet-unit';
import { PalletSpec } from '../pallets/pallet-spec';
import {
  isRigidVehicle,
  permittedGrossLoad,
  GVW_OVERLOAD_TOLERANCE,
  type PalletLoadableSpace,
} from '../load-spaces';
import { Weight } from '../../shared/weight';
import type { Length } from '../../shared/length';
import type { LoadingMeters } from '../ldm/loading-meters';
import { ok, fail, type Result } from '../../shared/result';
import { UUID } from '../../shared/uuid';
import {
  PlanAlreadyFinalizedError,
  EmptyPlanError,
  WeightCapacityExceededError,
  VehiclePayloadExceededError,
  LdmCapacityExceededError,
  CargoTooTallForLoadSpaceError,
  CargoTooWideForLoadSpaceError,
  LoadSpaceCapabilityMismatchError,
  IncompatibleCargoColoadingError,
  CargoUnitNotFoundError,
  type CargoLoadPlanDomainError,
} from './cargo-load-plan.errors';

export interface AddCargoData {
  palletType: string;
  cargoType: CargoType;
  weight: Weight;
  cargoHeight: Length;
}

/** Strategy computing the LDM a set of units occupies in a given load space. */
export type LdmProvider = (units: PalletUnit[], loadSpace: PalletLoadableSpace) => LoadingMeters;

export class CargoLoadPlan {
  constructor(
    private readonly id: UUID<'CargoLoadPlan'>,
    private loadSpace: PalletLoadableSpace,
    private currentLdm: LoadingMeters,
    private assignedUnits: PalletUnit[] = [],
    private status: CargoLoadPlanStatus = CargoLoadPlanStatus.DRAFT,
    private version: number = 0
  ) {
    this.assignedUnits = [...assignedUnits];

    // 🔥🔥🔥 Validate invariants on reconstruction – throw because corrupt state from DB is unexpected
    const integrityResult = this.ensureLoadIntegrity(this.assignedUnits, this.loadSpace, this.currentLdm);
    if (!integrityResult.success) throw integrityResult.error;
  }

  public getSnapshot() {
    return {
      id: this.id,
      loadSpace: this.loadSpace,
      status: this.status,
      currentLdm: this.currentLdm,
      assignedUnits: Object.freeze(this.assignedUnits.map(u => u.getSnapshot())),
      version: this.version,
    };
  }

  public finalize(): Result<void, PlanAlreadyFinalizedError | EmptyPlanError | LdmCapacityExceededError> {
    const guardResult = this.ensurePlanNotFinalized();
    if (!guardResult.success) return guardResult;

    if (this.assignedUnits.length === 0) return fail(new EmptyPlanError());

    if (this.currentLdm.exceeds(this.loadSpace.maxLdm)) {
      return fail(new LdmCapacityExceededError(this.currentLdm.valueInLdm, this.loadSpace.maxLdm.valueInLdm));
    }

    this.status = CargoLoadPlanStatus.FINALIZED;
    return ok(undefined);
  }

  public addCargoToPlan(
    data: AddCargoData,
    // 🔥🔥🔥 strategy (not double dispatch)
    ldmProvider: LdmProvider
  ): Result<void, CargoLoadPlanDomainError> {
    const guardResult = this.ensurePlanNotFinalized();
    if (!guardResult.success) return guardResult;

    const spec = PalletSpec.fromType(data.palletType);
    const requirements = requirementsFor(data.cargoType);

    const unitResult = PalletUnit.create(spec, data.cargoType, requirements, data.weight, data.cargoHeight);
    if (!unitResult.success) return fail(unitResult.error);

    const candidateUnits = [...this.assignedUnits, unitResult.value];
    const newLdm = ldmProvider(candidateUnits, this.loadSpace);
    const integrityResult = this.ensureLoadIntegrity(candidateUnits, this.loadSpace, newLdm);
    if (!integrityResult.success) return integrityResult;

    this.assignedUnits = candidateUnits;
    this.currentLdm = newLdm;
    return ok(undefined);
  }

  public removeCargoFromPlan(
    unitId: string,
    ldmProvider: LdmProvider
  ): Result<void, CargoLoadPlanDomainError> {
    const guardResult = this.ensurePlanNotFinalized();
    if (!guardResult.success) return guardResult;

    const candidateUnits = this.assignedUnits.filter(u => u.getSnapshot().id !== unitId);
    if (candidateUnits.length === this.assignedUnits.length) {
      return fail(new CargoUnitNotFoundError(unitId));
    }

    const newLdm = ldmProvider(candidateUnits, this.loadSpace);
    const integrityResult = this.ensureLoadIntegrity(candidateUnits, this.loadSpace, newLdm);
    if (!integrityResult.success) return integrityResult;

    this.assignedUnits = candidateUnits;
    this.currentLdm = newLdm;
    return ok(undefined);
  }

  /**
   * Swaps the load space during planning, re-validating everything already loaded.
   *
   * Note this may cross the trailer / rigid-vehicle divide: moving a plan from a
   * 13.6 m trailer onto a Ducato re-runs the payload rule that only rigid
   * vehicles are subject to.
   */
  public changeLoadSpace(
    newLoadSpace: PalletLoadableSpace,
    ldmProvider: LdmProvider
  ): Result<void, CargoLoadPlanDomainError> {
    const guardResult = this.ensurePlanNotFinalized();
    if (!guardResult.success) return guardResult;

    const newLdm = ldmProvider(this.assignedUnits, newLoadSpace);
    const integrityResult = this.ensureLoadIntegrity(this.assignedUnits, newLoadSpace, newLdm);
    if (!integrityResult.success) return integrityResult;

    this.loadSpace = newLoadSpace;
    this.currentLdm = newLdm;
    return ok(undefined);
  }

  public isFinalized(): boolean {
    return this.status === CargoLoadPlanStatus.FINALIZED;
  }

  private ensurePlanNotFinalized(): Result<void, PlanAlreadyFinalizedError> {
    if (this.status === CargoLoadPlanStatus.FINALIZED) {
      return fail(new PlanAlreadyFinalizedError());
    }
    return ok(undefined);
  }

  private ensureLoadIntegrity(
    units: PalletUnit[],
    loadSpace: PalletLoadableSpace,
    ldm: LoadingMeters
  ): Result<void, CargoLoadPlanDomainError> {
    if (units.length === 0) return ok(undefined);

    // Payload goes first: where both apply it is the more specific limit, and
    // its message names the actual vehicle the planner has to swap out.
    const payloadResult = this.ensureVehiclePayloadNotExceeded(units, loadSpace);
    if (!payloadResult.success) return payloadResult;

    const weightResult = this.ensureWeightCapacityNotExceeded(units, loadSpace);
    if (!weightResult.success) return weightResult;

    const ldmResult = this.ensureLdmCapacityNotExceeded(ldm, loadSpace);
    if (!ldmResult.success) return ldmResult;

    const coloadResult = this.ensureCargoColoadingCompatibility(units);
    if (!coloadResult.success) return coloadResult;

    for (const unit of units) {
      const spatialResult = this.ensureCargoSpatialFit(unit, loadSpace);
      if (!spatialResult.success) return spatialResult;

      const capabilityResult = this.ensureLoadSpaceSatisfiesCargoRequirements(unit, loadSpace);
      if (!capabilityResult.success) return capabilityResult;
    }

    return ok(undefined);
  }

  private ensureWeightCapacityNotExceeded(
    units: PalletUnit[],
    loadSpace: PalletLoadableSpace
  ): Result<void, CargoLoadPlanDomainError> {
    // A rigid vehicle's floor limit *is* its payload (see guaranteedEnvelope),
    // so the payload rule – tolerance included – is the one that judges it.
    // Checking it here again would quietly cancel that tolerance.
    if (isRigidVehicle(loadSpace)) return ok(undefined);

    const totalWeight = this.grossWeightOf(units);
    if (totalWeight.isHeavierThan(loadSpace.maxWeightCapacity)) {
      return fail(new WeightCapacityExceededError(totalWeight.valueInKg, loadSpace.maxWeightCapacity.valueInKg));
    }
    return ok(undefined);
  }

  /**
   * The one rule rigid vehicles add: can this van actually carry the load?
   *
   * For a trailer there is no answer to give yet – the plan commits to a trailer
   * type and the rig that hauls it is settled later, so payload is somebody
   * else's check. For a rigid vehicle the load space *is* the vehicle, so the
   * question has to be answered while planning.
   *
   * The answer allows for {@link GVW_OVERLOAD_TOLERANCE} over the legal payload.
   */
  private ensureVehiclePayloadNotExceeded(
    units: PalletUnit[],
    loadSpace: PalletLoadableSpace
  ): Result<void, VehiclePayloadExceededError> {
    if (!isRigidVehicle(loadSpace)) return ok(undefined);

    const totalWeight = this.grossWeightOf(units);
    if (totalWeight.isHeavierThan(permittedGrossLoad(loadSpace))) {
      return fail(new VehiclePayloadExceededError(
        loadSpace.type,
        totalWeight.valueInKg,
        loadSpace.payloadCapacity.valueInKg,
        GVW_OVERLOAD_TOLERANCE.valueInKg,
      ));
    }
    return ok(undefined);
  }

  /** Cargo *and* the pallets under it – 33 europallets are 825kg of timber. */
  private grossWeightOf(units: PalletUnit[]): Weight {
    return Weight.sum(units.map(u => u.getSnapshot().grossWeight));
  }

  private ensureLdmCapacityNotExceeded(
    ldm: LoadingMeters,
    loadSpace: PalletLoadableSpace
  ): Result<void, CargoLoadPlanDomainError> {
    if (ldm.exceeds(loadSpace.maxLdm)) {
      return fail(new LdmCapacityExceededError(ldm.valueInLdm, loadSpace.maxLdm.valueInLdm));
    }
    return ok(undefined);
  }

  /**
   * Both dimensions that can stop a pallet from going in at all.
   *
   * Width matters now that load spaces can be vans: LdmCalculator starts a new
   * row for a unit that fits no existing one, which silently accommodates a
   * pallet wider than the floor itself. Nothing in the catalog is that wide
   * today – the narrowest space (Master, 1380mm) still clears the widest pallet
   * (CP-3, 1140mm) – but the margin used to be 1340mm on a trailer and is 240mm
   * now, so the rule is worth stating rather than relying on.
   */
  private ensureCargoSpatialFit(
    unit: PalletUnit,
    loadSpace: PalletLoadableSpace
  ): Result<void, CargoTooTallForLoadSpaceError | CargoTooWideForLoadSpaceError> {
    const { id, totalHeight, spec } = unit.getSnapshot();

    if (totalHeight.exceeds(loadSpace.height)) {
      return fail(new CargoTooTallForLoadSpaceError(id, totalHeight.valueInMm, loadSpace.type, loadSpace.height.valueInMm));
    }
    if (spec.width.exceeds(loadSpace.width)) {
      return fail(new CargoTooWideForLoadSpaceError(id, spec.width.valueInMm, loadSpace.type, loadSpace.width.valueInMm));
    }
    return ok(undefined);
  }

  private ensureLoadSpaceSatisfiesCargoRequirements(
    unit: PalletUnit,
    loadSpace: PalletLoadableSpace
  ): Result<void, LoadSpaceCapabilityMismatchError> {
    const { requirements: req } = unit.getSnapshot();
    const { capabilities: cap } = loadSpace;

    if (req.isTemperatureControlled && !cap.hasClimateControl) {
      return fail(new LoadSpaceCapabilityMismatchError('climate control required'));
    }
    if (req.requiresSideLoading && !cap.supportsSideLoading) {
      return fail(new LoadSpaceCapabilityMismatchError('side loading required'));
    }
    if (req.highSecurityRequired && !cap.hasHighSecurityLock) {
      return fail(new LoadSpaceCapabilityMismatchError('high security lock required'));
    }
    if (req.isBulk && !cap.isBulkReady) {
      return fail(new LoadSpaceCapabilityMismatchError('bulk-ready load space required'));
    }

    return ok(undefined);
  }

  private ensureCargoColoadingCompatibility(
    units: PalletUnit[]
  ): Result<void, IncompatibleCargoColoadingError> {
    const hasDangerous = units.some(
      u => u.getSnapshot().cargoType === CargoType.CHEMICAL || u.getSnapshot().cargoType === CargoType.DANGEROUS_GOODS
    );
    const hasFood = units.some(u => u.getSnapshot().cargoType === CargoType.FOOD);

    if (hasFood && hasDangerous) {
      return fail(new IncompatibleCargoColoadingError());
    }
    return ok(undefined);
  }
}
