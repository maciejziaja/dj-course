import numpy as np
import json
from gensim.models import Word2Vec
from tokenizers import Tokenizer

# --- KONFIGURACJA ŚCIEŻEK ---
# TOKENIZER_FILE = "../tokenizer/tokenizers/custom_bpe_tokenizer.json"
# TOKENIZER_FILE = "../tokenizer/tokenizers/bielik-v1-tokenizer.json"
# TOKENIZER_FILE = "../tokenizer/tokenizers/bielik-v3-tokenizer.json"
TOKENIZER_FILE = "../tokenizer/tokenizers/tokenizer-all-corpora.json"

MODEL_FILE = "embedding_word2vec_cbow_model.model"
TENSOR_FILE = "embedding_tensor_cbow.npy"
MAP_FILE = "embedding_token_to_index_map.json"

# --- ŁADOWANIE MODELU I TOKENIZERA ---

print(f"Ładowanie modelu z pliku: {MODEL_FILE}")
try:
    model = Word2Vec.load(MODEL_FILE)
    print(f"Model załadowany pomyślnie. Słownik zawiera {len(model.wv)} tokenów.")
except FileNotFoundError:
    print(f"BŁĄD: Nie znaleziono pliku modelu '{MODEL_FILE}'.")
    print("Upewnij się, że uruchomiłeś najpierw train_cbow.py")
    exit()

print(f"\nŁadowanie tokenizera z pliku: {TOKENIZER_FILE}")
try:
    tokenizer = Tokenizer.from_file(TOKENIZER_FILE)
    print("Tokenizer załadowany pomyślnie.")
except FileNotFoundError:
    print(f"BŁĄD: Nie znaleziono pliku '{TOKENIZER_FILE}'.")
    exit()

# --- FUNKCJE WNIOSKOWANIA ---

def get_word_vector_and_similar(word: str, tokenizer: Tokenizer, model: Word2Vec, topn: int = 20):
    """
    Oblicza wektor dla całego słowa poprzez uśrednienie wektorów jego tokenów
    i zwraca najbardziej podobne tokeny.

    Args:
        word: Słowo do analizy
        tokenizer: Tokenizer BPE
        model: Wytrenowany model Word2Vec
        topn: Liczba najbardziej podobnych tokenów do zwrócenia

    Returns:
        Tuple (word_vector, similar_tokens) lub (None, None) w przypadku błędu
    """
    # Tokenizacja słowa na tokeny podwyrazowe
    # Używamy .encode(), aby otoczyć słowo spacjami, co imituje kontekst w zdaniu
    # Ważne: tokenizator BPE/SentencePiece musi widzieć spację, by dodać prefiks '_'
    encoding = tokenizer.encode(" " + word + " ") 
    word_tokens = [t.strip() for t in encoding.tokens if t.strip()] # Usuń puste tokeny

    # Usuwamy tokeny początku/końca sekwencji, jeśli zostały dodane przez tokenizator
    if word_tokens and word_tokens[0] in ['[CLS]', '<s>', '<s>', 'Ġ']:
        word_tokens = word_tokens[1:]
    if word_tokens and word_tokens[-1] in ['[SEP]', '</s>', '</s>']:
        word_tokens = word_tokens[:-1]

    valid_vectors = []
    missing_tokens = []

    # 1. Zbieranie wektorów dla każdego tokenu
    for token in word_tokens:
        if token in model.wv:
            # Użycie tokenu ze spacją (np. '_ryż') lub bez (np. 'szlach')
            valid_vectors.append(model.wv[token])
        else:
            # W tym miejscu token może być zbyt rzadki i pominięty przez MIN_COUNT
            missing_tokens.append(token)

    if not valid_vectors:
        # Kod do obsługi, gdy żaden token nie ma wektora
        if missing_tokens:
            print(f"BŁĄD: Żaden z tokenów składowych ('{word_tokens}') nie znajduje się w słowniku.")
        else:
            print(f"BŁĄD: Słowo '{word}' nie zostało przetworzone na wektory (sprawdź tokenizację).")
        return None, None

    # 2. Uśrednianie wektorów
    # Wektor dla całego słowa to średnia wektorów jego tokenów składowych
    word_vector = np.mean(valid_vectors, axis=0)

    # 3. Znalezienie najbardziej podobnych tokenów
    similar_words = model.wv.most_similar(
        positive=[word_vector],
        topn=topn
    )

    return word_vector, similar_words


def get_token_similar(token: str, model: Word2Vec, topn: int = 10):
    """
    Zwraca najbardziej podobne tokeny dla pojedynczego tokenu.

    Args:
        token: Token do analizy
        model: Wytrenowany model Word2Vec
        topn: Liczba najbardziej podobnych tokenów do zwrócenia

    Returns:
        Lista (token, similarity) lub None w przypadku błędu
    """
    if token not in model.wv:
        print(f"BŁĄD: Token '{token}' nie znajduje się w słowniku.")
        return None

    return model.wv.most_similar(token, topn=topn)


def get_combined_similar(tokens: list, model: Word2Vec, topn: int = 10):
    """
    Zwraca najbardziej podobne tokeny dla kombinacji wielu tokenów.

    Args:
        tokens: Lista tokenów do kombinacji
        model: Wytrenowany model Word2Vec
        topn: Liczba najbardziej podobnych tokenów do zwrócenia

    Returns:
        Lista (token, similarity) lub None w przypadku błędu
    """
    # Sprawdzenie czy wszystkie tokeny są w słowniku
    missing = [t for t in tokens if t not in model.wv]
    if missing:
        print(f"BŁĄD: Następujące tokeny nie znajdują się w słowniku: {missing}")
        return None

    return model.wv.most_similar(positive=tokens, topn=topn)


# --- PRZYKŁADY UŻYCIA ---

if __name__ == "__main__":
    print("\n" + "="*60)
    print("PRZYKŁADY WNIOSKOWANIA Z MODELU CBOW")
    print("="*60)

    # Przykład 1: Podobieństwa dla całych słów
    print("\n--- 1. Szukanie podobieństw dla całych SŁÓW ---")
    words_to_test = ['wojsko', 'szlachta', 'choroba', 'król'] 

    for word in words_to_test:
        word_vector, similar_tokens = get_word_vector_and_similar(word, tokenizer, model, topn=10)

        if word_vector is not None:
            print(f"\n10 tokenów najbardziej podobnych do SŁOWA '{word}':")
            print(f"  > Tokeny: {tokenizer.encode(' ' + word + ' ').tokens}")
            print(f"  > Wektor słowa (początek): {word_vector[:5]}...")
            for token, similarity in similar_tokens:
                print(f"  - {token}: {similarity:.4f}")

    # Przykład 2: Analogia wektorowa (kombinacja tokenów)
    print("\n--- 2. Analogia wektorowa (kombinacja tokenów) ---")
    tokens_analogy = ['dziecko', 'kobieta']

    similar_to_combined = get_combined_similar(tokens_analogy, model, topn=10)

    if similar_to_combined:
        print(f"\n10 tokenów najbardziej podobnych do kombinacji: {tokens_analogy}")
        for token, similarity in similar_to_combined:
            print(f"  - {token}: {similarity:.4f}")

    # Przykład 3: Interaktywny tryb
    print("\n" + "="*60)
    print("TRYB INTERAKTYWNY")
    print("="*60)
    print("Wpisz słowo, aby znaleźć podobne tokeny (lub 'exit' aby zakończyć)")

    while True:
        user_input = input("\nPodaj słowo: ").strip()

        if user_input.lower() in ['exit', 'quit', 'q']:
            print("Do widzenia!")
            break

        if not user_input:
            continue

        word_vector, similar_tokens = get_word_vector_and_similar(user_input, tokenizer, model, topn=10)

        if word_vector is not None:
            print(f"\n10 tokenów najbardziej podobnych do '{user_input}':")
            for token, similarity in similar_tokens:
                print(f"  - {token}: {similarity:.4f}")
