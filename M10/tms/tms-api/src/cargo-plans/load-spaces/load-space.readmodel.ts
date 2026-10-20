import type {
  LoadSpaceReadModel,
  LoadSpaceType,
} from '../../types/data-contracts';
import { isRigidVehicle, type PalletLoadableSpace } from './load-space-spec';

export function toLoadSpaceReadModel(space: PalletLoadableSpace): LoadSpaceReadModel {
  return {
    // The catalog key ("reefer"), not the human label ("Reefer") – `type` is a
    // contract enum, so it has to carry the value clients can send back.
    type: space.typeKey as LoadSpaceType,
    label: space.type,
    kind: space.kind,
    canCarryPallets: space.canCarryPallets,
    maxWeightCapacityKg: space.maxWeightCapacity.valueInKg,
    payloadCapacityKg: isRigidVehicle(space) ? space.payloadCapacity.valueInKg : undefined,
    // Makes the guarantee visible: any of these can honour a plan that fits.
    fitsVehicles: isRigidVehicle(space) ? space.fitsVehicles.map(v => v.name) : undefined,
    widthMm: space.width.valueInMm,
    heightMm: space.height.valueInMm,
    maxLdm: space.maxLdm.value,
    capabilities: space.capabilities,
  };
}
