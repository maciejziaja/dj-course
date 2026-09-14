import { Request, Response } from 'express';
import express from 'express';

import logger from '../logger';
import { service } from './fake-dependency-injection';
import { OptimisticLockError } from '../shared/optimistic-lock-error';
import { CargoPlans } from '../types/CargoPlansRoute';
import { ErrorResponse } from '../types/data-contracts';
import { CargoType } from './cargo/cargo.types';
import { Weight } from '../shared/weight';
import { type CargoPlanServiceError } from './cargo-plans.errors';
import { requestSchemas, validateRequest } from './cargo-plans.validation';
import { asyncHandler } from '../shared/async-handler';

const router = express.Router();

// ── POST / — Create a new load plan ────────────────────────────────────────

router.post('/', asyncHandler('Failed to create load plan', async (
  req: Request<
    CargoPlans.CreateLoadPlan.RequestParams,
    CargoPlans.CreateLoadPlan.ResponseBody | ErrorResponse,
    CargoPlans.CreateLoadPlan.RequestBody,
    CargoPlans.CreateLoadPlan.RequestQuery
  >,
  res: Response<CargoPlans.CreateLoadPlan.ResponseBody | ErrorResponse>,
) => {
  const validation = validateRequest(requestSchemas.createLoadPlan, req);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const { body } = validation.data;

  const result = await service.createLoadPlan({ loadSpaceType: body.loadSpaceType });
  if (!result.success) {
    return handleResultError(res, result.error, 'Failed to create load plan');
  }

  logger.info('Load plan created', { plan_id: result.value, load_space_type: body.loadSpaceType });
  res.status(201).json({ id: result.value });
}));

// ── GET /:id — Get load plan details ────────────────────────────────────────

router.get('/:id', asyncHandler('Failed to fetch load plan', async (
  req: Request<
    CargoPlans.GetLoadPlan.RequestParams,
    CargoPlans.GetLoadPlan.ResponseBody | ErrorResponse,
    CargoPlans.GetLoadPlan.RequestBody,
    CargoPlans.GetLoadPlan.RequestQuery
  >,
  res: Response<CargoPlans.GetLoadPlan.ResponseBody | ErrorResponse>,
) => {
  const validation = validateRequest(requestSchemas.getLoadPlan, req);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const { params, query } = validation.data;

  const readModel = await service.findPlan(params.id, query.weightUnit);
  if (!readModel) {
    logger.warn('Failed to fetch load plan', { plan_id: params.id });
    return res.status(404).json({ error: `Load plan '${params.id}' not found` });
  }
  res.json(readModel);
}));

// ── POST /:id/cargo — Add cargo to plan ─────────────────────────────────────

router.post('/:id/cargo', asyncHandler('Failed to add cargo to plan', async (
  req: Request<
    CargoPlans.AddCargoToLoadPlan.RequestParams,
    CargoPlans.AddCargoToLoadPlan.ResponseBody | ErrorResponse,
    CargoPlans.AddCargoToLoadPlan.RequestBody,
    CargoPlans.AddCargoToLoadPlan.RequestQuery
  >,
  res: Response<CargoPlans.AddCargoToLoadPlan.ResponseBody | ErrorResponse>,
) => {
  const validation = validateRequest(requestSchemas.addCargoToLoadPlan, req);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const { params, body } = validation.data;

  const result = await service.addCargoToPlan({
    loadPlanId: params.id,
    palletType: body.palletType,
    // Safe by construction – see `contractCargoTypesMatchDomain`.
    cargoType: body.cargoType as CargoType,
    weight: Weight.from(body.weightKg, 'KG'),
    cargoHeightMm: body.cargoHeightMm,
  });
  if (!result.success) {
    return handleResultError(res, result.error, 'Failed to add cargo to plan');
  }
  logger.info('Cargo added to plan', { plan_id: params.id, pallet_type: body.palletType });
  res.status(204).send();
}));

// ── DELETE /:id/cargo/:unitId — Remove cargo from plan ──────────────────────

router.delete('/:id/cargo/:unitId', asyncHandler('Failed to remove cargo from plan', async (
  req: Request<
    CargoPlans.RemoveCargoFromLoadPlan.RequestParams,
    CargoPlans.RemoveCargoFromLoadPlan.ResponseBody | ErrorResponse,
    CargoPlans.RemoveCargoFromLoadPlan.RequestBody,
    CargoPlans.RemoveCargoFromLoadPlan.RequestQuery
  >,
  res: Response<CargoPlans.RemoveCargoFromLoadPlan.ResponseBody | ErrorResponse>,
) => {
  const validation = validateRequest(requestSchemas.removeCargoFromLoadPlan, req);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const { params } = validation.data;

  const result = await service.removeCargoFromPlan({
    loadPlanId: params.id,
    unitId: params.unitId,
  });
  if (!result.success) {
    return handleResultError(res, result.error, 'Failed to remove cargo from plan');
  }
  logger.info('Cargo removed from plan', { plan_id: params.id, unit_id: params.unitId });
  res.status(204).send();
}));

// ── PUT /:id/load-space — Change load space ─────────────────────────────────

router.put('/:id/load-space', asyncHandler('Failed to change load space', async (
  req: Request<
    CargoPlans.ChangeLoadSpace.RequestParams,
    CargoPlans.ChangeLoadSpace.ResponseBody | ErrorResponse,
    CargoPlans.ChangeLoadSpace.RequestBody,
    CargoPlans.ChangeLoadSpace.RequestQuery
  >,
  res: Response<CargoPlans.ChangeLoadSpace.ResponseBody | ErrorResponse>,
) => {
  const validation = validateRequest(requestSchemas.changeLoadSpace, req);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const { params, body } = validation.data;

  const result = await service.changeLoadSpace({
    loadPlanId: params.id,
    loadSpaceType: body.loadSpaceType,
  });
  if (!result.success) {
    return handleResultError(res, result.error, 'Failed to change load space');
  }
  logger.info('Load space changed', { plan_id: params.id, load_space_type: body.loadSpaceType });
  res.status(204).send();
}));

// ── POST /:id/finalize — Finalize the plan ──────────────────────────────────

router.post('/:id/finalize', asyncHandler('Failed to finalize load plan', async (
  req: Request<
    CargoPlans.FinalizeLoadPlan.RequestParams,
    CargoPlans.FinalizeLoadPlan.ResponseBody | ErrorResponse,
    CargoPlans.FinalizeLoadPlan.RequestBody,
    CargoPlans.FinalizeLoadPlan.RequestQuery
  >,
  res: Response<CargoPlans.FinalizeLoadPlan.ResponseBody | ErrorResponse>,
) => {
  const validation = validateRequest(requestSchemas.finalizeLoadPlan, req);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const { params } = validation.data;

  const result = await service.finalizeLoadPlan(params.id);
  if (!result.success) {
    return handleResultError(res, result.error, 'Failed to finalize load plan');
  }
  logger.info('Load plan finalized', { plan_id: params.id });
  res.status(204).send();
}));

// ── Error handling ──────────────────────────────────────────────────────────

function handleResultError(
  res: Response,
  err: CargoPlanServiceError,
  context: string
): Response<ErrorResponse> {
  if (err instanceof OptimisticLockError) {
    logger.warn(context, { error: err.message });
    return res.status(409).json({ error: err.message });
  }
  switch (err.kind) {
    case 'LoadPlanNotFoundError':
      logger.warn(context, { error: err.message });
      return res.status(404).json({ error: err.message });
    case 'PlanAlreadyFinalizedError':
      logger.warn(context, { error: err.message });
      return res.status(409).json({ error: err.message });
    case 'EmptyPlanError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'WeightCapacityExceededError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'VehiclePayloadExceededError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'LdmCapacityExceededError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'CargoTooTallForLoadSpaceError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'CargoTooWideForLoadSpaceError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'LoadSpaceCapabilityMismatchError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'IncompatibleCargoColoadingError':
      logger.warn(context, { error: err.message });
      return res.status(409).json({ error: err.message });
    case 'CargoUnitNotFoundError':
      logger.warn(context, { error: err.message });
      return res.status(404).json({ error: err.message });
    case 'PalletWeightExceedsCapacityError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
    case 'PalletCargoTypeNotAllowedError':
      logger.warn(context, { error: err.message });
      return res.status(422).json({ error: err.message });
  }
}

export default router;
