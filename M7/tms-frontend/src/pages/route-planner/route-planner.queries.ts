// Slice-local copies of the TanStack Query hooks consumed by the Route
// Planner screen. Copied (not moved) from src/hooks/queries/useShipmentsList.ts,
// useDriversList.ts and useVehiclesList.ts, which remain in place for other
// screens.

import { useQuery } from '@tanstack/react-query';
import { getShipments, getDrivers, fetchVehicles } from './route-planner.http';
import { Shipment, Driver, FleetVehicle } from './route-planner.model';

interface UseShipmentsListOptions {
  status?: Shipment['route']['status'];
  priority?: Shipment['priority'];
  customer?: string;
  search?: string;
}

export const useShipmentsList = (filters?: UseShipmentsListOptions) => {
  return useQuery({
    queryKey: ['shipments', 'list', filters],
    queryFn: () => getShipments(filters),
    staleTime: 2 * 60 * 1000, // 2 minutes (more frequent for active shipments)
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

interface UseDriversListOptions {
  status?: Driver['status'];
  contractType?: Driver['contractType'];
  search?: string;
}

export const useDriversList = (filters?: UseDriversListOptions) => {
  return useQuery({
    queryKey: ['drivers', 'list', filters],
    queryFn: () => getDrivers(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

interface UseVehiclesListOptions {
  status?: FleetVehicle['status'];
  type?: FleetVehicle['type'];
  search?: string;
}

export const useVehiclesList = (filters?: UseVehiclesListOptions) => {
  return useQuery({
    queryKey: ['vehicles', 'list', filters],
    queryFn: () => fetchVehicles(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};
