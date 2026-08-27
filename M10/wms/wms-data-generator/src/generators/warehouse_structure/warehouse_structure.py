from src.config import DATA_QUANTITIES
from src.generators.warehouse import the_only_warehouse
import random
from faker import Faker

fake = Faker()

# Static zones, but warehouse_id is dynamic
# Codes are explicit: initials collide (Picking Area / Packing Area both give "PA")
# and the code is the first segment of the composed shelf path, so it must be stable.
ZONE_NAMES = [
    {'id': 1, 'warehouse_id': the_only_warehouse['id'], 'code': 'BULK', 'name': 'Bulk Storage Area', 'description': 'Area for storing large quantities of goods, usually on pallets.'},
    {'id': 2, 'warehouse_id': the_only_warehouse['id'], 'code': 'RECV', 'name': 'Receiving Area', 'description': 'Zone designated for unloading and inspecting incoming goods.'},
    {'id': 3, 'warehouse_id': the_only_warehouse['id'], 'code': 'PICK', 'name': 'Picking Area', 'description': 'Zone where items are picked to fulfill orders.'},
    {'id': 4, 'warehouse_id': the_only_warehouse['id'], 'code': 'PACK', 'name': 'Packing Area', 'description': 'Area for packing picked items and preparing them for shipment.'},
    {'id': 5, 'warehouse_id': the_only_warehouse['id'], 'code': 'SHIP', 'name': 'Shipping Area', 'description': 'Zone for staging and loading outbound shipments.'},
    {'id': 6, 'warehouse_id': the_only_warehouse['id'], 'code': 'RET', 'name': 'Returns Area', 'description': 'Designated space for processing returned goods.'},
    {'id': 7, 'warehouse_id': the_only_warehouse['id'], 'code': 'QC', 'name': 'Quarantine/Inspection Area', 'description': 'Area for holding goods pending inspection or quality checks.'}
]

# ZONE_NAMES are used to run this function, fix this
def zones_insert_sql(zones):
    def sql_str(s):
        return "'" + str(s).replace("'", "''") + "'"
    lines = ["INSERT INTO zone (zone_id, warehouse_id, code, name, description) VALUES"]
    lines.append(",\n".join(
        f"({zone['id']}, {zone['warehouse_id']}, {sql_str(zone['code'])}, {sql_str(zone['name'])}, {sql_str(zone['description'])})" for zone in zones
    ) + ";")
    return "\n".join(lines)

def generate_aisles(zones):
    # Only for Bulk Storage Area (zone name)
    bulk_zone = next(z for z in zones if z['name'] == 'Bulk Storage Area')
    return [
        {
            'id': i + 1,
            'zone_id': bulk_zone['id'],
            # No dashes: the dash separates the segments of the composed shelf path
            'label': f"A{i+1:02d}",
            'width': random.choice([200, 250, 300, 350]),
            'width_unit': "cm"
        }
        for i in range(DATA_QUANTITIES["NUM_AISLES"])
    ]

def aisles_insert_sql(aisles):
    def sql_str(s):
        return "'" + str(s).replace("'", "''") + "'"
    lines = ["INSERT INTO aisle (aisle_id, zone_id, label, width, width_unit) VALUES"]
    lines.append(",\n".join(
        f"({aisle['id']}, {aisle['zone_id']}, {sql_str(aisle['label'])}, {aisle['width']}, {sql_str(aisle['width_unit'])})" for aisle in aisles
    ) + ";")
    return "\n".join(lines)

def generate_racks(aisles):
    return [
        {
            'id': i + 1,
            'aisle_id': aisles[i % len(aisles)]['id'],
            'label': f"R{i+1:03d}",
            'max_height': random.choice([350, 400, 450, 500]),
            'height_unit': "cm"
        }
        for i in range(DATA_QUANTITIES["NUM_RACKS"])
    ]

def racks_insert_sql(racks):
    def sql_str(s):
        return "'" + str(s).replace("'", "''") + "'"
    lines = ["INSERT INTO rack (rack_id, aisle_id, label, max_height, height_unit) VALUES"]
    lines.append(",\n".join(
        f"({rack['id']}, {rack['aisle_id']}, {sql_str(rack['label'])}, {rack['max_height']}, {sql_str(rack['height_unit'])})" for rack in racks
    ) + ";")
    return "\n".join(lines)

def generate_shelves(racks):
    # Iterate rack by rack, level by level, so that (rack_id, level) is unique by
    # construction. The old `i % NUM_RACKS` / `(i % 4) + 1` pair broke exactly when
    # the number of racks was divisible by 4 (LARGE mode: every shelf of a rack
    # ended up on the same level).
    total = DATA_QUANTITIES["NUM_SHELVES"]
    levels_per_rack = -(-total // len(racks))  # ceil
    shelves = []
    for rack in racks:
        for level in range(1, levels_per_rack + 1):
            if len(shelves) == total:
                return shelves
            shelves.append({
                'id': len(shelves) + 1,
                'rack_id': rack['id'],
                'level': str(level),
                'max_weight': random.randint(600, 1200),
                'max_volume': random.randint(5, 15)
            })
    return shelves

def shelves_insert_sql(shelves):
    def sql_str(s):
        return "'" + str(s).replace("'", "''") + "'"
    lines = ["INSERT INTO shelf (shelf_id, rack_id, level, max_weight, max_volume) VALUES"]
    lines.append(",\n".join(
        f"({shelf['id']}, {shelf['rack_id']}, {sql_str(shelf['level'])}, {shelf['max_weight']}, {shelf['max_volume']})" for shelf in shelves
    ) + ";")
    return "\n".join(lines)
