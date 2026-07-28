// Slice-local copies of the fetch functions consumed by the Route Planner
// screen. Copied (not moved) from src/http/shipments.http.ts,
// src/http/drivers.http.ts and src/http/vehicles.http.ts, which remain the
// source of truth for other screens. Mock data itself is imported from the
// shared model mocks, not duplicated.

import { API_BASE_URL } from '@/http/http.config';
import { getAuthHeaders } from '@/auth/session.token';
import { delay, MOCK_MODE } from '@/http/mock-utils';
import { createApiResponse, simulateApiError } from '@/http/http-utils';
import { getMockShipments } from '@/model/shipments/shipments.mocks';
import { mockGetDrivers } from '@/model/drivers/drivers.mocks';
import { mockVehicles } from '@/model/vehicles/vehicles.mocks';
import { Shipment, Driver, FleetVehicle } from './route-planner.model';

export async function getShipments(
  filters?: {
    driver?: string;
    status?: string;
    location?: string;
    priority?: Shipment['priority'];
    customer?: string;
    search?: string;
  },
): Promise<Shipment[]> {
  if (MOCK_MODE) {
    simulateApiError(0.02, 'Failed to fetch shipments');
    await delay(300, 500);
    return getMockShipments(filters) as Shipment[];
  }
  const queryParams = new URLSearchParams();
  if (filters?.driver) queryParams.append('driver', filters.driver);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.location) queryParams.append('location', filters.location);

  const queryString = queryParams.toString();
  const url = `${API_BASE_URL}/shipments${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

export async function getDrivers(filters?: {
  status?: Driver['status'];
  contractType?: Driver['contractType'];
  search?: string;
}): Promise<Driver[]> {
  if (MOCK_MODE) {
    simulateApiError(0.02, 'Failed to fetch drivers');
    await delay(300, 500);
    return mockGetDrivers(filters) as Driver[];
  }

  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.contractType) queryParams.append('contractType', filters.contractType);
  if (filters?.search) queryParams.append('search', filters.search);

  const response = await fetch(`${API_BASE_URL}/drivers?${queryParams.toString()}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export const fetchVehicles = async (filters?: {
  status?: FleetVehicle['status'];
  type?: FleetVehicle['type'];
  search?: string;
}): Promise<FleetVehicle[]> => {
  simulateApiError(0.02, 'Failed to fetch vehicles');

  let allVehicles = [...mockVehicles] as FleetVehicle[];

  if (filters) {
    if (filters.status) {
      allVehicles = allVehicles.filter(vehicle => vehicle.status === filters.status);
    }
    if (filters.type) {
      allVehicles = allVehicles.filter(vehicle => vehicle.type === filters.type);
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      allVehicles = allVehicles.filter(vehicle =>
        vehicle.plateNumber.toLowerCase().includes(searchLower) ||
        vehicle.make.toLowerCase().includes(searchLower) ||
        vehicle.model.toLowerCase().includes(searchLower) ||
        vehicle.currentDriver?.toLowerCase().includes(searchLower)
      );
    }
  }

  return createApiResponse(allVehicles);
};
