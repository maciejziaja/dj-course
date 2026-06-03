// Migration: add tracking collection with seed data and indexes
// Run with: mongosh "mongodb://root:example@localhost:27017/customer_portal?authSource=admin" migrate-add-tracking.js

db = db.getSiblingDB('customer_portal');

const COLLECTION = 'tracking';

if (db.getCollectionNames().includes(COLLECTION)) {
  print(`Collection "${COLLECTION}" already exists — skipping migration.`);
  quit(0);
}

db.createCollection(COLLECTION);

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

db.tracking.createIndex({ "trackingNumber": 1 }, { unique: true });
db.tracking.createIndex({ "requestNumber": 1 });
db.tracking.createIndex({ "companyId": 1 });
db.tracking.createIndex({ "currentStatus": 1 });
db.tracking.createIndex({ "lastUpdatedAt": -1 });

print(`Migration complete: inserted ${db.tracking.countDocuments()} documents into "${COLLECTION}".`);
