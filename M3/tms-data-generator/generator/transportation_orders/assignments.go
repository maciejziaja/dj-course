package transportation_orders

import (
	"math/rand"
	"strconv"
	"strings"
	"time"

	"tms-data-generator/generator/drivers"
	"tms-data-generator/generator/vehicles"
)

// GenerateOrderAssignments generates order assignments for transportation orders.
// Only assigns drivers and vehicles to orders with status IN_TRANSIT or later.
// Checks for time conflicts and availability periods.
func GenerateOrderAssignments(
	orders []TransportationOrder,
	driversList []drivers.Driver,
	vehiclesList []vehicles.Vehicle,
	driverAvailabilityPeriods []drivers.DriverAvailabilityPeriod,
	vehicleAvailabilityPeriods []vehicles.VehicleAvailabilityPeriod,
) []OrderAssignment {
	assignments := make([]OrderAssignment, 0)
	assignmentID := 1

	// Filter orders that should have assignments (IN_TRANSIT or later)
	eligibleOrders := make([]TransportationOrder, 0)
	for _, order := range orders {
		if order.Status == OrderInTransit || order.Status == OrderDelivered {
			eligibleOrders = append(eligibleOrders, order)
		}
	}

	// Build maps for quick lookup
	driverAvailabilityMap := buildDriverAvailabilityMap(driverAvailabilityPeriods)
	vehicleAvailabilityMap := buildVehicleAvailabilityMap(vehicleAvailabilityPeriods)

	// Track assignments to check for conflicts
	driverAssignments := make(map[int][]timeRange) // driverID -> list of time ranges
	vehicleAssignments := make(map[int][]timeRange) // vehicleID -> list of time ranges

	for _, order := range eligibleOrders {
		// Calculate assignment time window
		startTime := order.OrderDate.Add(time.Duration(rand.Intn(2)) * 24 * time.Hour) // 0-2 days after order
		durationDays := 1 + rand.Intn(5) // 1-5 days for delivery
		endTime := startTime.AddDate(0, 0, durationDays)

		// Find available driver
		availableDrivers := findAvailableDrivers(
			driversList,
			driverAvailabilityMap,
			driverAssignments,
			startTime,
			endTime,
		)

		// Find available vehicle
		availableVehicles := findAvailableVehicles(
			vehiclesList,
			vehicleAvailabilityMap,
			vehicleAssignments,
			startTime,
			endTime,
		)

		// If we have both driver and vehicle, create assignment
		if len(availableDrivers) > 0 && len(availableVehicles) > 0 {
			driver := availableDrivers[rand.Intn(len(availableDrivers))]
			vehicle := availableVehicles[rand.Intn(len(availableVehicles))]

			// Determine status based on order status
			var assignmentStatus AssignmentStatus
			var actualStartTime *time.Time
			var actualEndTime *time.Time

			if order.Status == OrderDelivered {
				assignmentStatus = AssignmentCompleted
				// For completed orders, set actual times (slightly different from planned)
				actualStart := startTime.Add(time.Duration(rand.Intn(12)) * time.Hour) // 0-12 hours later
				actualEnd := endTime.Add(time.Duration(rand.Intn(24)-12) * time.Hour) // ±12 hours
				actualStartTime = &actualStart
				actualEndTime = &actualEnd
			} else {
				assignmentStatus = AssignmentInProgress
			}

			assignedAt := order.OrderDate.Add(time.Duration(rand.Intn(24)) * time.Hour) // Assigned within 24h of order

			assignment := OrderAssignment{
				ID:              assignmentID,
				OrderID:         order.ID,
				DriverID:        &driver.ID,
				VehicleID:       &vehicle.ID,
				AssignedAt:      assignedAt,
				StartTime:       startTime,
				EndTime:         &endTime,
				ActualStartTime: actualStartTime,
				ActualEndTime:   actualEndTime,
				Status:          assignmentStatus,
			}

			assignments = append(assignments, assignment)
			assignmentID++

			// Track assignment to prevent conflicts
			driverAssignments[driver.ID] = append(driverAssignments[driver.ID], timeRange{
				start: startTime,
				end:   endTime,
			})
			vehicleAssignments[vehicle.ID] = append(vehicleAssignments[vehicle.ID], timeRange{
				start: startTime,
				end:   endTime,
			})
		}
	}

	return assignments
}

// timeRange represents a time range for checking overlaps.
type timeRange struct {
	start time.Time
	end   time.Time
}

// buildDriverAvailabilityMap builds a map of driver ID to list of unavailable periods.
func buildDriverAvailabilityMap(periods []drivers.DriverAvailabilityPeriod) map[int][]timeRange {
	result := make(map[int][]timeRange)
	for _, period := range periods {
		// Only consider UNAVAILABLE, LEAVE, SICK_LEAVE as blocking
		if period.PeriodType == drivers.UnavailablePeriod ||
			period.PeriodType == drivers.LeavePeriod ||
			period.PeriodType == drivers.SickLeavePeriod {
			if period.EndTime != nil {
				result[period.DriverID] = append(result[period.DriverID], timeRange{
					start: period.StartTime,
					end:   *period.EndTime,
				})
			} else {
				// Open-ended period - use a far future date
				result[period.DriverID] = append(result[period.DriverID], timeRange{
					start: period.StartTime,
					end:   period.StartTime.AddDate(10, 0, 0), // 10 years in future
				})
			}
		}
	}
	return result
}

// buildVehicleAvailabilityMap builds a map of vehicle ID to list of unavailable periods.
func buildVehicleAvailabilityMap(periods []vehicles.VehicleAvailabilityPeriod) map[int][]timeRange {
	result := make(map[int][]timeRange)
	for _, period := range periods {
		// Only consider UNAVAILABLE, MAINTENANCE, REPAIR as blocking
		if period.PeriodType == vehicles.UnavailableVehiclePeriod ||
			period.PeriodType == vehicles.MaintenancePeriod ||
			period.PeriodType == vehicles.RepairPeriod {
			if period.EndTime != nil {
				result[period.VehicleID] = append(result[period.VehicleID], timeRange{
					start: period.StartTime,
					end:   *period.EndTime,
				})
			} else {
				// Open-ended period - use a far future date
				result[period.VehicleID] = append(result[period.VehicleID], timeRange{
					start: period.StartTime,
					end:   period.StartTime.AddDate(10, 0, 0), // 10 years in future
				})
			}
		}
	}
	return result
}

// findAvailableDrivers finds drivers that are available in the given time range.
func findAvailableDrivers(
	driversList []drivers.Driver,
	availabilityMap map[int][]timeRange,
	assignmentsMap map[int][]timeRange,
	startTime time.Time,
	endTime time.Time,
) []drivers.Driver {
	available := make([]drivers.Driver, 0)

	for _, driver := range driversList {
		// Check base status
		if driver.Status != drivers.Active && driver.Status != drivers.OnRoute {
			continue
		}

		// Check availability periods
		unavailablePeriods := availabilityMap[driver.ID]
		hasConflict := false
		for _, period := range unavailablePeriods {
			if timeRangesOverlap(startTime, endTime, period.start, period.end) {
				hasConflict = true
				break
			}
		}
		if hasConflict {
			continue
		}

		// Check existing assignments
		existingAssignments := assignmentsMap[driver.ID]
		hasConflict = false
		for _, assignment := range existingAssignments {
			if timeRangesOverlap(startTime, endTime, assignment.start, assignment.end) {
				hasConflict = true
				break
			}
		}
		if hasConflict {
			continue
		}

		available = append(available, driver)
	}

	return available
}

// findAvailableVehicles finds vehicles that are available in the given time range.
func findAvailableVehicles(
	vehiclesList []vehicles.Vehicle,
	availabilityMap map[int][]timeRange,
	assignmentsMap map[int][]timeRange,
	startTime time.Time,
	endTime time.Time,
) []vehicles.Vehicle {
	available := make([]vehicles.Vehicle, 0)

	for _, vehicle := range vehiclesList {
		// Check availability periods
		unavailablePeriods := availabilityMap[vehicle.ID]
		hasConflict := false
		for _, period := range unavailablePeriods {
			if timeRangesOverlap(startTime, endTime, period.start, period.end) {
				hasConflict = true
				break
			}
		}
		if hasConflict {
			continue
		}

		// Check existing assignments
		existingAssignments := assignmentsMap[vehicle.ID]
		hasConflict = false
		for _, assignment := range existingAssignments {
			if timeRangesOverlap(startTime, endTime, assignment.start, assignment.end) {
				hasConflict = true
				break
			}
		}
		if hasConflict {
			continue
		}

		available = append(available, vehicle)
	}

	return available
}

// timeRangesOverlap checks if two time ranges overlap.
func timeRangesOverlap(start1, end1, start2, end2 time.Time) bool {
	return start1.Before(end2) && end1.After(start2)
}

// GenerateOrderAssignmentsInsertStatements generates SQL INSERT statements for order assignments.
func GenerateOrderAssignmentsInsertStatements(assignments []OrderAssignment) string {
	if len(assignments) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.Grow(len(assignments) * 200)

	sb.WriteString("INSERT INTO order_assignments (id, order_id, driver_id, vehicle_id, assigned_at, start_time, end_time, actual_start_time, actual_end_time, status) VALUES\n")

	for i, assignment := range assignments {
		sb.WriteString("    (")
		sb.WriteString(strconv.Itoa(assignment.ID))
		sb.WriteString(", ")
		sb.WriteString(strconv.Itoa(assignment.OrderID))
		sb.WriteString(", ")

		if assignment.DriverID != nil {
			sb.WriteString(strconv.Itoa(*assignment.DriverID))
		} else {
			sb.WriteString("NULL")
		}

		sb.WriteString(", ")

		if assignment.VehicleID != nil {
			sb.WriteString(strconv.Itoa(*assignment.VehicleID))
		} else {
			sb.WriteString("NULL")
		}

		sb.WriteString(", '")
		sb.WriteString(assignment.AssignedAt.Format("2006-01-02 15:04:05"))
		sb.WriteString("', '")
		sb.WriteString(assignment.StartTime.Format("2006-01-02 15:04:05"))
		sb.WriteString("', ")

		if assignment.EndTime != nil {
			sb.WriteString("'")
			sb.WriteString(assignment.EndTime.Format("2006-01-02 15:04:05"))
			sb.WriteString("'")
		} else {
			sb.WriteString("NULL")
		}

		sb.WriteString(", ")

		if assignment.ActualStartTime != nil {
			sb.WriteString("'")
			sb.WriteString(assignment.ActualStartTime.Format("2006-01-02 15:04:05"))
			sb.WriteString("'")
		} else {
			sb.WriteString("NULL")
		}

		sb.WriteString(", ")

		if assignment.ActualEndTime != nil {
			sb.WriteString("'")
			sb.WriteString(assignment.ActualEndTime.Format("2006-01-02 15:04:05"))
			sb.WriteString("'")
		} else {
			sb.WriteString("NULL")
		}

		sb.WriteString(", '")
		sb.WriteString(string(assignment.Status))
		sb.WriteString("')")

		if i < len(assignments)-1 {
			sb.WriteString(",\n")
		} else {
			sb.WriteString(";\n")
		}
	}

	return sb.String()
}

