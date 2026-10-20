import { Weight } from '../../shared/weight';
import type { RigidVehicleSpace } from './load-space-spec';

/**
 * How far over GVW (DMC) a vehicle may go without drawing a penalty.
 *
 * Not in any regulation – it is the unwritten tolerance enforcement applies in
 * practice, and the business chose to plan against it: often enough it is the
 * one extra pallet. It loosens the *legal* limit only; a load floor's
 * structural capacity is physics and gets no tolerance.
 */
export const GVW_OVERLOAD_TOLERANCE = Weight.from(200, 'KG');

/** The heaviest gross load planning accepts for a rigid vehicle class. */
export function permittedGrossLoad(space: RigidVehicleSpace): Weight {
  return space.payloadCapacity.plus(GVW_OVERLOAD_TOLERANCE);
}
