// Logowanie rozpoczęcia procesu
print('STARTING MONGO INITIALIZATION FOR CUSTOMER PORTAL');

// Dedykowany, ograniczony user dla mongodb_exporter (observability) —
// zamiast używać roota do monitoringu
db.getSiblingDB('admin').createUser({
  user: 'exporter',
  pwd: 'exporter_pw',
  roles: [
    { role: 'clusterMonitor', db: 'admin' },
    { role: 'read', db: 'customer_portal' }
  ]
});

// Przełączenie na bazę docelową (zgodną z MONGO_INITDB_DATABASE)
db = db.getSiblingDB('customer_portal');

// Tworzenie kolekcji
db.createCollection('dashboard_stats');
db.createCollection('quick_actions');
db.createCollection('recent_requests');
db.createCollection('metrics');
db.createCollection('route_performance');
db.createCollection('transportation_requests');
db.createCollection('warehousing_requests');
db.createCollection('storage_items');
db.createCollection('tracking');

// Wstawianie danych dla dashboard_stats
db.dashboard_stats.insertMany([
  {
    name: 'Active Shipments',
    value: '12',
    iconName: 'TruckIcon',
    color: 'text-blue-600',
    visible: true
  },
  {
    name: 'Stored Items',
    value: '45',
    iconName: 'BuildingStorefrontIcon',
    color: 'text-green-600',
    visible: true
  },
  {
    name: 'Pending Requests',
    value: '3',
    iconName: 'ClockIcon',
    color: 'text-yellow-600',
    visible: true
  },
  {
    name: 'Completed This Month',
    value: '28',
    iconName: 'CheckCircleIcon',
    color: 'text-purple-600',
    visible: true
  },
  {
    name: 'Internal KPI (Hidden)',
    value: '999',
    iconName: 'ClockIcon',
    color: 'text-red-600',
    visible: false
  },
  {
    name: 'QA Preview Stat (Hidden)',
    value: '17',
    iconName: 'BuildingStorefrontIcon',
    color: 'text-cyan-600',
    visible: false
  }
]);

// Wstawianie danych dla quick_actions
db.quick_actions.insertMany([
  {
    name: 'New Transportation Request',
    description: 'Book a new shipment',
    iconName: 'TruckIcon',
    href: '/dashboard/transportation/new'
  },
  {
    name: 'New Warehousing Request',
    description: 'Request storage space',
    iconName: 'BuildingStorefrontIcon',
    href: '/dashboard/warehousing/new'
  },
  {
    name: 'Track Shipment',
    description: 'Check shipment status',
    iconName: 'MapIcon',
    href: '/dashboard/tracking'
  }
]);

// Wstawianie danych dla recent_requests
db.recent_requests.insertMany([
  {
    id: 'TR-2024-001',
    type: 'Transportation',
    status: 'In Transit',
    route: 'Warsaw → Berlin',
    date: new Date('2024-01-15')
  },
  {
    id: 'WH-2024-002',
    type: 'Warehousing',
    status: 'Stored',
    route: 'Krakow Warehouse',
    date: new Date('2024-01-14')
  },
  {
    id: 'TR-2024-003',
    type: 'Transportation',
    status: 'Delivered',
    route: 'Gdansk → Hamburg',
    date: new Date('2024-01-13')
  }
]);

// Wstawianie danych dla metrics (pojedynczy dokument)
db.metrics.insertOne({
  totalShipments: 156,
  onTimeDelivery: 94.2,
  totalCost: 45750,
  storageVolume: 2340
});

// Wstawianie danych dla route_performance
db.route_performance.insertMany([
  {
    route: 'Warsaw → Berlin',
    shipments: 45,
    onTimePercentage: 96,
    avgCost: 850,
    totalRevenue: 38250
  },
  {
    route: 'Krakow → Vienna',
    shipments: 32,
    onTimePercentage: 91,
    avgCost: 720,
    totalRevenue: 23040
  },
  {
    route: 'Gdansk → Hamburg',
    shipments: 28,
    onTimePercentage: 98,
    avgCost: 950,
    totalRevenue: 26600
  },
  {
    route: 'Wroclaw → Prague',
    shipments: 22,
    onTimePercentage: 89,
    avgCost: 650,
    totalRevenue: 14300
  },
  {
    route: 'Poznan → Amsterdam',
    shipments: 29,
    onTimePercentage: 93,
    avgCost: 1200,
    totalRevenue: 34800
  }
]);

// Wstawianie danych dla transportation_requests
db.transportation_requests.insertMany([
  {
    requestNumber: 'TR-2024-001',
    type: 'TRANSPORTATION',
    status: 'IN_TRANSIT',
    priority: 'NORMAL',
    pickupLocation: {
      address: { city: 'Warsaw', country: 'Poland', street: 'ul. Logistyczna 123', postalCode: '00-001' },
      contactPerson: 'John Doe',
      contactPhone: '+48123456789',
      contactEmail: 'john@example.com',
      operatingHours: {
        monday: { open: '08:00', close: '17:00' },
        tuesday: { open: '08:00', close: '17:00' },
        wednesday: { open: '08:00', close: '17:00' },
        thursday: { open: '08:00', close: '17:00' },
        friday: { open: '08:00', close: '17:00' },
        saturday: { open: '09:00', close: '13:00' },
        sunday: { open: 'closed', close: 'closed' }
      },
      loadingType: 'DOCK',
      facilityType: 'WAREHOUSE'
    },
    deliveryLocation: {
      address: { city: 'Berlin', country: 'Germany', street: 'Hauptstraße 456', postalCode: '10115' },
      contactPerson: 'Jane Smith',
      contactPhone: '+49123456789',
      contactEmail: 'jane@example.com',
      operatingHours: {
        monday: { open: '07:00', close: '18:00' },
        tuesday: { open: '07:00', close: '18:00' },
        wednesday: { open: '07:00', close: '18:00' },
        thursday: { open: '07:00', close: '18:00' },
        friday: { open: '07:00', close: '18:00' },
        saturday: { open: 'closed', close: 'closed' },
        sunday: { open: 'closed', close: 'closed' }
      },
      loadingType: 'DOCK',
      facilityType: 'WAREHOUSE'
    },
    cargo: {
      description: 'Electronics and components',
      cargoType: 'GENERAL_CARGO',
      weight: 1500,
      dimensions: { length: 200, width: 120, height: 100, unit: 'cm' },
      value: 25000,
      currency: 'EUR',
      packaging: 'PALLETS',
      stackable: true,
      fragile: false,
      quantity: 10,
      unitType: 'pallets'
    },
    serviceType: 'FULL_TRUCKLOAD',
    vehicleRequirements: {
      vehicleType: 'TRUCK',
      capacity: 2000,
      specialEquipment: [],
      driverRequirements: []
    },
    requestedPickupDate: new Date('2024-01-15'),
    requestedDeliveryDate: new Date('2024-01-17'),
    requiresInsurance: true,
    requiresCustomsClearance: false,
    currency: 'EUR',
    trackingNumber: 'TRK123456789',
    progressUpdates: [],
    createdBy: '1',
    companyId: '1',
    createdAt: new Date('2024-01-14'),
    updatedAt: new Date('2024-01-15')
  },
  {
    requestNumber: 'TR-2024-002',
    type: 'TRANSPORTATION',
    status: 'DELIVERED',
    priority: 'HIGH',
    pickupLocation: {
      address: { city: 'Krakow', country: 'Poland', street: 'ul. Przemysłowa 789', postalCode: '30-001' },
      contactPerson: 'Anna Kowalski',
      contactPhone: '+48987654321',
      contactEmail: 'anna@example.com',
      operatingHours: {
        monday: { open: '06:00', close: '16:00' },
        tuesday: { open: '06:00', close: '16:00' },
        wednesday: { open: '06:00', close: '16:00' },
        thursday: { open: '06:00', close: '16:00' },
        friday: { open: '06:00', close: '16:00' },
        saturday: { open: 'closed', close: 'closed' },
        sunday: { open: 'closed', close: 'closed' }
      },
      loadingType: 'GROUND',
      facilityType: 'FACTORY'
    },
    deliveryLocation: {
      address: { city: 'Vienna', country: 'Austria', street: 'Industriestraße 321', postalCode: '1010' },
      contactPerson: 'Hans Mueller',
      contactPhone: '+43123456789',
      contactEmail: 'hans@example.com',
      operatingHours: {
        monday: { open: '08:00', close: '17:00' },
        tuesday: { open: '08:00', close: '17:00' },
        wednesday: { open: '08:00', close: '17:00' },
        thursday: { open: '08:00', close: '17:00' },
        friday: { open: '08:00', close: '17:00' },
        saturday: { open: 'closed', close: 'closed' },
        sunday: { open: 'closed', close: 'closed' }
      },
      loadingType: 'DOCK',
      facilityType: 'WAREHOUSE'
    },
    cargo: {
      description: 'Machinery parts',
      cargoType: 'GENERAL_CARGO',
      weight: 3000,
      dimensions: { length: 300, width: 150, height: 120, unit: 'cm' },
      value: 50000,
      currency: 'EUR',
      packaging: 'CRATES',
      stackable: false,
      fragile: true,
      quantity: 5,
      unitType: 'crates'
    },
    serviceType: 'EXPRESS_DELIVERY',
    vehicleRequirements: {
      vehicleType: 'TRUCK',
      capacity: 3500,
      specialEquipment: [],
      driverRequirements: []
    },
    requestedPickupDate: new Date('2024-01-12'),
    requestedDeliveryDate: new Date('2024-01-13'),
    requiresInsurance: true,
    requiresCustomsClearance: false,
    currency: 'EUR',
    trackingNumber: 'TRK987654321',
    progressUpdates: [],
    createdBy: '1',
    companyId: '1',
    createdAt: new Date('2024-01-11'),
    updatedAt: new Date('2024-01-13')
  },
  {
    requestNumber: 'TR-2024-003',
    type: 'TRANSPORTATION',
    status: 'PICKUP_SCHEDULED',
    priority: 'NORMAL',
    pickupLocation: {
      address: { city: 'Prague', country: 'Czech Republic', street: 'Průmyslová 555', postalCode: '110 00' },
      contactPerson: 'Pavel Novák',
      contactPhone: '+420123456789',
      contactEmail: 'pavel@example.com',
      operatingHours: {
        monday: { open: '07:00', close: '15:00' },
        tuesday: { open: '07:00', close: '15:00' },
        wednesday: { open: '07:00', close: '15:00' },
        thursday: { open: '07:00', close: '15:00' },
        friday: { open: '07:00', close: '15:00' },
        saturday: { open: 'closed', close: 'closed' },
        sunday: { open: 'closed', close: 'closed' }
      },
      loadingType: 'CRANE',
      facilityType: 'WAREHOUSE'
    },
    deliveryLocation: {
      address: { city: 'Hamburg', country: 'Germany', street: 'Hafenstraße 888', postalCode: '20095' },
      contactPerson: 'Klaus Weber',
      contactPhone: '+49987654321',
      contactEmail: 'klaus@example.com',
      operatingHours: {
        monday: { open: '06:00', close: '22:00' },
        tuesday: { open: '06:00', close: '22:00' },
        wednesday: { open: '06:00', close: '22:00' },
        thursday: { open: '06:00', close: '22:00' },
        friday: { open: '06:00', close: '22:00' },
        saturday: { open: '08:00', close: '16:00' },
        sunday: { open: '08:00', close: '16:00' }
      },
      loadingType: 'DOCK',
      facilityType: 'PORT'
    },
    cargo: {
      description: 'Industrial equipment',
      cargoType: 'OVERSIZED',
      weight: 5000,
      dimensions: { length: 500, width: 250, height: 200, unit: 'cm' },
      value: 120000,
      currency: 'EUR',
      packaging: 'BULK',
      stackable: false,
      fragile: false,
      quantity: 1,
      unitType: 'unit'
    },
    serviceType: 'OVERSIZED_CARGO',
    vehicleRequirements: {
      vehicleType: 'FLATBED',
      capacity: 6000,
      specialEquipment: ['crane', 'straps'],
      driverRequirements: ['oversized_cargo_license']
    },
    requestedPickupDate: new Date('2024-01-18'),
    requestedDeliveryDate: new Date('2024-01-20'),
    requiresInsurance: true,
    requiresCustomsClearance: false,
    currency: 'EUR',
    trackingNumber: 'TRK456789123',
    progressUpdates: [],
    createdBy: '1',
    companyId: '1',
    createdAt: new Date('2024-01-16'),
    updatedAt: new Date('2024-01-17')
  }
]);

// Wstawianie danych dla warehousing_requests
db.warehousing_requests.insertMany([
  {
    requestNumber: 'WH-2024-001',
    type: 'WAREHOUSING',
    status: 'STORED',
    priority: 'NORMAL',
    storageType: 'AMBIENT',
    estimatedVolume: 50,
    estimatedWeight: 1000,
    cargo: {
      description: 'Electronic components and spare parts for automotive industry',
      cargoType: 'GENERAL_CARGO',
      weight: 1000,
      dimensions: { length: 200, width: 150, height: 100, unit: 'cm' },
      value: 45000,
      currency: 'EUR',
      packaging: 'PALLETS',
      stackable: true,
      fragile: false,
      quantity: 20,
      unitType: 'pallets'
    },
    estimatedStorageDuration: { value: 3, unit: 'months' },
    plannedStartDate: new Date('2024-01-15'),
    handlingServices: ['LOADING', 'UNLOADING', 'SORTING'],
    valueAddedServices: ['LABELING', 'QUALITY_CONTROL'],
    securityLevel: 'STANDARD',
    requiresTemperatureControl: false,
    requiresHumidityControl: false,
    requiresSpecialHandling: false,
    currency: 'EUR',
    billingType: 'MONTHLY',
    storageLocation: 'Warehouse A-12',
    inventoryStatus: 'IN_STORAGE',
    progressUpdates: [
      {
        id: '1',
        timestamp: new Date('2024-01-15T10:00:00'),
        status: 'SUBMITTED',
        location: 'System',
        description: 'Warehousing request submitted and under review',
        updatedBy: '1'
      },
      {
        id: '2',
        timestamp: new Date('2024-01-15T14:00:00'),
        status: 'APPROVED',
        location: 'Krakow Facility',
        description: 'Request approved, storage space allocated',
        updatedBy: '1'
      },
      {
        id: '3',
        timestamp: new Date('2024-01-16T09:00:00'),
        status: 'RECEIVED',
        location: 'Warehouse A-12',
        description: 'Cargo received and inspection completed',
        updatedBy: '1'
      },
      {
        id: '4',
        timestamp: new Date('2024-01-16T11:30:00'),
        status: 'STORED',
        location: 'Warehouse A-12',
        description: 'Items successfully stored and inventory updated',
        updatedBy: '1'
      }
    ],
    createdBy: '1',
    companyId: '1',
    createdAt: new Date('2024-01-14'),
    updatedAt: new Date('2024-01-16')
  },
  {
    requestNumber: 'WH-2024-002',
    type: 'WAREHOUSING',
    status: 'RECEIVED',
    priority: 'HIGH',
    storageType: 'REFRIGERATED',
    estimatedVolume: 25,
    estimatedWeight: 800,
    cargo: {
      description: 'Fresh food products and beverages',
      cargoType: 'PERISHABLE',
      weight: 800,
      dimensions: { length: 120, width: 80, height: 60, unit: 'cm' },
      value: 12000,
      currency: 'EUR',
      packaging: 'BOXES',
      stackable: true,
      fragile: true,
      quantity: 40,
      unitType: 'boxes'
    },
    estimatedStorageDuration: { value: 2, unit: 'weeks' },
    plannedStartDate: new Date('2024-01-18'),
    handlingServices: ['LOADING', 'UNLOADING', 'PICKING'],
    valueAddedServices: ['QUALITY_CONTROL'],
    securityLevel: 'HIGH',
    requiresTemperatureControl: true,
    requiresHumidityControl: true,
    requiresSpecialHandling: true,
    currency: 'EUR',
    billingType: 'DAILY',
    storageLocation: 'Cold Storage B-5',
    inventoryStatus: 'RECEIVED',
    progressUpdates: [
      {
        id: '1',
        timestamp: new Date('2024-01-18T09:00:00'),
        status: 'SUBMITTED',
        location: 'System',
        description: 'Warehousing request submitted',
        updatedBy: '1'
      },
      {
        id: '2',
        timestamp: new Date('2024-01-18T11:00:00'),
        status: 'APPROVED',
        location: 'System',
        description: 'Request approved',
        updatedBy: '1'
      },
      {
        id: '3',
        timestamp: new Date('2024-01-18T15:00:00'),
        status: 'RECEIVED',
        location: 'Cold Storage B-5',
        description: 'Cargo received at cold storage facility',
        updatedBy: '1'
      }
    ],
    createdBy: '1',
    companyId: '1',
    createdAt: new Date('2024-01-17'),
    updatedAt: new Date('2024-01-18')
  },
  {
    requestNumber: 'WH-2024-003',
    type: 'WAREHOUSING',
    status: 'APPROVED',
    priority: 'NORMAL',
    storageType: 'CLIMATE_CONTROLLED',
    estimatedVolume: 75,
    estimatedWeight: 2500,
    cargo: {
      description: 'Pharmaceutical products and medical supplies',
      cargoType: 'VALUABLE',
      weight: 2500,
      dimensions: { length: 180, width: 120, height: 80, unit: 'cm' },
      value: 250000,
      currency: 'EUR',
      packaging: 'CRATES',
      stackable: false,
      fragile: true,
      quantity: 15,
      unitType: 'crates'
    },
    estimatedStorageDuration: { value: 6, unit: 'months' },
    plannedStartDate: new Date('2024-01-22'),
    handlingServices: ['LOADING', 'UNLOADING', 'SORTING', 'PICKING'],
    valueAddedServices: ['LABELING', 'QUALITY_CONTROL', 'REPACKAGING'],
    securityLevel: 'MAXIMUM',
    requiresTemperatureControl: true,
    requiresHumidityControl: true,
    requiresSpecialHandling: true,
    currency: 'EUR',
    billingType: 'MONTHLY',
    storageLocation: 'Secure Facility C-1',
    inventoryStatus: 'PENDING_ARRIVAL',
    progressUpdates: [
      {
        id: '1',
        timestamp: new Date('2024-01-20T14:00:00'),
        status: 'SUBMITTED',
        location: 'System',
        description: 'Warehousing request submitted',
        updatedBy: '1'
      },
      {
        id: '2',
        timestamp: new Date('2024-01-21T10:00:00'),
        status: 'APPROVED',
        location: 'System',
        description: 'Request approved, awaiting cargo arrival',
        updatedBy: '1'
      }
    ],
    createdBy: '1',
    companyId: '1',
    createdAt: new Date('2024-01-20'),
    updatedAt: new Date('2024-01-21')
  }
]);

// Wstawianie danych dla storage_items
db.storage_items.insertMany([
  {
    id: 'ST-001',
    cargoType: 'GENERAL_CARGO',
    quantity: 100,
    unitType: 'pcs',
    storageLocation: 'Warehouse A-1',
    status: 'IN_STORAGE',
    arrivalDate: new Date('2024-01-15')
  },
  {
    id: 'ST-002',
    cargoType: 'PERISHABLE',
    quantity: 20,
    unitType: 'boxes',
    storageLocation: 'Cold Storage B-2',
    status: 'PENDING',
    arrivalDate: new Date('2024-02-01')
  },
  {
    id: 'ST-003',
    cargoType: 'HAZARDOUS',
    quantity: 5,
    unitType: 'drums',
    storageLocation: 'Hazmat Zone C-3',
    status: 'DISPATCHED',
    arrivalDate: new Date('2024-01-10'),
    departureDate: new Date('2024-01-20')
  }
]);

// Indeksy dla storage_items
db.storage_items.createIndex({ "itemId": 1 }, { unique: true });
db.storage_items.createIndex({ "status": 1 });
db.storage_items.createIndex({ "cargoType": 1 });

// Tworzenie indeksów
db.recent_requests.createIndex({ "date": -1 });
db.recent_requests.createIndex({ "id": 1 }, { unique: true });
db.route_performance.createIndex({ "route": 1 });
db.dashboard_stats.createIndex({ "visible": 1 });

// Indeksy dla transportation_requests
db.transportation_requests.createIndex({ "requestNumber": 1 }, { unique: true });
db.transportation_requests.createIndex({ "status": 1 });
db.transportation_requests.createIndex({ "priority": 1 });
db.transportation_requests.createIndex({ "createdAt": -1 });
db.transportation_requests.createIndex({ "serviceType": 1 });

// Indeksy dla warehousing_requests
db.warehousing_requests.createIndex({ "requestNumber": 1 }, { unique: true });
db.warehousing_requests.createIndex({ "status": 1 });
db.warehousing_requests.createIndex({ "priority": 1 });
db.warehousing_requests.createIndex({ "createdAt": -1 });
db.warehousing_requests.createIndex({ "storageType": 1 });

// Wstawianie danych dla tracking
db.tracking.insertMany([
  {
    trackingNumber: 'TRK123456789',
    requestNumber: 'TR-2024-001',
    companyId: '1',
    currentStatus: 'IN_TRANSIT',
    currentLocation: {
      address: 'Autobahn A12, Frankfurt/Oder',
      country: 'Germany',
      coordinates: { lat: 52.3412, lng: 14.5506 }
    },
    estimatedDelivery: new Date('2024-01-17T14:00:00'),
    vehicle: {
      plateNumber: 'WA 12345',
      type: 'TRUCK',
      model: 'Volvo FH16'
    },
    driver: {
      name: 'Tomasz Wiśniewski',
      phone: '+48601234567'
    },
    events: [
      {
        timestamp: new Date('2024-01-15T08:00:00'),
        status: 'PICKUP_COMPLETED',
        location: { address: 'ul. Logistyczna 123, Warsaw', country: 'Poland' },
        description: 'Cargo picked up from sender'
      },
      {
        timestamp: new Date('2024-01-15T11:30:00'),
        status: 'CUSTOMS_CLEARED',
        location: { address: 'Terespol Border Crossing', country: 'Poland' },
        description: 'Customs check completed, cleared for transit'
      },
      {
        timestamp: new Date('2024-01-15T18:45:00'),
        status: 'IN_TRANSIT',
        location: { address: 'Autobahn A12, Frankfurt/Oder', country: 'Germany' },
        description: 'Shipment in transit — estimated arrival tomorrow'
      }
    ],
    lastUpdatedAt: new Date('2024-01-15T18:45:00')
  },
  {
    trackingNumber: 'TRK987654321',
    requestNumber: 'TR-2024-002',
    companyId: '1',
    currentStatus: 'DELIVERED',
    currentLocation: {
      address: 'Industriestraße 321, Vienna',
      country: 'Austria',
      coordinates: { lat: 48.2082, lng: 16.3738 }
    },
    estimatedDelivery: new Date('2024-01-13T10:00:00'),
    vehicle: {
      plateNumber: 'KR 98765',
      type: 'TRUCK',
      model: 'MAN TGX'
    },
    driver: {
      name: 'Marek Kowalczyk',
      phone: '+48602345678'
    },
    events: [
      {
        timestamp: new Date('2024-01-12T06:15:00'),
        status: 'PICKUP_COMPLETED',
        location: { address: 'ul. Przemysłowa 789, Krakow', country: 'Poland' },
        description: 'Cargo picked up — express delivery initiated'
      },
      {
        timestamp: new Date('2024-01-12T14:00:00'),
        status: 'IN_TRANSIT',
        location: { address: 'Brno', country: 'Czech Republic' },
        description: 'En route to Vienna via Brno'
      },
      {
        timestamp: new Date('2024-01-13T09:40:00'),
        status: 'OUT_FOR_DELIVERY',
        location: { address: 'Vienna Ring Road', country: 'Austria' },
        description: 'Driver approaching delivery address'
      },
      {
        timestamp: new Date('2024-01-13T10:05:00'),
        status: 'DELIVERED',
        location: { address: 'Industriestraße 321, Vienna', country: 'Austria' },
        description: 'Delivered and signed by Hans Mueller'
      }
    ],
    lastUpdatedAt: new Date('2024-01-13T10:05:00')
  },
  {
    trackingNumber: 'TRK456789123',
    requestNumber: 'TR-2024-003',
    companyId: '1',
    currentStatus: 'PICKUP_SCHEDULED',
    currentLocation: {
      address: 'Průmyslová 555, Prague',
      country: 'Czech Republic',
      coordinates: { lat: 50.0755, lng: 14.4378 }
    },
    estimatedDelivery: new Date('2024-01-20T16:00:00'),
    vehicle: {
      plateNumber: 'GD 55432',
      type: 'FLATBED',
      model: 'Scania R650'
    },
    driver: {
      name: 'Rafał Dąbrowski',
      phone: '+48603456789'
    },
    events: [
      {
        timestamp: new Date('2024-01-17T09:00:00'),
        status: 'PICKUP_SCHEDULED',
        location: { address: 'Průmyslová 555, Prague', country: 'Czech Republic' },
        description: 'Pickup scheduled for 2024-01-18 07:00 — oversized cargo permit obtained'
      }
    ],
    lastUpdatedAt: new Date('2024-01-17T09:00:00')
  },
  {
    trackingNumber: 'TRK111222333',
    requestNumber: 'TR-2024-004',
    companyId: '1',
    currentStatus: 'OUT_FOR_DELIVERY',
    currentLocation: {
      address: 'Poznań Bypass, A2',
      country: 'Poland',
      coordinates: { lat: 52.4064, lng: 16.9252 }
    },
    estimatedDelivery: new Date('2024-01-19T12:00:00'),
    vehicle: {
      plateNumber: 'PO 77001',
      type: 'TRUCK',
      model: 'DAF XF'
    },
    driver: {
      name: 'Piotr Zając',
      phone: '+48604567890'
    },
    events: [
      {
        timestamp: new Date('2024-01-18T07:30:00'),
        status: 'PICKUP_COMPLETED',
        location: { address: 'Wrocław Distribution Center', country: 'Poland' },
        description: 'Cargo loaded and departed'
      },
      {
        timestamp: new Date('2024-01-18T13:00:00'),
        status: 'IN_TRANSIT',
        location: { address: 'A4 Motorway near Łódź', country: 'Poland' },
        description: 'In transit, on schedule'
      },
      {
        timestamp: new Date('2024-01-19T09:15:00'),
        status: 'OUT_FOR_DELIVERY',
        location: { address: 'Poznań Bypass, A2', country: 'Poland' },
        description: 'Approaching destination — delivery expected before noon'
      }
    ],
    lastUpdatedAt: new Date('2024-01-19T09:15:00')
  },
  {
    trackingNumber: 'TRK444555666',
    requestNumber: 'TR-2024-005',
    companyId: '1',
    currentStatus: 'EXCEPTION',
    currentLocation: {
      address: 'Szczecin Port, Gate 4',
      country: 'Poland',
      coordinates: { lat: 53.4285, lng: 14.5528 }
    },
    estimatedDelivery: new Date('2024-01-22T09:00:00'),
    vehicle: {
      plateNumber: 'SZ 30210',
      type: 'TRUCK',
      model: 'Mercedes Actros'
    },
    driver: {
      name: 'Grzegorz Nowicki',
      phone: '+48605678901'
    },
    events: [
      {
        timestamp: new Date('2024-01-20T06:00:00'),
        status: 'PICKUP_COMPLETED',
        location: { address: 'Gdańsk Industrial Zone', country: 'Poland' },
        description: 'Cargo picked up without issues'
      },
      {
        timestamp: new Date('2024-01-20T10:30:00'),
        status: 'IN_TRANSIT',
        location: { address: 'S6 Expressway', country: 'Poland' },
        description: 'En route to Szczecin Port'
      },
      {
        timestamp: new Date('2024-01-20T16:00:00'),
        status: 'EXCEPTION',
        location: { address: 'Szczecin Port, Gate 4', country: 'Poland' },
        description: 'Port customs hold — additional documentation required. Customer notified.'
      }
    ],
    lastUpdatedAt: new Date('2024-01-20T16:00:00')
  }
]);

// Indeksy dla tracking
db.tracking.createIndex({ "trackingNumber": 1 }, { unique: true });
db.tracking.createIndex({ "requestNumber": 1 });
db.tracking.createIndex({ "companyId": 1 });
db.tracking.createIndex({ "currentStatus": 1 });
db.tracking.createIndex({ "lastUpdatedAt": -1 });

print('MONGO INITIALIZATION FINISHED - All data seeded successfully');
