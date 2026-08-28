/**
 * PACT provider verification for the TMS API.
 *
 * Pulls the consumer contracts from the broker, replays every interaction against the
 * running TMS and publishes the results back, so `can-i-deploy` has something to
 * reason about.
 *
 * The cargo-plans states seed real rows in `cargo_plans.*` over `pg`: Pact replays
 * each recorded request verbatim and in isolation, so the provider – not the previous
 * interaction – has to put the database into the expected state. Each handler wipes
 * its own plan ids first, because verification genuinely mutates data (it deletes
 * cargo, swaps trailers, finalizes plans).
 *
 * Env:
 *   PROVIDER_BASE_URL         defaults to http://localhost:3000
 *   PACT_BROKER_URL           defaults to http://localhost:9292
 *   PROVIDER_VERSION          defaults to 1.0.0
 *   PACT_TMS_DATABASE_URL     where the provider states seed their rows
 *   VERIFY_CONSUMER_VERSION   verify exactly this CargoPlannerCli version instead of
 *                             "whatever is latest on the branch"
 */
import { Verifier, VerifierOptions } from '@pact-foundation/pact';
import { Pool } from 'pg';

const PROVIDER = 'TmsApi';
const CARGO_CONSUMER = 'CargoPlannerCli';

const brokerUrl = process.env.PACT_BROKER_URL ?? 'http://localhost:9292';
const providerVersion = process.env.PROVIDER_VERSION ?? '1.0.0';
const branch = process.env.PACT_BRANCH ?? 'main';
const pinnedConsumerVersion = process.env.VERIFY_CONSUMER_VERSION;

// ── cargo-plans provider states ─────────────────────────────────────────────

const pool = new Pool({
  connectionString:
    process.env.PACT_TMS_DATABASE_URL ?? 'postgresql://admin:strongpassword123@localhost:5433/tms',
});

const PLAN_DRAFT_WITH_CARGO = 'aaaaaaaa-0000-4000-8000-0000000000aa';
const UNIT_ONE = 'aaaaaaaa-1111-4111-8111-0000000001aa';
const UNIT_TWO = 'aaaaaaaa-2222-4222-8222-0000000002aa';
const PLAN_DRAFT_EMPTY = 'bbbbbbbb-0000-4000-8000-0000000000bb';
const PLAN_WITH_CHEMICAL = 'cccccccc-0000-4000-8000-0000000000cc';
const UNIT_CHEMICAL = 'cccccccc-1111-4111-8111-0000000001cc';
const PLAN_UNKNOWN = 'dddddddd-0000-4000-8000-0000000000dd';

/** Every plan id this suite owns – cleared before each state is materialised. */
const OWNED_PLAN_IDS = [PLAN_DRAFT_WITH_CARGO, PLAN_DRAFT_EMPTY, PLAN_WITH_CHEMICAL, PLAN_UNKNOWN];

type StateParams = Record<string, unknown> | undefined;

function param(params: StateParams, name: string, fallback: string): string {
  const value = params?.[name];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

async function resetOwnedPlans(): Promise<void> {
  // ON DELETE CASCADE takes the units with it.
  await pool.query('DELETE FROM cargo_plans.cargo_load_plans WHERE id = ANY($1::uuid[])', [OWNED_PLAN_IDS]);
}

async function insertPlan(planId: string, trailerType: string, currentLdm: number): Promise<void> {
  await pool.query(
    `INSERT INTO cargo_plans.cargo_load_plans (id, trailer_type, status, current_ldm, version)
     VALUES ($1, $2, 'DRAFT', $3, 3)`,
    [planId, trailerType, currentLdm],
  );
}

/** 600 kg of cargo, 1200 mm tall, no special handling – matches the contract examples. */
async function insertUnit(
  unitId: string,
  planId: string,
  palletType: string,
  cargoType: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO cargo_plans.cargo_load_plan_units
       (id, load_plan_id, pallet_type, cargo_type, description, weight_kg, cargo_height_mm,
        is_temperature_controlled, requires_side_loading, is_bulk, high_security_required)
     VALUES ($1, $2, $3, $4, NULL, 600, 1200, false, false, false, false)`,
    [unitId, planId, palletType, cargoType],
  );
}

const stateHandlers = {
  // ── TmsFrontend ──
  'customers exist': () => Promise.resolve('Customers already seeded in DB'),
  'customer 1 has transportation orders': () => Promise.resolve('Customer 1 orders already seeded in DB'),

  // ── CargoPlannerCli ──
  'the TMS accepts new load plans': async (): Promise<void> => {
    await resetOwnedPlans();
  },

  'a draft load plan exists with no cargo': async (params: StateParams): Promise<void> => {
    await resetOwnedPlans();
    await insertPlan(
      param(params, 'planId', PLAN_DRAFT_WITH_CARGO),
      param(params, 'trailerType', 'standard-curtainside'),
      0,
    );
  },

  'a draft load plan exists with two GENERAL cargo units': async (params: StateParams): Promise<void> => {
    await resetOwnedPlans();
    const planId = param(params, 'planId', PLAN_DRAFT_WITH_CARGO);
    // two epal1 (800 mm wide) side by side in a 2480 mm trailer => one 1200 mm row
    await insertPlan(planId, param(params, 'trailerType', 'standard-curtainside'), 1.2);
    await insertUnit(param(params, 'firstUnitId', UNIT_ONE), planId, 'epal1', 'GENERAL');
    await insertUnit(param(params, 'secondUnitId', UNIT_TWO), planId, 'epal1', 'GENERAL');
  },

  'a draft load plan exists with a CHEMICAL cargo unit': async (params: StateParams): Promise<void> => {
    await resetOwnedPlans();
    const planId = param(params, 'planId', PLAN_WITH_CHEMICAL);
    await insertPlan(planId, param(params, 'trailerType', 'standard-curtainside'), 1.2);
    await insertUnit(param(params, 'unitId', UNIT_CHEMICAL), planId, 'cp1', 'CHEMICAL');
  },

  'no load plan exists with the given id': async (params: StateParams): Promise<void> => {
    await resetOwnedPlans();
    await pool.query('DELETE FROM cargo_plans.cargo_load_plans WHERE id = $1', [
      param(params, 'planId', PLAN_UNKNOWN),
    ]);
  },
};

// ── verification ────────────────────────────────────────────────────────────

/**
 * Unpinned, this behaves like a CI provider build: verify whatever the consumers last
 * put on their branch, plus everything already live somewhere – so a green build means
 * "safe for what is coming and for what is already out there".
 */
const contractSource: Partial<VerifierOptions> = pinnedConsumerVersion
  ? {
      pactUrls: [
        `${brokerUrl}/pacts/provider/${PROVIDER}/consumer/${CARGO_CONSUMER}/version/${pinnedConsumerVersion}`,
      ],
    }
  : {
      pactBrokerUrl: brokerUrl,
      consumerVersionSelectors: [{ branch, latest: true }, { deployed: true }],
    };

const target = pinnedConsumerVersion
  ? `${CARGO_CONSUMER} ${pinnedConsumerVersion}`
  : `the latest consumers on branch ${branch} (plus anything deployed)`;
console.log(`\n▶ Verifying ${PROVIDER} ${providerVersion} against ${target}\n`);

new Verifier({
  provider: PROVIDER,
  providerBaseUrl: process.env.PROVIDER_BASE_URL ?? 'http://localhost:3000',
  publishVerificationResult: true,
  providerVersion,
  providerVersionBranch: branch,
  ...contractSource,
  stateHandlers: stateHandlers as never,
})
  .verifyProvider()
  .then(() => console.log(`\n  ${PROVIDER} ${providerVersion} satisfies the published contracts.\n`))
  .catch((err) => {
    console.error('\n  Provider verification FAILED – a contract is not satisfied:\n');
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Verification mutates real rows – hand the database back the way we found it.
    await resetOwnedPlans();
    await pool.end();
  });
