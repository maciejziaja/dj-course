import type { WeightUnit } from '../../shared/weight';
import { Weight } from '../../shared/weight';
import type {
  CargoLoadPlanReadModel,
  WeightUnit as ContractWeightUnit,
} from '../../types/data-contracts';
import type { CargoLoadPlanDbRow } from './cargo-load-plan.repository';

/**
 * Unit conversion is binary floating point, so 2305.5 kg leaves as
 * 5083.551118816217 lb – sixteen digits of precision the scale never had.
 * Six decimals keep sub-gramme values intact (0.5 kg in tonnes is 0.0005)
 * while dropping the noise.
 */
const round = (value: number): number => Number(value.toFixed(6));

export function toReadModel(
  row: CargoLoadPlanDbRow,
  weightUnit: WeightUnit,
): CargoLoadPlanReadModel {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    weightUnit: weightUnit as ContractWeightUnit,
    loadSpace: row.loadSpace,
    currentLdm: row.currentLdm,
    plannedWeight: round(
      Weight.from(
        row.units.reduce((sum, u) => sum + u.weightKg, 0),
        'KG',
      ).valueInUnit(weightUnit),
    ),
    // What the capacity and payload rules actually judge: cargo plus pallets.
    plannedGrossWeight: round(
      Weight.from(
        row.units.reduce((sum, u) => sum + u.weightKg + u.tareWeightKg, 0),
        'KG',
      ).valueInUnit(weightUnit),
    ),
    units: row.units.map(({ weightKg, tareWeightKg, description, ...unit }) => ({
      ...unit,
      description: description ?? undefined,
      weight: round(Weight.from(weightKg, 'KG').valueInUnit(weightUnit)),
    })),
  };
}
