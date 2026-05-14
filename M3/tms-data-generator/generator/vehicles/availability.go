package vehicles

import (
	"math/rand"
	"strconv"
	"strings"
	"time"
)

// GenerateVehicleAvailabilityPeriods generates availability periods for vehicles.
// Generates:
// - 2-4 maintenance periods per vehicle per year (1-3 days each)
// - 0-1 repair periods per vehicle per year (3-7 days, less frequent)
// - Randomly distributed over the last year
// - No overlapping periods
func GenerateVehicleAvailabilityPeriods(vehicles []Vehicle) []VehicleAvailabilityPeriod {
	periods := make([]VehicleAvailabilityPeriod, 0)
	periodID := 1
	now := time.Now()
	oneYearAgo := now.AddDate(-1, 0, 0)

	for _, vehicle := range vehicles {
		// Generate maintenance periods (2-4 per vehicle)
		numMaintenances := 2 + rand.Intn(3) // 2, 3, or 4
		usedPeriods := make([]timeRange, 0)

		for i := 0; i < numMaintenances; i++ {
			// Maintenance duration: 1-3 days
			durationDays := 1 + rand.Intn(3) // 1-3 days
			period := generateNonOverlappingPeriod(
				vehicle.ID,
				periodID,
				MaintenancePeriod,
				oneYearAgo,
				now,
				durationDays,
				usedPeriods,
				"Routine maintenance",
			)
			if period != nil {
				periods = append(periods, *period)
				usedPeriods = append(usedPeriods, timeRange{
					start: period.StartTime,
					end:   *period.EndTime,
				})
				periodID++
			}
		}

		// Generate repair (0-1 per vehicle, 30% chance - less frequent)
		if rand.Float64() < 0.3 {
			// Repair duration: 3-7 days
			durationDays := 3 + rand.Intn(5) // 3-7 days
			period := generateNonOverlappingPeriod(
				vehicle.ID,
				periodID,
				RepairPeriod,
				oneYearAgo,
				now,
				durationDays,
				usedPeriods,
				"Vehicle repair",
			)
			if period != nil {
				periods = append(periods, *period)
				periodID++
			}
		}
	}

	return periods
}

// timeRange represents a time range for checking overlaps.
type timeRange struct {
	start time.Time
	end   time.Time
}

// generateNonOverlappingPeriod generates a period that doesn't overlap with existing periods.
func generateNonOverlappingPeriod(
	vehicleID int,
	periodID int,
	periodType VehicleAvailabilityPeriodType,
	startBound time.Time,
	endBound time.Time,
	durationDays int,
	usedPeriods []timeRange,
	reason string,
) *VehicleAvailabilityPeriod {
	maxAttempts := 50
	for attempt := 0; attempt < maxAttempts; attempt++ {
		// Generate random start time within bounds
		timeRange := endBound.Sub(startBound)
		randomOffset := time.Duration(rand.Int63n(int64(timeRange)))
		startTime := startBound.Add(randomOffset)
		endTime := startTime.AddDate(0, 0, durationDays)

		// Check if end time is within bounds
		if endTime.After(endBound) {
			// Adjust start time to fit
			startTime = endBound.AddDate(0, 0, -durationDays)
			if startTime.Before(startBound) {
				continue // Can't fit this period
			}
			endTime = endBound
		}

		// Check for overlaps with existing periods
		overlaps := false
		for _, used := range usedPeriods {
			if timeRangesOverlap(startTime, endTime, used.start, used.end) {
				overlaps = true
				break
			}
		}

		if !overlaps {
			createdAt := startTime.Add(-time.Duration(rand.Intn(7)) * 24 * time.Hour) // Created a few days before
			if createdAt.Before(startBound) {
				createdAt = startBound
			}

			return &VehicleAvailabilityPeriod{
				ID:         periodID,
				VehicleID:  vehicleID,
				PeriodType: periodType,
				StartTime:  startTime,
				EndTime:    &endTime,
				Reason:     reason,
				CreatedAt:  createdAt,
			}
		}
	}

	// If we couldn't find a non-overlapping period, return nil
	return nil
}

// timeRangesOverlap checks if two time ranges overlap.
func timeRangesOverlap(start1, end1, start2, end2 time.Time) bool {
	return start1.Before(end2) && end1.After(start2)
}

// GenerateVehicleAvailabilityPeriodsInsertStatements generates SQL INSERT statements for vehicle availability periods.
func GenerateVehicleAvailabilityPeriodsInsertStatements(periods []VehicleAvailabilityPeriod) string {
	if len(periods) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.Grow(len(periods) * 150)

	sb.WriteString("INSERT INTO vehicle_availability_periods (id, vehicle_id, period_type, start_time, end_time, reason, created_at) VALUES\n")

	for i, period := range periods {
		sb.WriteString("    (")
		sb.WriteString(strconv.Itoa(period.ID))
		sb.WriteString(", ")
		sb.WriteString(strconv.Itoa(period.VehicleID))
		sb.WriteString(", '")
		sb.WriteString(string(period.PeriodType))
		sb.WriteString("', '")
		sb.WriteString(period.StartTime.Format("2006-01-02 15:04:05"))
		sb.WriteString("', ")

		if period.EndTime != nil {
			sb.WriteString("'")
			sb.WriteString(period.EndTime.Format("2006-01-02 15:04:05"))
			sb.WriteString("'")
		} else {
			sb.WriteString("NULL")
		}

		sb.WriteString(", '")
		sb.WriteString(strings.ReplaceAll(period.Reason, "'", "''"))
		sb.WriteString("', '")
		sb.WriteString(period.CreatedAt.Format("2006-01-02 15:04:05"))
		sb.WriteString("')")

		if i < len(periods)-1 {
			sb.WriteString(",\n")
		} else {
			sb.WriteString(";\n")
		}
	}

	return sb.String()
}

