import type { CargoType } from './cargo/cargo.types';
import type { Weight } from '../shared/weight';

export interface CreateLoadPlanCommand {
  loadSpaceType: string;
}

export interface AddCargoCommand {
  loadPlanId: string;
  palletType: string;
  cargoType: CargoType;
  weight: Weight;
  cargoHeightMm: number;
}

export interface RemoveCargoCommand {
  loadPlanId: string;
  unitId: string;
}

export interface ChangeLoadSpaceCommand {
  loadPlanId: string;
  loadSpaceType: string;
}
