/**
 * Runtime validation for the cargo-plans HTTP layer.
 *
 * Every schema used here is generated from the OpenAPI contract
 * (`npm run generate:types:openapi-zod-client`). The HTTP boundary must not
 * re-declare what the contract already states (allowed pallet / load space / cargo
 * types, uuid formats, numeric ranges), and the domain must not parse HTTP
 * input at all – it only guards its own invariants.
 */
import { z } from 'zod';

import { endpointParams, queryParams } from '../zod/contract';
import type { CargoType as ContractCargoType } from '../types/data-contracts';
import { CargoType } from './cargo/cargo.types';

/**
 * Compile-time guard for the `cargoType` cast in `cargo-plans.routes.ts`.
 * The domain enum deliberately carries the contract's wire values
 * (`ADR` -> DANGEROUS_GOODS), so no translation table is needed. If the
 * contract and the domain ever drift apart, this line stops compiling.
 */
export const contractCargoTypesMatchDomain: ContractCargoType extends `${CargoType}`
  ? true
  : never = true;

/**
 * Zod strips unknown keys by default; the contract declares
 * `additionalProperties: false` on every input payload, so the boundary has to
 * reject them instead of silently dropping them. This enforces what the
 * contract already says – it does not re-declare which keys are allowed.
 */
const closed = <T extends z.ZodType>(schema: T): T =>
  schema instanceof z.ZodObject ? (schema.strict() as unknown as T) : schema;

/** Request schemas per operationId, assembled from the generated contract. */
export const requestSchemas = {
  createLoadPlan: {
    body: closed(endpointParams.createLoadPlan.body),
  },
  getLoadPlan: {
    params: z.object({ id: endpointParams.getLoadPlan.id }),
    query: queryParams.getLoadPlan,
  },
  addCargoToLoadPlan: {
    params: z.object({ id: endpointParams.addCargoToLoadPlan.id }),
    body: closed(endpointParams.addCargoToLoadPlan.body),
  },
  removeCargoFromLoadPlan: {
    params: z.object({
      id: endpointParams.removeCargoFromLoadPlan.id,
      unitId: endpointParams.removeCargoFromLoadPlan.unitId,
    }),
  },
  changeLoadSpace: {
    params: z.object({ id: endpointParams.changeLoadSpace.id }),
    body: closed(endpointParams.changeLoadSpace.body),
  },
  finalizeLoadPlan: {
    params: z.object({ id: endpointParams.finalizeLoadPlan.id }),
  },
};

type RequestSchemas = {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
};

type ValidatedRequest<S extends RequestSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

export type ValidationResult<S extends RequestSchemas> =
  | { success: true; data: ValidatedRequest<S> }
  | { success: false; error: string };

const SOURCES = ['params', 'query', 'body'] as const;

const formatIssues = (source: string, error: z.ZodError): string =>
  error.issues
    .map((issue) => `${[source, ...issue.path].join('.')}: ${issue.message}`)
    .join('; ');

/**
 * Validates path params, query string and payload against the contract.
 * Returns the parsed (and defaulted, e.g. `weightUnit`) data, so handlers work
 * on values that are already proven to match the contract.
 */
export function validateRequest<S extends RequestSchemas>(
  schemas: S,
  req: { params: unknown; query: unknown; body: unknown },
): ValidationResult<S> {
  const parsed: Record<string, unknown> = {};

  for (const source of SOURCES) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return { success: false, error: formatIssues(source, result.error) };
    }
    parsed[source] = result.data;
  }

  return { success: true, data: parsed as ValidatedRequest<S> };
}
