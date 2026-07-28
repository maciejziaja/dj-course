// Slice-local copies of domain types consumed by the Route Planner screen.
// This is a consumer slice: these types are duplicated (not moved) from
// src/model/shipments, src/model/drivers and src/model/vehicles, which
// remain the source of truth for other screens.

// --- shipments/logistics domain (route + map primitives) ---

// DEBT: RoutePoint, RouteData and Coordinates are duplicated from src/model/shipments/logistics.types.ts.
// They conceptually belong to the route planner and should be moved here
// (with shipments re-exporting or defining its own) when the shipments tab is refactored to a slice.

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface RoutePoint {
  id: string;
  coordinates: Coordinates;
  type: 'pickup' | 'delivery' | 'rest' | 'fuel' | 'border';
  name: string;
  address?: string;
  estimatedArrival?: Date;
  estimatedDeparture?: Date;
  notes?: string;
  duration?: number; // minutes
}

export interface Vehicle {
  id: string;
  coordinates: Coordinates;
  heading: number;
  speed: number; // km/h
  driver: string;
  plateNumber: string;
}

export interface RouteData {
  id: string;
  name: string;
  points: RoutePoint[];
  vehicle: Vehicle;
  totalDistance: number; // km
  estimatedDuration: number; // minutes
  status: 'planned' | 'active' | 'completed' | 'delayed';
  startTime?: Date;
  estimatedCompletion?: Date;
}

export interface Shipment {
  id: string;
  name: string;
  customer: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  route: RouteData;
  createdAt: Date;
  dueDate?: Date;
}

// --- drivers domain ---

export interface DriverRoute {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  distance: number;
  status: 'completed' | 'active' | 'planned' | 'cancelled';
  points: {
    lat: number;
    lng: number;
    timestamp: Date;
    type: 'start' | 'stop' | 'rest' | 'end';
    name: string;
  }[];
}

export interface Driver {
  id: string;
  name: string;
  contractType: 'full-time' | 'contractor';
  currentLocation?: {
    lat: number;
    lng: number;
  };
  status: 'active' | 'on-route' | 'resting' | 'off-duty' | 'sick-leave';
  routes: DriverRoute[];
}

// --- vehicles (fleet) domain ---
// Named `FleetVehicle` here to avoid colliding with the simple route/map
// `Vehicle` type above; both are used side by side in this slice.

export interface FleetVehicle {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  type: 'standard' | 'tir' | 'refrigerated' | 'hazmat' | 'container' | 'tanker' | 'flatbed' | 'box-truck' | 'heavy-haul';
  status: 'available' | 'in-transit' | 'maintenance' | 'out-of-service';
  mileage: number;
  currentDriver?: string;
  currentLocation?: {
    lat: number;
    lng: number;
    address: string;
  };
}
