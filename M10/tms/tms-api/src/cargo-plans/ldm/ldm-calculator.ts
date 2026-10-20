import { PalletUnit } from '../pallets/pallet-unit';
import type { PalletLoadableSpace } from '../load-spaces';
import { Length } from '../../shared/length';
import { LoadingMeters } from './loading-meters';

/**
 * Domain Service for calculating LDM.
 *
 * Works unchanged for vans: rows are packed against the usable floor width, and
 * a van simply declares a narrower one (the span between its wheel arches).
 */
export class LdmCalculator {
  public static calculate(units: PalletUnit[], loadSpace: PalletLoadableSpace): LoadingMeters {
    if (units.length === 0) return LoadingMeters.zero();

    const sortedUnits = [...units].sort(
      (a, b) => b.getSnapshot().spec.length.valueInMm - a.getSnapshot().spec.length.valueInMm
    );
    const rows: PalletUnit[][] = [[]];

    for (const unit of sortedUnits) {
      let placed = false;
      for (const row of rows) {
        const rowWidth = Length.sum(row.map(u => u.getSnapshot().spec.width));
        if (!rowWidth.plus(unit.getSnapshot().spec.width).exceeds(loadSpace.width)) {
          row.push(unit);
          placed = true;
          break;
        }
      }
      if (!placed) rows.push([unit]);
    }

    const occupiedFloorLength = Length.sum(
      rows
        .filter(row => row.length > 0)
        .map(row => Length.max(row.map(u => u.getSnapshot().spec.length)))
    );

    return LoadingMeters.fromOccupiedFloorLength(occupiedFloorLength);
  }
}
