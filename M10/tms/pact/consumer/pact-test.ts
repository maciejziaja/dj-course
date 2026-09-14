/**
 * PACT consumer tests for the TMS API.
 *
 * Two consumers live here:
 *   TmsFrontend     – the web client (customers, transportation orders)
 *   CargoPlannerCli – a console script that drives the whole TMS/cargo-plans
 *                     load-planning process
 *
 * Env:
 *   CONTRACT_VARIANT=v1|v2|v3   shape of GET /cargo-plans/{id} the CLI asks for
 *   CONSUMER_VERSION=x.y.z      version published for CargoPlannerCli
 *   PACT_BROKER_URL             defaults to http://localhost:9292
 *   PUBLISH=false               generate the pacts without touching the broker
 */
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import fs from 'fs';
import path from 'path';
import pact from '@pact-foundation/pact-cli';

const { like, integer, number, boolean, string, eachLike, uuid } = MatchersV3;

const PACTS_DIR = path.resolve(process.cwd(), 'pacts');
const BROKER_URL = process.env.PACT_BROKER_URL ?? 'http://localhost:9292';
const BRANCH = process.env.PACT_BRANCH ?? 'main';

/** Express answers with `application/json; charset=utf-8`; Pact compares the media
 *  type and ignores the parameters, so pinning the bare type is enough. */
const JSON_CONTENT_TYPE = 'application/json';

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Contract expectation failed: ${message}`);
}

// ═══ Consumer 1: TmsFrontend ════════════════════════════════════════════════

const frontend = new PactV3({
  consumer: 'TmsFrontend',
  provider: 'TmsApi',
  dir: PACTS_DIR,
});

async function verifyTmsFrontendContract(): Promise<void> {
  // Interaction 1: GET /customers – paginated customer list
  frontend
    .given('customers exist')
    .uponReceiving('a request for the customer list')
    .withRequest({ method: 'GET', path: '/customers' })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: {
        data: eachLike({
          id: integer(1),
          first_name: string('Maida'),
          last_name: string('Dach'),
          email: string('forestraynor@bauch.io'),
        }),
        pagination: {
          page: integer(1),
          limit: integer(20),
          total: integer(500),
          totalPages: integer(25),
        },
      },
    });

  // Interaction 2: GET /transportation-orders?customer_id=1 – orders for customer 1
  frontend
    .given('customer 1 has transportation orders')
    .uponReceiving('a request for transportation orders of customer 1')
    .withRequest({
      method: 'GET',
      path: '/transportation-orders',
      query: { customer_id: '1' },
    })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: eachLike({
        customer_id: integer(1),
        order_number: like('#00472'),
        amount: like('43.19'),
        status: like('DELIVERED'),
      }),
    });

  await frontend.executeTest(async (mockService) => {
    const customersRes = await fetch(`${mockService.url}/customers`);
    const customersData = (await customersRes.json()) as {
      data: Array<{ id: number; first_name: string; last_name: string; email: string }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };

    expect(
      Array.isArray(customersData.data) && customersData.data.length > 0,
      `expected non-empty data array, got: ${JSON.stringify(customersData)}`,
    );
    expect(
      typeof customersData.pagination?.total === 'number',
      `expected pagination object, got: ${JSON.stringify(customersData)}`,
    );

    const ordersRes = await fetch(`${mockService.url}/transportation-orders?customer_id=1`);
    const ordersData = (await ordersRes.json()) as Array<{
      customer_id: number;
      order_number: string;
      amount: string;
      status: string;
    }>;

    expect(
      Array.isArray(ordersData) && ordersData.length > 0,
      `expected non-empty orders array, got: ${JSON.stringify(ordersData)}`,
    );
    expect(ordersData[0].customer_id === 1, `expected customer_id=1, got: ${JSON.stringify(ordersData[0])}`);
  });

  console.log('  ✔ TmsFrontend – customers and transportation orders');
}

// ═══ Consumer 2: CargoPlannerCli → TMS/cargo-plans ══════════════════════════
//
// The client below is a plain HTTP client with no knowledge of Pact – exactly what
// a console script talking to a running TMS would contain. Driving *it* (rather than
// hand-writing expectations) is what makes the generated pact honest.

type LoadSpaceType =
  | 'standard-curtainside' | 'mega' | 'reefer'
  | 'van-medium' | 'box-truck-8t';
type PalletType = 'epal1' | 'industrial' | 'half' | 'cp1' | 'cp3' | 'h1';
type CargoType = 'FOOD' | 'CHEMICAL' | 'ELECTRONICS' | 'ADR' | 'GENERAL';
type LoadPlanJson = Record<string, any>;
type ApiResult<T> =
  | { ok: true; status: number; value: T }
  | { ok: false; status: number; error: string };

class CargoPlansClient {
  constructor(private readonly baseUrl: string) {}

  async createPlan(loadSpaceType: LoadSpaceType): Promise<ApiResult<string>> {
    const res = await this.send('POST', '/cargo-plans', { loadSpaceType });
    if (!res.ok) return this.toFailure(res);
    const body = (await res.json()) as { id: string };
    expect(typeof body.id === 'string' && body.id.length > 0, `no id in ${JSON.stringify(body)}`);
    return { ok: true, status: res.status, value: body.id };
  }

  async getPlan(planId: string): Promise<ApiResult<LoadPlanJson>> {
    const res = await this.send('GET', `/cargo-plans/${planId}`);
    if (!res.ok) return this.toFailure(res);
    return { ok: true, status: res.status, value: (await res.json()) as LoadPlanJson };
  }

  async addCargo(
    planId: string,
    cargo: { palletType: PalletType; cargoType: CargoType; weightKg: number; cargoHeightMm: number },
  ): Promise<ApiResult<void>> {
    const res = await this.send('POST', `/cargo-plans/${planId}/cargo`, cargo);
    return res.ok ? { ok: true, status: res.status, value: undefined } : this.toFailure(res);
  }

  async removeCargo(planId: string, unitId: string): Promise<ApiResult<void>> {
    const res = await this.send('DELETE', `/cargo-plans/${planId}/cargo/${unitId}`);
    return res.ok ? { ok: true, status: res.status, value: undefined } : this.toFailure(res);
  }

  async changeLoadSpace(planId: string, loadSpaceType: LoadSpaceType): Promise<ApiResult<void>> {
    const res = await this.send('PUT', `/cargo-plans/${planId}/load-space`, { loadSpaceType });
    return res.ok ? { ok: true, status: res.status, value: undefined } : this.toFailure(res);
  }

  async finalizePlan(planId: string): Promise<ApiResult<void>> {
    const res = await this.send('POST', `/cargo-plans/${planId}/finalize`);
    return res.ok ? { ok: true, status: res.status, value: undefined } : this.toFailure(res);
  }

  private send(method: string, urlPath: string, body?: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${urlPath}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
  }

  /** Every non-2xx response of the TMS carries `{ "error": "..." }` – that shape is
   *  part of the contract, because the CLI shows it to the operator. */
  private async toFailure(res: Response): Promise<ApiResult<never>> {
    const body = (await res.json()) as { error?: string };
    expect(typeof body.error === 'string', `expected { error } for HTTP ${res.status}, got ${JSON.stringify(body)}`);
    return { ok: false, status: res.status, error: body.error as string };
  }
}

// ── Fixed ids ───────────────────────────────────────────────────────────────
// Pact replays each recorded request verbatim and in isolation – the id returned by
// POST /cargo-plans is never chained into the next call. Instead every interaction
// names a provider state, and the provider seeds exactly these rows.

const PLAN_DRAFT_WITH_CARGO = 'aaaaaaaa-0000-4000-8000-0000000000aa';
const UNIT_ONE = 'aaaaaaaa-1111-4111-8111-0000000001aa';
const UNIT_TWO = 'aaaaaaaa-2222-4222-8222-0000000002aa';
const PLAN_DRAFT_EMPTY = 'bbbbbbbb-0000-4000-8000-0000000000bb';
const PLAN_WITH_CHEMICAL = 'cccccccc-0000-4000-8000-0000000000cc';
const UNIT_CHEMICAL = 'cccccccc-1111-4111-8111-0000000001cc';
const PLAN_UNKNOWN = 'dddddddd-0000-4000-8000-0000000000dd';

/** Provider state descriptions – kept in sync with provider/verify-pact.ts. */
const STATE = {
  acceptsNewPlans: 'the TMS accepts new load plans',
  draftPlanWithoutCargo: 'a draft load plan exists with no cargo',
  draftPlanWithTwoGeneralUnits: 'a draft load plan exists with two GENERAL cargo units',
  draftPlanWithChemicalUnit: 'a draft load plan exists with a CHEMICAL cargo unit',
  noSuchPlan: 'no load plan exists with the given id',
} as const;

const WITH_CARGO_PARAMS = {
  planId: PLAN_DRAFT_WITH_CARGO,
  loadSpaceType: 'standard-curtainside',
  firstUnitId: UNIT_ONE,
  secondUnitId: UNIT_TWO,
};

// ── Contract variants for GET /cargo-plans/{id} ─────────────────────────────
//
// In CDC the consumer decides what the contract contains. These are three successive
// appetites of the CLI for the load-plan read model. Each pairs the Pact expectation
// with the projection the client performs, so the contract cannot claim a field
// nobody reads.
//
//   v1 – everything the API offers
//   v2 – drops loadSpace.capabilities and units[].requirements. Narrowing is safe: the
//        provider may keep returning them, Pact only checks what was asked for.
//   v3 – renames units[].requirements to units[].handlingRequirements. Breaking: the
//        provider has no such field, so verification must fail.

const planEnvelope = {
  id: uuid(PLAN_DRAFT_WITH_CARGO),
  status: 'DRAFT',
  version: integer(3),
  weightUnit: 'KG',
  currentLdm: number(1.2),
  plannedWeight: number(1200),
};

const loadSpaceCore = {
  type: like('standard-curtainside'),
  label: like('Standard Curtainside'),
  kind: like('TRAILER'),
  canCarryPallets: boolean(true),
  maxWeightCapacityKg: number(24000),
  widthMm: integer(2480),
  heightMm: integer(2700),
  maxLdm: number(13.6),
};

const unitCore = {
  id: uuid(UNIT_ONE),
  palletLabel: string('EPAL 1'),
  cargoType: like('GENERAL'),
  weight: number(600),
  totalHeightMm: integer(1344),
};

const requirementsShape = {
  isTemperatureControlled: boolean(false),
  requiresSideLoading: boolean(false),
  isBulk: boolean(false),
  highSecurityRequired: boolean(false),
};

const capabilitiesShape = {
  hasClimateControl: boolean(false),
  supportsSideLoading: boolean(true),
  hasHighSecurityLock: boolean(false),
  isBulkReady: boolean(false),
};

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined || value === null) {
    throw new Error(`CargoPlannerCli expected field '${field}' in the load plan response`);
  }
  return value;
}

/** The fields the CLI renders for every variant. */
function readCommonPlan(json: LoadPlanJson): { status: string; unitCount: number } {
  const loadSpace = required(json.loadSpace, 'loadSpace');
  required(json.id, 'id');
  required(json.version, 'version');
  required(json.weightUnit, 'weightUnit');
  required(json.currentLdm, 'currentLdm');
  required(json.plannedWeight, 'plannedWeight');
  required(loadSpace.type, 'loadSpace.type');
  required(loadSpace.maxWeightCapacityKg, 'loadSpace.maxWeightCapacityKg');

  const units = required(json.units, 'units') as LoadPlanJson[];
  units.forEach((unit) => {
    required(unit.id, 'units[].id');
    required(unit.palletLabel, 'units[].palletLabel');
    required(unit.cargoType, 'units[].cargoType');
    required(unit.weight, 'units[].weight');
    required(unit.totalHeightMm, 'units[].totalHeightMm');
  });

  return { status: required(json.status, 'status'), unitCount: units.length };
}

interface ContractVariant {
  note: string;
  defaultVersion: string;
  getPlanResponseBody: unknown;
  readPlan(json: LoadPlanJson): { status: string; unitCount: number };
}

const VARIANTS: Record<string, ContractVariant> = {
  v1: {
    note: 'full read model',
    defaultVersion: '1.1.0',
    getPlanResponseBody: {
      ...planEnvelope,
      loadSpace: { ...loadSpaceCore, capabilities: capabilitiesShape },
      units: eachLike({ ...unitCore, requirements: requirementsShape }),
    },
    readPlan(json) {
      const summary = readCommonPlan(json);
      const capabilities = required(json.loadSpace.capabilities, 'loadSpace.capabilities');
      required(capabilities.hasClimateControl, 'loadSpace.capabilities.hasClimateControl');
      (json.units as LoadPlanJson[]).forEach((unit) => {
        const requirements = required(unit.requirements, 'units[].requirements');
        required(requirements.isTemperatureControlled, 'units[].requirements.isTemperatureControlled');
      });
      return summary;
    },
  },

  v2: {
    note: 'slim read model – no load space capabilities, no cargo requirements',
    defaultVersion: '2.1.0',
    getPlanResponseBody: {
      ...planEnvelope,
      loadSpace: loadSpaceCore,
      units: eachLike(unitCore),
    },
    readPlan: readCommonPlan,
  },

  v3: {
    note: 'renamed field – units[].handlingRequirements instead of units[].requirements',
    defaultVersion: '3.1.0',
    getPlanResponseBody: {
      ...planEnvelope,
      loadSpace: loadSpaceCore,
      units: eachLike({ ...unitCore, handlingRequirements: requirementsShape }),
    },
    readPlan(json) {
      const summary = readCommonPlan(json);
      (json.units as LoadPlanJson[]).forEach((unit) => {
        const requirements = required(unit.handlingRequirements, 'units[].handlingRequirements');
        required(requirements.isTemperatureControlled, 'units[].handlingRequirements.isTemperatureControlled');
      });
      return summary;
    },
  },
};

const variantName = process.env.CONTRACT_VARIANT ?? 'v1';
const variant = VARIANTS[variantName];
if (!variant) {
  throw new Error(`Unknown CONTRACT_VARIANT '${variantName}'. Use one of: ${Object.keys(VARIANTS).join(', ')}`);
}
const cargoConsumerVersion = process.env.CONSUMER_VERSION ?? variant.defaultVersion;

const cargoPlanner = new PactV3({
  consumer: 'CargoPlannerCli',
  provider: 'TmsApi',
  dir: PACTS_DIR,
});

async function verifyCargoPlannerContract(): Promise<void> {
  // ── Scenario 1: the whole planning process ────────────────────────────────

  cargoPlanner
    .given(STATE.acceptsNewPlans)
    .uponReceiving('a request to create a load plan on a standard curtainside trailer')
    .withRequest({
      method: 'POST',
      path: '/cargo-plans',
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { loadSpaceType: 'standard-curtainside' },
    })
    .willRespondWith({
      status: 201,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { id: uuid(PLAN_DRAFT_WITH_CARGO) },
    });

  cargoPlanner
    .given(STATE.draftPlanWithoutCargo, {
      planId: PLAN_DRAFT_WITH_CARGO,
      loadSpaceType: 'standard-curtainside',
    })
    .uponReceiving('a request to add a GENERAL cargo unit to a draft plan')
    .withRequest({
      method: 'POST',
      path: `/cargo-plans/${PLAN_DRAFT_WITH_CARGO}/cargo`,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { palletType: 'epal1', cargoType: 'GENERAL', weightKg: 600, cargoHeightMm: 1200 },
    })
    .willRespondWith({ status: 204 });

  cargoPlanner
    .given(STATE.draftPlanWithTwoGeneralUnits, WITH_CARGO_PARAMS)
    .uponReceiving(`a request for the details of a draft load plan (${variantName}: ${variant.note})`)
    .withRequest({ method: 'GET', path: `/cargo-plans/${PLAN_DRAFT_WITH_CARGO}` })
    .willRespondWith({
      status: 200,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: variant.getPlanResponseBody,
    });

  cargoPlanner
    .given(STATE.draftPlanWithTwoGeneralUnits, WITH_CARGO_PARAMS)
    .uponReceiving('a request to remove one cargo unit from a draft plan')
    .withRequest({ method: 'DELETE', path: `/cargo-plans/${PLAN_DRAFT_WITH_CARGO}/cargo/${UNIT_ONE}` })
    .willRespondWith({ status: 204 });

  cargoPlanner
    .given(STATE.draftPlanWithTwoGeneralUnits, WITH_CARGO_PARAMS)
    .uponReceiving('a request to swap the load space of a draft plan for a mega trailer')
    .withRequest({
      method: 'PUT',
      path: `/cargo-plans/${PLAN_DRAFT_WITH_CARGO}/load-space`,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { loadSpaceType: 'mega' },
    })
    .willRespondWith({ status: 204 });

  cargoPlanner
    .given(STATE.draftPlanWithTwoGeneralUnits, WITH_CARGO_PARAMS)
    .uponReceiving('a request to finalize a draft plan that carries cargo')
    .withRequest({ method: 'POST', path: `/cargo-plans/${PLAN_DRAFT_WITH_CARGO}/finalize` })
    .willRespondWith({ status: 204 });

  // ── Scenario 2: food must not travel with chemicals ───────────────────────

  cargoPlanner
    .given(STATE.draftPlanWithChemicalUnit, {
      planId: PLAN_WITH_CHEMICAL,
      loadSpaceType: 'standard-curtainside',
      unitId: UNIT_CHEMICAL,
    })
    .uponReceiving('a request to add FOOD to a plan that already carries CHEMICAL cargo')
    .withRequest({
      method: 'POST',
      path: `/cargo-plans/${PLAN_WITH_CHEMICAL}/cargo`,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { palletType: 'h1', cargoType: 'FOOD', weightKg: 600, cargoHeightMm: 1200 },
    })
    .willRespondWith({
      status: 409,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { error: like('Incompatible cargo: Cannot mix Food with Dangerous goods.') },
    });

  // ── Scenario 3: the other refusals ────────────────────────────────────────

  cargoPlanner
    .given(STATE.acceptsNewPlans)
    .uponReceiving('a request to create a load plan on a load space type the TMS does not know')
    .withRequest({
      method: 'POST',
      path: '/cargo-plans',
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { loadSpaceType: 'flatbed' },
    })
    .willRespondWith({
      status: 400,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { error: like("Unknown loadSpaceType: 'flatbed'") },
    });

  cargoPlanner
    .given(STATE.draftPlanWithoutCargo, { planId: PLAN_DRAFT_EMPTY, loadSpaceType: 'standard-curtainside' })
    .uponReceiving('a request to finalize a plan that has no cargo on it')
    .withRequest({ method: 'POST', path: `/cargo-plans/${PLAN_DRAFT_EMPTY}/finalize` })
    .willRespondWith({
      status: 422,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { error: like('Cannot finalize empty plan.') },
    });

  cargoPlanner
    .given(STATE.noSuchPlan, { planId: PLAN_UNKNOWN })
    .uponReceiving('a request for the details of a load plan that does not exist')
    .withRequest({ method: 'GET', path: `/cargo-plans/${PLAN_UNKNOWN}` })
    .willRespondWith({
      status: 404,
      headers: { 'Content-Type': JSON_CONTENT_TYPE },
      body: { error: like(`Load plan '${PLAN_UNKNOWN}' not found`) },
    });

  await cargoPlanner.executeTest(async (mockService) => {
    const client = new CargoPlansClient(mockService.url);

    // Scenario 1 – create → add cargo → inspect → remove → swap load space → finalize
    const created = await client.createPlan('standard-curtainside');
    expect(created.ok && created.status === 201, `create plan returned ${created.status}`);

    const added = await client.addCargo(PLAN_DRAFT_WITH_CARGO, {
      palletType: 'epal1',
      cargoType: 'GENERAL',
      weightKg: 600,
      cargoHeightMm: 1200,
    });
    expect(added.ok && added.status === 204, `add cargo returned ${added.status}`);

    const details = await client.getPlan(PLAN_DRAFT_WITH_CARGO);
    expect(details.ok, 'plan details should be readable');
    if (details.ok) {
      // The projection throws if the response misses anything the CLI renders.
      const summary = variant.readPlan(details.value);
      expect(summary.status === 'DRAFT', `expected a DRAFT plan, got ${summary.status}`);
      expect(summary.unitCount > 0, 'a draft plan with cargo must list its units');
    }

    const removed = await client.removeCargo(PLAN_DRAFT_WITH_CARGO, UNIT_ONE);
    expect(removed.ok && removed.status === 204, `remove cargo returned ${removed.status}`);

    const reSpaced = await client.changeLoadSpace(PLAN_DRAFT_WITH_CARGO, 'mega');
    expect(reSpaced.ok && reSpaced.status === 204, `change load space returned ${reSpaced.status}`);

    const finalized = await client.finalizePlan(PLAN_DRAFT_WITH_CARGO);
    expect(finalized.ok && finalized.status === 204, `finalize returned ${finalized.status}`);
    console.log('  ✔ CargoPlannerCli – create → add cargo → inspect → remove → swap load space → finalize');

    // Scenario 2 – the TMS refuses to co-load food with chemicals
    const coload = await client.addCargo(PLAN_WITH_CHEMICAL, {
      palletType: 'h1',
      cargoType: 'FOOD',
      weightKg: 600,
      cargoHeightMm: 1200,
    });
    expect(!coload.ok, 'co-loading food with chemicals must not succeed');
    // The CLI branches on the status code, so the code is what the contract pins down.
    expect(coload.status === 409, `expected HTTP 409 conflict, got ${coload.status}`);
    console.log('  ✔ CargoPlannerCli – FOOD next to CHEMICAL is rejected with 409');

    // Scenario 3 – the other refusals
    const badTrailer = await client.createPlan('flatbed' as never);
    expect(!badTrailer.ok && badTrailer.status === 400, `expected HTTP 400, got ${badTrailer.status}`);

    const emptyFinalize = await client.finalizePlan(PLAN_DRAFT_EMPTY);
    expect(!emptyFinalize.ok && emptyFinalize.status === 422, `expected HTTP 422, got ${emptyFinalize.status}`);

    const missing = await client.getPlan(PLAN_UNKNOWN);
    expect(!missing.ok && missing.status === 404, `expected HTTP 404, got ${missing.status}`);
    console.log('  ✔ CargoPlannerCli – unknown load space 400, empty plan 422, unknown plan 404');
  });
}

// ═══ Publish ════════════════════════════════════════════════════════════════

async function publish(consumer: string, consumerVersion: string): Promise<void> {
  try {
    await pact.publishPacts({
      pactFilesOrDirs: [path.join(PACTS_DIR, `${consumer}-TmsApi.json`)],
      pactBroker: BROKER_URL,
      consumerVersion,
      branch: BRANCH,
    });
    console.log(`  Published ${consumer} ${consumerVersion} (branch ${BRANCH}) to ${BROKER_URL}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  Could not publish ${consumer} to the broker (is it running?):`, message);
  }
}

/** Pact merges into an existing pact file, so a regenerated contract would keep
 *  interactions it no longer asks for – and "the consumer dropped a field" would never
 *  actually reach the broker. Start from a clean file every run. */
function discardPreviousPacts(): void {
  for (const consumer of ['TmsFrontend', 'CargoPlannerCli']) {
    fs.rmSync(path.join(PACTS_DIR, `${consumer}-TmsApi.json`), { force: true });
  }
}

async function main(): Promise<void> {
  console.log(`\n▶ Consumer contracts for TmsApi  |  cargo-plans variant ${variantName} (${variant.note})\n`);

  discardPreviousPacts();

  await verifyTmsFrontendContract();
  await verifyCargoPlannerContract();

  if (process.env.PUBLISH === 'false') {
    console.log(`\n  PUBLISH=false – pacts written to ${PACTS_DIR}, broker untouched.\n`);
    return;
  }

  console.log('');
  await publish('TmsFrontend', `1.0.0-${Date.now()}`);
  await publish('CargoPlannerCli', cargoConsumerVersion);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
