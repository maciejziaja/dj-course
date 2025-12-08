from tokenizers import Tokenizer
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TOKENIZER_DIR = os.path.join(SCRIPT_DIR, 'tokenizers')
SAMPLES_DIR = os.path.join(SCRIPT_DIR, 'samples')

# Wczytaj wszystkie tokenizery
ALL_TOKENIZERS = {}

if not os.path.isdir(TOKENIZER_DIR):
    print(f"❌ Error: Tokenizer directory not found at {TOKENIZER_DIR}")
    exit(1)

if not os.path.isdir(SAMPLES_DIR):
    print(f"❌ Error: Samples directory not found at {SAMPLES_DIR}")
    exit(1)

print("📦 Loading tokenizers...")
for filename in os.listdir(TOKENIZER_DIR):
    if filename.endswith('.json'):
        key = filename[:-5]  # remove .json
        full_path = os.path.join(TOKENIZER_DIR, filename)
        try:
            ALL_TOKENIZERS[key] = Tokenizer.from_file(full_path)
            print(f"  ✅ Loaded: {key}")
        except Exception as e:
            print(f"  ❌ Error loading tokenizer '{key}' from '{full_path}': {e}")

if not ALL_TOKENIZERS:
    print(f"❌ Error: No tokenizers found in {TOKENIZER_DIR}")
    exit(1)

# Wykryj wszystkie próbki (pliki .json bez -nows)
print("\n📋 Detecting samples...")
sample_names = set()
for filename in os.listdir(SAMPLES_DIR):
    if filename.endswith('.json') and not filename.endswith('-nows.json'):
        sample_name = filename[:-5]  # remove .json
        sample_names.add(sample_name)
        print(f"  ✅ Found: {sample_name}")

sample_names = sorted(sample_names)

if not sample_names:
    print(f"❌ Error: No samples found in {SAMPLES_DIR}")
    exit(1)

# Funkcja do wczytania danych próbki
def load_sample_data(sample_name):
    sample_data = {}

    file_path_json = os.path.join(SAMPLES_DIR, f"{sample_name}.json")
    try:
        with open(file_path_json, "r", encoding="utf-8") as f:
            sample_data['json'] = f.read()
    except FileNotFoundError:
        sample_data['json'] = ""

    file_path_nows = os.path.join(SAMPLES_DIR, f"{sample_name}-nows.json")
    try:
        with open(file_path_nows, "r", encoding="utf-8") as f:
            sample_data['nows-json'] = f.read()
    except FileNotFoundError:
        sample_data['nows-json'] = ""

    file_path_toon = os.path.join(SAMPLES_DIR, f"{sample_name}.toon")
    try:
        with open(file_path_toon, "r", encoding="utf-8") as f:
            sample_data['toon'] = f.read()
    except FileNotFoundError:
        sample_data['toon'] = ""

    file_path_yaml = os.path.join(SAMPLES_DIR, f"{sample_name}.yaml")
    try:
        with open(file_path_yaml, "r", encoding="utf-8") as f:
            sample_data['yaml'] = f.read()
    except FileNotFoundError:
        sample_data['yaml'] = ""

    return sample_data

# Funkcja do tokenizacji i zliczania
def tokenize_sample(tokenizer, sample_data):
    results = {}

    if all(value == "" for value in sample_data.values()):
        return None

    try:
        # Tokenizuj bezpośrednio wczytane stringi (poprawka: nie używamy json.dumps() dla JSON)
        if sample_data.get('json'):
            encoded_json = tokenizer.encode(sample_data['json'])
            results['json'] = len(encoded_json.ids)
        else:
            results['json'] = 0

        if sample_data.get('nows-json'):
            encoded_nows_json = tokenizer.encode(sample_data['nows-json'])
            results['nows-json'] = len(encoded_nows_json.ids)
        else:
            results['nows-json'] = 0

        if sample_data.get('toon'):
            encoded_toon = tokenizer.encode(sample_data['toon'])
            results['toon'] = len(encoded_toon.ids)
        else:
            results['toon'] = 0

        if sample_data.get('yaml'):
            encoded_yaml = tokenizer.encode(sample_data['yaml'])
            results['yaml'] = len(encoded_yaml.ids)
        else:
            results['yaml'] = 0

        return results

    except Exception as e:
        print(f"  ❌ Error during tokenization: {e}")
        return None

# Funkcja do obliczania różnic i procentów (używa najlepszego formatu jako baseline)
def calculate_differences(counts):
    # Znajdź najlepszy format (najmniejsza liczba tokenów, > 0)
    valid_counts = {k: v for k, v in counts.items() if v > 0}
    if not valid_counts:
        return {}

    best_format = min(valid_counts.items(), key=lambda x: x[1])
    baseline_count = best_format[1]
    baseline_name = best_format[0]

    differences = {}

    for format_name, count in counts.items():
        if count == 0:
            continue
        if format_name == baseline_name:
            differences[format_name] = {
                'count': count,
                'diff': 0,
                'percent': 100.0
            }
        else:
            diff = count - baseline_count
            # Procent względem najlepszego: najlepszy = 100%, gorsze = mniej niż 100%
            percent = (baseline_count / count) * 100.0
            differences[format_name] = {
                'count': count,
                'diff': diff,
                'percent': percent
            }

    return differences

# Funkcja do generowania paska graficznego
def generate_bar(percent, max_length=20):
    filled = int(percent / 100.0 * max_length)
    bar = '█' * filled + '░' * (max_length - filled)
    return bar

# Funkcja do formatowania nazwy formatu
def format_name_display(format_name):
    name_map = {
        'json': 'JSON',
        'nows-json': 'JSON compact',
        'yaml': 'YAML',
        'toon': 'TOON'
    }
    return name_map.get(format_name, format_name)

# Główna pętla przetwarzania
all_results = {}

print("\n" + "="*80)
print("🚀 Starting tokenization analysis...")
print("="*80)

for tokenizer_name, tokenizer in ALL_TOKENIZERS.items():
    print(f"\n{'='*80}")
    print(f"🔧 Tokenizer: {tokenizer_name}")
    print(f"{'='*80}")

    all_results[tokenizer_name] = {}

    for sample_name in sample_names:
        sample_data = load_sample_data(sample_name)
        counts = tokenize_sample(tokenizer, sample_data)

        if counts is None:
            print(f"  ⚠️  Skipping sample '{sample_name}': All files missing")
            continue

        # Oblicz różnice względem najlepszego formatu
        differences = calculate_differences(counts)
        all_results[tokenizer_name][sample_name] = differences

        if not differences:
            continue

        # Sortuj formaty od najlepszego (najmniejsza liczba tokenów)
        sorted_formats = sorted(differences.items(), key=lambda x: x[1]['count'])

        # Wyświetl wyniki dla tej próbki z paskami graficznymi
        print(f"\n{sample_name}")
        for i, (format_name, diff_info) in enumerate(sorted_formats):
            display_name = format_name_display(format_name)
            bar = generate_bar(diff_info['percent'])
            percent_str = f"{diff_info['percent']:.1f}%"
            count_str = f"({diff_info['count']})"

            if i == 0:
                # Najlepszy format z strzałką
                print(f"→ {display_name:<15} {bar}    {percent_str} {count_str}")
            else:
                # Pozostałe formaty z wcięciem
                print(f"  {display_name:<15} {bar}    {percent_str} {count_str}")

# Podsumowanie ogólne
print("\n" + "="*80)
print("📈 SUMMARY - Average token counts across all samples")
print("="*80)

for tokenizer_name in sorted(all_results.keys()):
    print(f"\n🔧 Tokenizer: {tokenizer_name}")

    # Oblicz średnie dla każdego formatu
    format_totals = {'json': 0, 'nows-json': 0, 'yaml': 0, 'toon': 0}
    format_counts = {'json': 0, 'nows-json': 0, 'yaml': 0, 'toon': 0}

    for sample_name, differences in all_results[tokenizer_name].items():
        for format_name, diff_info in differences.items():
            if diff_info['count'] > 0:
                format_totals[format_name] += diff_info['count']
                format_counts[format_name] += 1

    # Oblicz średnie i posortuj według liczby tokenów (od najmniejszej)
    format_averages = []
    for format_name in ['json', 'nows-json', 'yaml', 'toon']:
        if format_counts[format_name] > 0:
            avg = format_totals[format_name] / format_counts[format_name]
            format_averages.append((format_name, avg))

    # Sortuj od najmniejszej liczby tokenów (najlepszy na górze)
    format_averages.sort(key=lambda x: x[1])

    # Najmniejszy format to baseline (100%)
    if format_averages:
        best_avg = format_averages[0][1]

        print(f"  {'Format':<15} {'Avg Tokens':<15} {'Percent':<15}")
        print(f"  {'-'*45}")

        for i, (format_name, avg) in enumerate(format_averages):
            # Procent względem najlepszego: najlepszy = 100%, gorsze = mniej niż 100%
            percent = (best_avg / avg * 100) if avg > 0 else 0
            percent_str = f"{percent:.1f}%"
            display_name = format_name_display(format_name)
            bar = generate_bar(percent)
            count_str = f"({avg:.1f})"

            if i == 0:
                print(f"→ {display_name:<15} {bar}    {percent_str} {count_str}")
            else:
                print(f"  {display_name:<15} {bar}    {percent_str} {count_str}")

print("\n" + "="*80)
print("✅ Analysis complete!")
print("="*80)
