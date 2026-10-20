import type { CargoType } from './cargo/cargo.types';
import type { Weight } from '../shared/weight';
import type { Length } from '../shared/length';

export interface CreateLoadPlanCommand {
  loadSpaceType: string;
}

export interface AddCargoCommand {
  loadPlanId: string;
  palletType: string;
  cargoType: CargoType;
  weight: Weight;
  cargoHeight: Length;
}

export interface RemoveCargoCommand {
  loadPlanId: string;
  unitId: string;
}

export interface ChangeLoadSpaceCommand {
  loadPlanId: string;
  loadSpaceType: string;
}
