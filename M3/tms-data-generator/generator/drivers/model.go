package drivers

import "time"

// ContractType represents the type of contract a driver has.
type ContractType string

const (
	Contractor ContractType = "CONTRACTOR"
	FullTime   ContractType = "FULL_TIME"
)

// DriverStatus represents the current status of a driver.
type DriverStatus string

const (
	Active    DriverStatus = "ACTIVE"
	OnRoute   DriverStatus = "ON_ROUTE"
	Resting   DriverStatus = "RESTING"
	OffDuty   DriverStatus = "OFF_DUTY"
	SickLeave DriverStatus = "SICK_LEAVE"
)

// Driver represents a driver entity.
type Driver struct {
	ID           int
	FirstName    string
	LastName     string
	Email        string
	Phone        string
	ContractType ContractType
	Status       DriverStatus
}

// AvailabilityPeriodType represents the type of availability period.
type AvailabilityPeriodType string

const (
	AvailablePeriod   AvailabilityPeriodType = "AVAILABLE"
	UnavailablePeriod AvailabilityPeriodType = "UNAVAILABLE"
	LeavePeriod       AvailabilityPeriodType = "LEAVE"
	SickLeavePeriod   AvailabilityPeriodType = "SICK_LEAVE"
)

// DriverAvailabilityPeriod represents a period of availability/unavailability for a driver.
type DriverAvailabilityPeriod struct {
	ID         int
	DriverID   int
	PeriodType AvailabilityPeriodType
	StartTime  time.Time
	EndTime    *time.Time // Pointer, bo może być NULL
	Reason     string     // Opcjonalny
	CreatedAt  time.Time
}
