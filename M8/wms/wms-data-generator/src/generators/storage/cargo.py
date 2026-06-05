from faker import Faker
import json
import random
from src.generators.enums import CARGO_CATEGORIES

fake = Faker()

def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"

# Curated samples kept FIRST so cargo_id 1..5 are stable and the .http examples
# resolve (firmware_version "1.2.1", fragile flags, volume for numeric analytics).
CARGO_SAMPLES = [
    {'category_id': 1, 'name': 'Laptop XPS 13', 'weight': 1.25,
     'metadata': {"serial_number": "SN-98765", "firmware_version": "1.2.0", "fragile": True, "warranty_months": 24, "volume": 2.5}},
    {'category_id': 1, 'name': 'Server Rack Unit', 'weight': 18.40,
     'metadata': {"serial_number": "SN-55501", "firmware_version": "1.2.1", "fragile": True, "volume": 60}},
    {'category_id': 2, 'name': 'Industrial Cleaning Agent X', 'weight': 25.00,
     'metadata': {"adr_class": "8", "un_number": "UN1760", "storage_temperature_max": 25, "expiry_date": "2027-12-31", "requires_ventilation": True, "volume": 30}},
    {'category_id': 2, 'name': 'Solvent Z', 'weight': 12.00,
     'metadata': {"adr_class": "3", "un_number": "UN1993", "expiry_date": "2026-09-01", "fragile": False}},
    {'category_id': 3, 'name': 'Canned Goods Pallet', 'weight': 320.00,
     'metadata': {"expiry_date": "2027-01-01", "volume": 800}},
]

def _random_metadata(category_id):
    """Build a category-appropriate technical 'passport' (JSONB shape varies by category)."""
    volume = round(random.uniform(1, 200), 2)
    if category_id == 1:  # Electronics
        return {
            "serial_number": f"SN-{random.randint(10000, 99999)}",
            "firmware_version": random.choice(["1.2.0", "1.2.1", "2.0.0", "3.1.4"]),
            "fragile": random.choice([True, False]),
            "warranty_months": random.choice([12, 24, 36]),
            "volume": volume,
        }
    if category_id == 2:  # Chemicals
        return {
            "adr_class": random.choice(["3", "6.1", "8", "9"]),
            "un_number": f"UN{random.randint(1000, 3999)}",
            "expiry_date": fake.date_between(start_date='+30d', end_date='+3y').isoformat(),
            "requires_ventilation": random.choice([True, False]),
            "volume": volume,
        }
    if category_id == 3:  # Food
        return {
            "expiry_date": fake.date_between(start_date='+10d', end_date='+2y').isoformat(),
            "storage_temperature_max": random.choice([4, 8, 18, 25]),
            "volume": volume,
        }
    # Textiles
    return {
        "material": random.choice(["cotton", "polyester", "wool", "linen"]),
        "fragile": False,
        "volume": volume,
    }

def generate_cargo(num_cargo):
    """Hybrid: curated samples first (stable .http examples), then random rows per category."""
    cargo = []
    category_ids = [c['id'] for c in CARGO_CATEGORIES]
    for i in range(num_cargo):
        cargo_id = i + 1
        if i < len(CARGO_SAMPLES):
            sample = CARGO_SAMPLES[i]
            cargo.append({
                'id': cargo_id,
                'category_id': sample['category_id'],
                'name': sample['name'],
                'weight': sample['weight'],
                'metadata': sample['metadata'],
            })
        else:
            category_id = random.choice(category_ids)
            cargo.append({
                'id': cargo_id,
                'category_id': category_id,
                'name': f"{fake.word().capitalize()} {fake.word()}",
                'weight': round(random.uniform(0.5, 500), 2),
                'metadata': _random_metadata(category_id),
            })
    return cargo

def cargo_insert_sql(cargo_list):
    lines = ["INSERT INTO cargo (cargo_id, category_id, name, weight, metadata) VALUES"]
    lines.append(",\n".join(
        f"({c['id']}, {c['category_id']}, {sql_str(c['name'])}, {c['weight']}, {sql_str(json.dumps(c['metadata']))}::jsonb)"
        for c in cargo_list
    ) + ";")
    # Keep the SERIAL healthy so API inserts (RETURNING cargo_id) do not collide.
    lines.append("SELECT setval('cargo_cargo_id_seq', (SELECT MAX(cargo_id) FROM cargo));")
    return "\n".join(lines)

def generate_cargo_metadata_updates(cargo_list, employees, num_updates):
    """Replay periodic inspections as real UPDATEs so GET /cargo/:id/history shows an
    old->new trail. Each patch carries a unique inspection_no, so it always changes
    metadata -> the trigger logs every update (no IS DISTINCT FROM no-ops)."""
    updates = []
    if not cargo_list or not employees:
        return updates
    employee_ids = [e['employee_id'] for e in employees]
    for i in range(num_updates):
        target = cargo_list[i % len(cargo_list)]
        patch = {
            "inspection_no": i + 1,
            "last_inspection_date": fake.date_between(start_date='-1y', end_date='today').isoformat(),
        }
        updates.append({
            'cargo_id': target['id'],
            'employee_id': random.choice(employee_ids),
            'patch': patch,
        })
    return updates

def cargo_metadata_updates_sql(updates):
    out = []
    for u in updates:
        # set_config(..., false) = session-level GUC; the trigger reads it as changed_by.
        out.append(f"SELECT set_config('app.current_user_id', '{u['employee_id']}', false);")
        out.append(
            "UPDATE cargo SET metadata = metadata || "
            f"{sql_str(json.dumps(u['patch']))}::jsonb, updated_at = CURRENT_TIMESTAMP "
            f"WHERE cargo_id = {u['cargo_id']};"
        )
    # Reset so later statements in the same psql session are not attributed by mistake.
    out.append("SELECT set_config('app.current_user_id', '', false);")
    return "\n".join(out)
