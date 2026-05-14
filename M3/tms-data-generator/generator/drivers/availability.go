package drivers

import (
	"math/rand"
	"strconv"
	"strings"
	"time"
)

// GenerateDriverAvailabilityPeriods generates availability periods for drivers.
// Generates:
// - 0-2 leaves per driver per year (1-2 weeks each)
// - 0-1 sick leave periods per driver per year (1-5 days)
// - Randomly distributed over the last year
// - No overlapping periods
func GenerateDriverAvailabilityPeriods(drivers []Driver) []DriverAvailabilityPeriod {
	periods := make([]DriverAvailabilityPeriod, 0)
	periodID := 1
	now := time.Now()
	oneYearAgo := now.AddDate(-1, 0, 0)

	for _, driver := range drivers {
		// Generate leaves (0-2 per driver)
		numLeaves := rand.Intn(3) // 0, 1, or 2
		usedPeriods := make([]timeRange, 0)

		for i := 0; i < numLeaves; i++ {
			// Leave duration: 1-2 weeks
			durationDays := 7 + rand.Intn(8) // 7-14 days
			period := generateNonOverlappingPeriod(
				driver.ID,
				periodID,
				LeavePeriod,
				oneYearAgo,
				now,
				durationDays,
				usedPeriods,
				"Annual leave",
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

		// Generate sick leave (0-1 per driver, 70% chance)
		if rand.Float64() < 0.7 {
			// Sick leave duration: 1-5 days
			durationDays := 1 + rand.Intn(5) // 1-5 days
			period := generateNonOverlappingPeriod(
				driver.ID,
				periodID,
				SickLeavePeriod,
				oneYearAgo,
				now,
				durationDays,
				usedPeriods,
				"Sick leave",
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
	driverID int,
	periodID int,
	periodType AvailabilityPeriodType,
	startBound time.Time,
	endBound time.Time,
	durationDays int,
	usedPeriods []timeRange,
	reason string,
) *DriverAvailabilityPeriod {
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

			return &DriverAvailabilityPeriod{
				ID:         periodID,
				DriverID:   driverID,
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

// GenerateDriverAvailabilityPeriodsInsertStatements generates SQL INSERT statements for driver availability periods.
func GenerateDriverAvailabilityPeriodsInsertStatements(periods []DriverAvailabilityPeriod) string {
	if len(periods) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.Grow(len(periods) * 150)

	sb.WriteString("INSERT INTO driver_availability_periods (id, driver_id, period_type, start_time, end_time, reason, created_at) VALUES\n")

	for i, period := range periods {
		sb.WriteString("    (")
		sb.WriteString(strconv.Itoa(period.ID))
		sb.WriteString(", ")
		sb.WriteString(strconv.Itoa(period.DriverID))
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

