# pip install sentence-transformers numpy scikit-learn

import numpy as np
import json
from sentence_transformers import SentenceTransformer
import logging
import os
import time
from corpora import CORPORA_FILES

# Ustawienie logowania
logging.basicConfig(format='%(asctime)s : %(levelname)s : %(message)s', level=logging.INFO)

# --- KONFIGURACJA ŚCIEŻEK I PARAMETRÓW ---
# MODEL_NAME = 'intfloat/multilingual-e5-small'
# MODEL_NAME = 'sdadas/mmlw-roberta-large'
MODEL_NAME = 'sdadas/mmlw-roberta-base'
OUTPUT_EMBEDDINGS_FILE = "sbert_sentence_embeddings.npy"
OUTPUT_SENTENCES_FILE = "sbert_sentences.json"

files = CORPORA_FILES["ALL"]

# --- ETAP 1: Wczytanie Korpusu ---

def load_raw_sentences(file_list):
    """Wczytuje surowe zdania z listy plików."""
    raw_sentences = []
    print(f"Wczytywanie tekstu z {len(file_list)} plików...")
    for file in file_list:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                # Wczytaj linie, usuń białe znaki i pomiń puste
                lines = [line.strip() for line in f if line.strip()]
                raw_sentences.extend(lines)
        except FileNotFoundError:
            # Ostrzeżenie, jeśli plik nie zostanie znaleziony
            print(f"OSTRZEŻENIE: Nie znaleziono pliku '{file}'. Pomijam.")
        except Exception as e:
            print(f"BŁĄD podczas przetwarzania pliku '{file}': {e}")

    if not raw_sentences:
        raise ValueError("Korpus danych jest pusty lub nie został wczytany.")

    return raw_sentences

# --- ETAP 2: Generowanie i Zapisywanie Embeddingów ---

def encode_corpus():
    """Główna funkcja kodująca korpus i zapisująca embeddingi."""

    # Wczytanie zdań z korpusu
    try:
        raw_sentences = load_raw_sentences(files)
        print(f"Wczytano {len(raw_sentences)} zdań do przetworzenia.")
    except ValueError as e:
        print(f"BŁĄD: {e}")
        return

    # Ładowanie modelu
    print(f"\n--- Ładowanie Modelu Sentence-Transformer ---")
    print(f"Model: {MODEL_NAME}")
    try:
        model_sbert = SentenceTransformer(MODEL_NAME)
        print("Model załadowany pomyślnie.")
    except Exception as e:
        print(f"FATALNY BŁĄD podczas ładowania modelu {MODEL_NAME}: {e}")
        return

    # Generowanie embeddingów
    print(f"\nGenerowanie wektorów dla {len(raw_sentences)} zdań...")
    start_time = time.time()

    sentence_embeddings = model_sbert.encode(
        raw_sentences,
        show_progress_bar=True,
        convert_to_numpy=True
    )

    end_time = time.time()
    print(f"Generowanie zakończone w {end_time - start_time:.2f} sekundy.")

    # Zapisanie embeddingów
    np.save(OUTPUT_EMBEDDINGS_FILE, sentence_embeddings)
    print(f"\n✓ Wektory zdań zapisane jako: '{OUTPUT_EMBEDDINGS_FILE}'")
    print(f"  - Kształt macierzy: {sentence_embeddings.shape}")
    print(f"  - Wymiar wektora: {sentence_embeddings.shape[1]}")

    # Zapisanie zdań do pliku JSON
    with open(OUTPUT_SENTENCES_FILE, 'w', encoding='utf-8') as f:
        json.dump(raw_sentences, f, ensure_ascii=False, indent=2)
    print(f"✓ Zdania zapisane jako: '{OUTPUT_SENTENCES_FILE}'")

    print(f"\n{'='*60}")
    print(f"KODOWANIE KORPUSU ZAKOŃCZONE POMYŚLNIE")
    print(f"{'='*60}")
    print(f"Pliki wyjściowe:")
    print(f"  - {OUTPUT_EMBEDDINGS_FILE} ({os.path.getsize(OUTPUT_EMBEDDINGS_FILE) / 1024 / 1024:.2f} MB)")
    print(f"  - {OUTPUT_SENTENCES_FILE} ({os.path.getsize(OUTPUT_SENTENCES_FILE) / 1024 / 1024:.2f} MB)")

if __name__ == "__main__":
    encode_corpus()
