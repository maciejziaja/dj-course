export {
  type LoadSpaceCapabilities,
  type LoadSpaceKind,
  type LoadSpaceSpec,
  type PalletLoadableSpace,
  type RigidVehicleSpace,
  isPalletLoadable,
  isRigidVehicle
} from './load-space-spec';
export { LoadSpaceCatalog, UnknownLoadSpaceTypeError } from './load-space-catalog';
export {
  type VehicleModel,
  FIAT_DUCATO_L2H2,
  RENAULT_MASTER_L2H2,
  MAN_TGL_8180_BOX,
} from './vehicle-models';
export { toLoadSpaceReadModel } from './load-space.readmodel';
