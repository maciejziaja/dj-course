# pip install sentence-transformers numpy scikit-learn

import numpy as np
import json
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import logging
import os

# Ustawienie logowania
logging.basicConfig(format='%(asctime)s : %(levelname)s : %(message)s', level=logging.INFO)

# --- KONFIGURACJA ---
# MODEL_NAME = 'intfloat/multilingual-e5-small'
# MODEL_NAME = 'sdadas/mmlw-roberta-large'
MODEL_NAME = 'sdadas/mmlw-roberta-base'
INPUT_EMBEDDINGS_FILE = "sbert_sentence_embeddings.npy"
INPUT_SENTENCES_FILE = "sbert_sentences.json"

# --- WCZYTYWANIE DANYCH ---

def load_embeddings_and_sentences():
    """Wczytuje embeddingi i zdania z plików."""

    # Sprawdzenie czy pliki istnieją
    if not os.path.exists(INPUT_EMBEDDINGS_FILE):
        raise FileNotFoundError(
            f"Plik '{INPUT_EMBEDDINGS_FILE}' nie istnieje. "
            f"Uruchom najpierw 'encode_sbert.py' aby zakodować korpus."
        )

    if not os.path.exists(INPUT_SENTENCES_FILE):
        raise FileNotFoundError(
            f"Plik '{INPUT_SENTENCES_FILE}' nie istnieje. "
            f"Uruchom najpierw 'encode_sbert.py' aby zakodować korpus."
        )

    print(f"Wczytywanie embeddingów z '{INPUT_EMBEDDINGS_FILE}'...")
    sentence_embeddings = np.load(INPUT_EMBEDDINGS_FILE)
    print(f"✓ Załadowano {sentence_embeddings.shape[0]} wektorów (wymiar: {sentence_embeddings.shape[1]})")

    print(f"Wczytywanie zdań z '{INPUT_SENTENCES_FILE}'...")
    with open(INPUT_SENTENCES_FILE, 'r', encoding='utf-8') as f:
        raw_sentences = json.load(f)
    print(f"✓ Załadowano {len(raw_sentences)} zdań")

    return sentence_embeddings, raw_sentences

# --- WYSZUKIWANIE PODOBIEŃSTW ---

def search_similar_sentences(query_sentence, sentence_embeddings, raw_sentences, model, top_k=5):
    """Wyszukuje najbardziej podobne zdania do zapytania."""

    print(f"\n{'='*60}")
    print(f"ZAPYTANIE: '{query_sentence}'")
    print(f"{'='*60}")

    # Kodowanie zapytania
    query_embedding = model.encode([query_sentence], convert_to_numpy=True)

    # Obliczenie podobieństwa kosinusowego
    similarities = cosine_similarity(query_embedding, sentence_embeddings)[0]

    # Znalezienie top K najbardziej podobnych
    top_k_indices = np.argsort(similarities)[::-1][:top_k]

    print(f"\nTop {top_k} najbardziej podobnych zdań:")
    print("-" * 60)

    results = []
    for i in top_k_indices:
        result = {
            'index': int(i),
            'similarity': float(similarities[i]),
            'sentence': raw_sentences[i]
        }
        results.append(result)
        print(f"  [{i}] Sim: {similarities[i]:.4f}")
        print(f"      {raw_sentences[i]}")
        print()

    return results

# --- GŁÓWNA FUNKCJA ---

def main():
    """Główna funkcja uruchamiająca wyszukiwanie."""

    # Wczytanie danych
    try:
        sentence_embeddings, raw_sentences = load_embeddings_and_sentences()
    except FileNotFoundError as e:
        print(f"\n❌ BŁĄD: {e}")
        return

    # Ładowanie modelu
    print(f"\nŁadowanie modelu: {MODEL_NAME}...")
    try:
        model_sbert = SentenceTransformer(MODEL_NAME)
        print("✓ Model załadowany pomyślnie.")
    except Exception as e:
        print(f"❌ BŁĄD podczas ładowania modelu: {e}")
        return

    # --- PRZYKŁADOWE ZAPYTANIA ---
    # Możesz dodać swoje własne zapytania poniżej

    queries = [
        "Jestem głodny.",
        "Wojsko wejdzie do miast i skończą się bunty",
        "Leczenie tego schorzenia jest bardzo ważne i wymaga interwencji lekarza.",
    ]

    for query in queries:
        search_similar_sentences(
            query_sentence=query,
            sentence_embeddings=sentence_embeddings,
            raw_sentences=raw_sentences,
            model=model_sbert,
            top_k=5
        )

    # --- INTERAKTYWNY TRYB ---
    print(f"\n{'='*60}")
    print("TRYB INTERAKTYWNY")
    print("Wpisz zdanie aby wyszukać podobne (lub 'q' aby zakończyć)")
    print(f"{'='*60}\n")

    while True:
        try:
            user_query = input("Zapytanie: ").strip()

            if user_query.lower() in ['q', 'quit', 'exit']:
                print("Zakończono.")
                break

            if not user_query:
                continue

            search_similar_sentences(
                query_sentence=user_query,
                sentence_embeddings=sentence_embeddings,
                raw_sentences=raw_sentences,
                model=model_sbert,
                top_k=5
            )

        except KeyboardInterrupt:
            print("\n\nZakończono przez użytkownika.")
            break
        except Exception as e:
            print(f"❌ BŁĄD: {e}")

if __name__ == "__main__":
    main()
