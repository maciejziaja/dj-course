from tokenizers import Tokenizer
from corpora import get_corpus_file
import os

TOKENIZERS = {
    "bielik-v1": "tokenizers/bielik-v1-tokenizer.json",
    "bielik-v2": "tokenizers/bielik-v2-tokenizer.json",
    "bielik-v3": "tokenizers/bielik-v3-tokenizer.json",
    "nkjp": "tokenizers/tokenizer-nkjp.json",
    "custom-bpe": "tokenizers/custom_bpe_tokenizer.json",
    "all-corpora": "tokenizers/tokenizer-all-corpora.json",
    "pan-tadeusz": "tokenizers/tokenizer-pan-tadeusz.json",
    "polish-gpt2": "tokenizers/tokenizer-polish-gpt2.json",
    "wolnelektury": "tokenizers/tokenizer-wolnelektury.json",
    "all-corpora-48k": "tokenizers/tokenizer-all-corpora-48k.json",
    "all-corpora-64k": "tokenizers/tokenizer-all-corpora-64k.json",
    "wolnelektury-48k": "tokenizers/tokenizer-wolnelektury-48k.json",
}

# Wczytaj teksty źródłowe
source_files = [
    ("pan-tadeusz", get_corpus_file("WOLNELEKTURY", "pan-tadeusz-ksiega-*.txt")[0]),
    ("fryderyk-chopin", get_corpus_file("MINI", "fryderyk-chopin-wikipedia.txt")[0]),
    ("pickwick-papers", get_corpus_file("MINI", "the-pickwick-papers-gutenberg.txt")[0]),
]

source_texts = {}
for name, file_path in source_files:
    with open(file_path, 'r', encoding='utf-8') as f:
        source_texts[name] = f.read()

# Upewnij się, że katalog logs/ istnieje
os.makedirs("logs", exist_ok=True)

# Przechowuj wyniki
results = []

print("=" * 60)
print("Tokenizacja korpusów ze wszystkimi tokenizerami")
print("=" * 60)

# Przetwórz wszystkie tokenizery dla każdego pliku źródłowego
for source_name, source_txt in source_texts.items():
    print(f"\n{'=' * 60}")
    print(f"Korpus: {source_name}")
    print(f"{'=' * 60}")

    for tokenizer_name, tokenizer_path in TOKENIZERS.items():
        try:
            print(f"\nPrzetwarzanie: {tokenizer_name}...")

            # Sprawdź czy plik tokenizera istnieje
            if not os.path.exists(tokenizer_path):
                print(f"  ⚠️  OSTRZEŻENIE: Plik {tokenizer_path} nie istnieje!")
                results.append((source_name, tokenizer_name, None, "Plik nie istnieje"))
                continue

            # Wczytaj tokenizer
            tokenizer = Tokenizer.from_file(tokenizer_path)

            # Tokenizuj tekst
            encoded = tokenizer.encode(source_txt)
            token_count = len(encoded.ids)

            # Zapisz wyniki do pliku
            file_name = f"logs/tokenized-{source_name}-{tokenizer_name}.log"
            with open(file_name, 'w', encoding='utf-8') as f:
                f.write(f"Korpus: {source_name}\n")
                f.write(f"Liczba tokenów: {token_count}\n")
                f.write(f"Tokenizer: {tokenizer_name}\n")
                f.write(f"Ścieżka: {tokenizer_path}\n")

            print(f"  ✓ Liczba tokenów: {token_count}")
            results.append((source_name, tokenizer_name, token_count, "OK"))

        except Exception as e:
            print(f"  ✗ BŁĄD: {str(e)}")
            results.append((source_name, tokenizer_name, None, f"Błąd: {str(e)}"))

# Wyświetl podsumowanie jako wykresy słupkowe ASCII
def format_number(n):
    """Formatuj liczbę z separatorami tysięcy"""
    if n is None:
        return "N/A"
    return f"{n:,}".replace(",", " ")

def create_bar(value, max_value, bar_width=50):
    """Utwórz poziomy słupek ASCII"""
    if value is None or max_value == 0:
        return "░" * bar_width

    filled = int((value / max_value) * bar_width)
    empty = bar_width - filled

    # Użyj różnych znaków dla lepszej wizualizacji
    bar = "█" * filled + "░" * empty
    return bar

# Grupuj wyniki według korpusów
results_by_corpus = {}
for source_name, tokenizer_name, token_count, status in results:
    if source_name not in results_by_corpus:
        results_by_corpus[source_name] = []
    results_by_corpus[source_name].append((tokenizer_name, token_count, status))

print("\n")
print("╔" + "═" * 100 + "╗")
print("║" + " " * 35 + "PODSUMOWANIE TOKENIZACJI" + " " * 41 + "║")
print("╚" + "═" * 100 + "╝")

for corpus_idx, (source_name, corpus_results) in enumerate(results_by_corpus.items()):
    print("\n")
    print("┌" + "─" * 100 + "┐")

    # Nagłówek korpusu
    corpus_title = f" 📊 {source_name.upper()} "
    print("│" + corpus_title + " " * (100 - len(corpus_title)) + "│")
    print("├" + "─" * 100 + "┤")

    # Znajdź maksymalną wartość dla normalizacji
    valid_counts = [count for _, count, status in corpus_results if count is not None]

    if not valid_counts:
        print("│ Brak danych do wyświetlenia" + " " * 71 + "│")
        print("└" + "─" * 100 + "┘")
        continue

    min_count = min(valid_counts)
    max_count = max(valid_counts)
    avg_count = sum(valid_counts) / len(valid_counts)

    # Wyświetl wykresy słupkowe
    for tokenizer_name, token_count, status in corpus_results:
        if token_count is not None:
            # Określ kolor/styl słupka
            if token_count == min_count:
                indicator = "★"  # Najlepszy
            elif token_count == max_count:
                indicator = "▼"  # Najgorszy
            else:
                indicator = " "

            bar = create_bar(token_count, max_count, bar_width=45)
            token_str = format_number(token_count)

            # Nazwa tokenizera (skrócona do 18 znaków)
            tok_name = tokenizer_name[:18].ljust(18)

            print(f"│{indicator} {tok_name} │{bar}│ {token_str:>10} │")
        else:
            tok_name = tokenizer_name[:18].ljust(18)
            bar = "░" * 45
            print(f"│✗ {tok_name} │{bar}│ {'N/A':>10} │")

    # Statystyki dla korpusu
    print("├" + "─" * 100 + "┤")
    print(f"│ 📈 Statystyki:" + " " * 86 + "│")
    print(f"│    • Minimum (najlepsza kompresja):  {format_number(min_count):>10} tokenów" + " " * 44 + "│")
    print(f"│    • Maksimum (najgorsza kompresja): {format_number(max_count):>10} tokenów" + " " * 44 + "│")
    print(f"│    • Średnia:                        {format_number(int(avg_count)):>10} tokenów" + " " * 44 + "│")
    print(f"│    • Różnica (max-min):              {format_number(max_count - min_count):>10} tokenów" + " " * 44 + "│")
    print(f"│    • Kompresja względem max:         {((max_count - min_count) / max_count * 100):>9.1f}%" + " " * 47 + "│")
    print("└" + "─" * 100 + "┘")

print("\n" + "═" * 100)
print("Legenda: ★ = najlepsza kompresja │ ▼ = najgorsza kompresja │ ✗ = błąd")
print("         █ = użyte tokeny │ ░ = niewykorzystana przestrzeń")
print("═" * 100)