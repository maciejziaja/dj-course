package vehicles

import "time"

// Vehicle represents a vehicle entity.
type Vehicle struct {
	ID               int
	Make             string
	Model            string
	Year             int
	FuelTankCapacity float64 // Maximum fuel capacity in liters
}

// VehicleAvailabilityPeriodType represents the type of availability period for a vehicle.
type VehicleAvailabilityPeriodType string

const (
	AvailableVehiclePeriod   VehicleAvailabilityPeriodType = "AVAILABLE"
	UnavailableVehiclePeriod VehicleAvailabilityPeriodType = "UNAVAILABLE"
	MaintenancePeriod        VehicleAvailabilityPeriodType = "MAINTENANCE"
	RepairPeriod             VehicleAvailabilityPeriodType = "REPAIR"
)

// VehicleAvailabilityPeriod represents a period of availability/unavailability for a vehicle.
type VehicleAvailabilityPeriod struct {
	ID         int
	VehicleID  int
	PeriodType VehicleAvailabilityPeriodType
	StartTime  time.Time
	EndTime    *time.Time
	Reason     string
	CreatedAt  time.Time
}
