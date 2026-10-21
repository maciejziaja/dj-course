import type { LoadSpaceCapabilities, PalletLoadableSpace, RigidVehicleSpace } from './load-space-spec';
import {
  FIAT_DUCATO_L2H2,
  MAN_TGL_8180_BOX,
  RENAULT_MASTER_L2H2,
  type VehicleModel,
} from './vehicle-models';
import { Weight } from '../../shared/weight';
import { Length } from '../../shared/length';
import { LoadingMeters } from '../ldm/loading-meters';
import { UnknownLoadSpaceTypeError } from './load-space-catalog.errors';

export { UnknownLoadSpaceTypeError } from './load-space-catalog.errors';

/**
 * Builds a class from its members, taking the **worst case** of every figure.
 *
 * Deriving rather than hand-writing the envelope is the point: it cannot drift
 * from the members, and admitting a new model automatically tightens the class
 * if that model is smaller. An average would be the dangerous shape – it would
 * promise capacity that some members of the class do not have.
 */
function guaranteedEnvelope(
  typeKey: string,
  type: string,
  capabilities: LoadSpaceCapabilities,
  members: readonly VehicleModel[],
): RigidVehicleSpace {
  if (members.length === 0) {
    throw new Error(`Load space class '${type}' must list at least one vehicle model.`);
  }

  const shortest = (dimension: (m: VehicleModel) => Length) => Length.min(members.map(dimension));
  // For a rigid vehicle the load floor's limit *is* the payload – there is no
  // separate structural figure to distinguish it from, so both read the same.
  const payloadCapacity = Weight.min(members.map(m => m.payloadCapacity));

  return {
    kind: 'RIGID_VEHICLE',
    typeKey,
    type,
    capabilities,
    canCarryPallets: true,
    maxWeightCapacity: payloadCapacity,
    payloadCapacity,
    width: shortest(m => m.width),
    height: shortest(m => m.height),
    // A van floor is far narrower than 2.4 m, so its "LDM" is plainly the floor length.
    maxLdm: LoadingMeters.fromOccupiedFloorLength(shortest(m => m.length)),
    fitsVehicles: members,
  };
}

export class LoadSpaceCatalog {
  static fromType(type: string): PalletLoadableSpace {
    const factory = REGISTRY[type];
    if (!factory) throw new UnknownLoadSpaceTypeError(type, Object.keys(REGISTRY));
    return factory();
  }

  // ── Trailer classes ───────────────────────────────────────────────────────
  // Detachable: the plan commits to a class, and which unit hauls it is settled
  // later, so no payload figure belongs here.

  static standardCurtainside(): PalletLoadableSpace {
    return {
      kind: 'TRAILER',
      typeKey: 'standard-curtainside',
      type: 'Standard Curtainside',
      capabilities: { hasClimateControl: false, supportsSideLoading: true, hasHighSecurityLock: false, isBulkReady: false },
      canCarryPallets: true,
      maxWeightCapacity: Weight.from(24000, 'KG'),
      maxLdm: LoadingMeters.of(13.6),
      width: Length.from(2480, 'MM'),
      height: Length.from(2700, 'MM'),
    };
  }

  static megaTrailer(): PalletLoadableSpace {
    return {
      kind: 'TRAILER',
      typeKey: 'mega',
      type: 'Mega Trailer',
      capabilities: { hasClimateControl: false, supportsSideLoading: true, hasHighSecurityLock: false, isBulkReady: false },
      canCarryPallets: true,
      maxWeightCapacity: Weight.from(24000, 'KG'),
      maxLdm: LoadingMeters.of(13.6),
      width: Length.from(2480, 'MM'),
      height: Length.from(3000, 'MM'),
    };
  }

  static refrigerated(): PalletLoadableSpace {
    return {
      kind: 'TRAILER',
      typeKey: 'reefer',
      type: 'Reefer',
      capabilities: { hasClimateControl: true, supportsSideLoading: false, hasHighSecurityLock: true, isBulkReady: false },
      canCarryPallets: true,
      maxWeightCapacity: Weight.from(22000, 'KG'),
      maxLdm: LoadingMeters.of(13.4),
      width: Length.from(2460, 'MM'),
      height: Length.from(2600, 'MM'),
    };
  }

  // ── Rigid vehicle classes (non-TIR) ───────────────────────────────────────
  //
  // Capabilities are the class's, and a class may only claim what every member
  // has. None of these vans is refrigerated or bulk-ready, and a side door with
  // a ~1.25 m aperture is not side loading in the curtainside sense. A closed
  // hard body with lockable doors does count as a high-security lock – harder to
  // get into than a curtain somebody can slash.

  /** Ducato / Master-sized panel vans. Add a Sprinter or Crafter here, not to the registry. */
  static mediumVan(): RigidVehicleSpace {
    return guaranteedEnvelope(
      'van-medium',
      'Medium Van',
      { hasClimateControl: false, supportsSideLoading: false, hasHighSecurityLock: true, isBulkReady: false },
      [FIAT_DUCATO_L2H2, RENAULT_MASTER_L2H2],
    );
  }

  /** 8-tonne box-bodied rigids. */
  static boxTruck8t(): RigidVehicleSpace {
    return guaranteedEnvelope(
      'box-truck-8t',
      '8t Box Truck',
      { hasClimateControl: false, supportsSideLoading: false, hasHighSecurityLock: true, isBulkReady: false },
      [MAN_TGL_8180_BOX],
    );
  }
}

/**
 * Every load space a plan can be made against is a **class**, never a single
 * make and model.
 *
 * Trailers were always classed this way – "reefer" is a category, not a serial
 * number. Rigid vehicles now follow the same shape: adding an Iveco Daily or a
 * VW Crafter means listing it among a class's members, not minting a new entry
 * here and widening the API contract.
 *
 * Lookup is keyed by the key each class declares itself, so the registry and
 * the spec cannot drift apart – there is exactly one place a key is written.
 */
const REGISTRY: Record<string, () => PalletLoadableSpace> = Object.fromEntries(
  [
    // Detachable trailers – the tractor unit is picked after the plan is agreed.
    LoadSpaceCatalog.standardCurtainside,
    LoadSpaceCatalog.megaTrailer,
    LoadSpaceCatalog.refrigerated,
    // Rigid vehicle classes – the class determines the payload, dispatch picks the van.
    LoadSpaceCatalog.mediumVan,
    LoadSpaceCatalog.boxTruck8t,
  ].map(factory => [factory().typeKey, factory]),
);
