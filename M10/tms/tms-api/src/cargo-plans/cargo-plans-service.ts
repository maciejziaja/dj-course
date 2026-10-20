import { UUID } from '../shared/uuid';
import { ok, fail, type Result } from '../shared/result';
import { CargoLoadPlan } from './cargo-load-plans/cargo-load-plan';
import type { PalletUnit } from './pallets/pallet-unit';
import { LdmCalculator } from './ldm/ldm-calculator';
import { LoadingMeters } from './ldm/loading-meters';
import { LoadSpaceCatalog, type PalletLoadableSpace } from './load-spaces';
import type { CargoLoadPlanRepository } from './cargo-load-plans/cargo-load-plan.repository';
import type { CargoLoadPlanQueries, CargoLoadPlanReadModel } from './cargo-load-plans/cargo-load-plan.queries';
import { OptimisticLockError } from '../shared/optimistic-lock-error';
import type {
  CreateLoadPlanCommand,
  AddCargoCommand,
  RemoveCargoCommand,
  ChangeLoadSpaceCommand,
} from './cargo-plans.commands';
import type { WeightUnit } from '../shared/weight';
import { CargoPlanServiceError, LoadPlanNotFoundError } from './cargo-plans.errors';

interface CargoPlansApplicationService {
  /** Creates a new load plan for a specific load space (trailer type or rigid vehicle) */
  createLoadPlan(command: CreateLoadPlanCommand): Promise<Result<string, CargoPlanServiceError>>;

  /** Main operation to add cargo */
  addCargoToPlan(command: AddCargoCommand): Promise<Result<void, CargoPlanServiceError>>;

  /** Removes cargo (frees up LDM/weight) */
  removeCargoFromPlan(command: RemoveCargoCommand): Promise<Result<void, CargoPlanServiceError>>;

  /** Changes the load space during planning (requires re-validation of all loads) */
  changeLoadSpace(command: ChangeLoadSpaceCommand): Promise<Result<void, CargoPlanServiceError>>;

  /** Marks the plan as ready / locks further changes */
  finalizeLoadPlan(loadPlanId: string): Promise<Result<void, CargoPlanServiceError>>;

  /** Reads plan state (read-side, does not involve the aggregate) */
  findPlan(id: string, weightUnit?: WeightUnit): Promise<CargoLoadPlanReadModel | null>;
}

export class CargoPlansService implements CargoPlansApplicationService {
  private readonly ldmProvider = (units: PalletUnit[], loadSpace: PalletLoadableSpace) =>
    LdmCalculator.calculate(units, loadSpace);

  constructor(
    private readonly repository: CargoLoadPlanRepository,
    private readonly queries: CargoLoadPlanQueries,
  ) {}

  async createLoadPlan(command: CreateLoadPlanCommand): Promise<Result<string, CargoPlanServiceError>> {
    const loadSpace = LoadSpaceCatalog.fromType(command.loadSpaceType);
    const id = UUID.newUUID<'CargoLoadPlan'>();
    const plan = new CargoLoadPlan(id, loadSpace, LoadingMeters.zero());
    try {
      await this.repository.create(plan);
    } catch (e) {
      return fail(this.normalizeError(e));
    }
    return ok(id);
  }

  async addCargoToPlan(command: AddCargoCommand): Promise<Result<void, CargoPlanServiceError>> {
    const planResult = await this.findLoadPlan(command.loadPlanId);
    if (!planResult.success) return planResult;

    const domainResult = planResult.value.addCargoToPlan(command, this.ldmProvider);
    if (!domainResult.success) return domainResult;

    try {
      await this.repository.save(planResult.value);
    } catch (e) {
      return fail(this.normalizeError(e));
    }
    return ok(undefined);
  }

  async removeCargoFromPlan(command: RemoveCargoCommand): Promise<Result<void, CargoPlanServiceError>> {
    const planResult = await this.findLoadPlan(command.loadPlanId);
    if (!planResult.success) return planResult;

    const domainResult = planResult.value.removeCargoFromPlan(command.unitId, this.ldmProvider);
    if (!domainResult.success) return domainResult;

    try {
      await this.repository.save(planResult.value);
    } catch (e) {
      return fail(this.normalizeError(e));
    }
    return ok(undefined);
  }

  async changeLoadSpace(command: ChangeLoadSpaceCommand): Promise<Result<void, CargoPlanServiceError>> {
    const planResult = await this.findLoadPlan(command.loadPlanId);
    if (!planResult.success) return planResult;

    const newLoadSpace = LoadSpaceCatalog.fromType(command.loadSpaceType);
    const domainResult = planResult.value.changeLoadSpace(newLoadSpace, this.ldmProvider);
    if (!domainResult.success) return domainResult;

    try {
      await this.repository.save(planResult.value);
    } catch (e) {
      return fail(this.normalizeError(e));
    }
    return ok(undefined);
  }

  async finalizeLoadPlan(loadPlanId: string): Promise<Result<void, CargoPlanServiceError>> {
    const planResult = await this.findLoadPlan(loadPlanId);
    if (!planResult.success) return planResult;

    const domainResult = planResult.value.finalize();
    if (!domainResult.success) return domainResult;

    try {
      await this.repository.save(planResult.value);
    } catch (e) {
      return fail(this.normalizeError(e));
    }
    return ok(undefined);
  }

  async findPlan(id: string, weightUnit?: WeightUnit): Promise<CargoLoadPlanReadModel | null> {
    return this.queries.findPlan(id, weightUnit);
  }

  private async findLoadPlan(id: string): Promise<Result<CargoLoadPlan, CargoPlanServiceError>> {
    const plan = await this.repository.findById(id);
    if (!plan) return fail(new LoadPlanNotFoundError(id));
    return ok(plan);
  }

  private normalizeError(e: unknown): OptimisticLockError {
    if (e instanceof OptimisticLockError) return e;
    throw e;
  }
}
