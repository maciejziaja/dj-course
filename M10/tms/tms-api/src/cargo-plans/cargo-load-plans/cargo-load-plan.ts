import { CargoType, requirementsFor } from '../cargo/cargo.types';
import { CargoLoadPlanStatus } from './cargo-load-plan.types';
import { PalletUnit } from '../pallets/pallet-unit';
import { PalletSpec } from '../pallets/pallet-spec';
import { isRigidVehicle, type PalletLoadableSpace } from '../load-spaces';
import { Weight } from '../../shared/weight';
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
  cargoHeightMm: number;
}

export class CargoLoadPlan {
  constructor(
    private readonly id: UUID<'CargoLoadPlan'>,
    private loadSpace: PalletLoadableSpace,
    private currentLdm: number,
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

    if (this.currentLdm > this.loadSpace.maxLdm) {
      return fail(new LdmCapacityExceededError(this.currentLdm, this.loadSpace.maxLdm));
    }

    this.status = CargoLoadPlanStatus.FINALIZED;
    return ok(undefined);
  }

  public addCargoToPlan(
    data: AddCargoData,
    // 🔥🔥🔥 strategy (not double dispatch)
    ldmProvider: (u: PalletUnit[], t: PalletLoadableSpace) => number
  ): Result<void, CargoLoadPlanDomainError> {
    const guardResult = this.ensurePlanNotFinalized();
    if (!guardResult.success) return guardResult;

    const spec = PalletSpec.fromType(data.palletType);
    const requirements = requirementsFor(data.cargoType);

    const unitResult = PalletUnit.create(spec, data.cargoType, requirements, data.weight, data.cargoHeightMm);
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
    ldmProvider: (u: PalletUnit[], t: PalletLoadableSpace) => number
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
    ldmProvider: (u: PalletUnit[], t: PalletLoadableSpace) => number
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
    ldm: number
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
   */
  private ensureVehiclePayloadNotExceeded(
    units: PalletUnit[],
    loadSpace: PalletLoadableSpace
  ): Result<void, VehiclePayloadExceededError> {
    if (!isRigidVehicle(loadSpace)) return ok(undefined);

    const totalWeight = this.grossWeightOf(units);
    if (totalWeight.isHeavierThan(loadSpace.payloadCapacity)) {
      return fail(new VehiclePayloadExceededError(
        loadSpace.type,
        totalWeight.valueInKg,
        loadSpace.payloadCapacity.valueInKg,
      ));
    }
    return ok(undefined);
  }

  /** Cargo *and* the pallets under it – 33 europallets are 825kg of timber. */
  private grossWeightOf(units: PalletUnit[]): Weight {
    return Weight.sum(units.map(u => u.getSnapshot().grossWeight));
  }

  private ensureLdmCapacityNotExceeded(
    ldm: number,
    loadSpace: PalletLoadableSpace
  ): Result<void, CargoLoadPlanDomainError> {
    if (ldm > loadSpace.maxLdm) {
      return fail(new LdmCapacityExceededError(ldm, loadSpace.maxLdm));
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
    const { id, totalHeightMm, spec } = unit.getSnapshot();

    if (totalHeightMm > loadSpace.heightMm) {
      return fail(new CargoTooTallForLoadSpaceError(id, totalHeightMm, loadSpace.type, loadSpace.heightMm));
    }
    if (spec.width > loadSpace.widthMm) {
      return fail(new CargoTooWideForLoadSpaceError(id, spec.width, loadSpace.type, loadSpace.widthMm));
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
      return fail(new LoadSpaceCapabilityMismatchError('Climate control required'));
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
