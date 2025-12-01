"""
Przykład użycia wytrenowanego modelu do klasyfikacji binarnej.
Ten skrypt pokazuje, jak wczytać model i użyć go do predykcji na nowych danych.
"""

import torch
import torch.nn as nn

# Definicja modelu (musi być taka sama jak podczas treningu)
class SimpleNN(nn.Module):
    def __init__(self):
        super(SimpleNN, self).__init__()
        self.fc1 = nn.Linear(2, 100)
        self.fc2 = nn.Linear(100, 100)
        self.fc3 = nn.Linear(100, 1)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.relu(self.fc2(x))
        x = torch.sigmoid(self.fc3(x))
        return x


def load_model(model_path="binary_classification_model_weights.pth"):
    """Wczytuje wytrenowany model z pliku."""
    model = SimpleNN()
    model.load_state_dict(torch.load(model_path))
    model.eval()  # Przełącz na tryb oceny (wyłącza dropout, batch norm itp.)
    print(f"✓ Model wczytany z: {model_path}")
    return model


def predict(model, data):
    """
    Wykonuje predykcję na nowych danych.
    
    Args:
        model: Wytrenowany model
        data: Tensor z danymi (kształt: [liczba_próbek, 2])
    
    Returns:
        Prawdopodobieństwa przynależności do klasy 1
    """
    with torch.no_grad():  # Nie obliczaj gradientów (szybsze i oszczędza pamięć)
        predictions = model(data)
    return predictions


def classify(prediction, threshold=0.5):
    """
    Klasyfikuje wynik na podstawie progu.
    
    Args:
        prediction: Prawdopodobieństwo (0-1)
        threshold: Próg decyzyjny (domyślnie 0.5)
    
    Returns:
        Klasa (0 lub 1) i pewność
    """
    class_label = 1 if prediction >= threshold else 0
    confidence = prediction if class_label == 1 else (1 - prediction)
    return class_label, confidence


# ============================================
# PRZYKŁADY UŻYCIA
# ============================================

if __name__ == "__main__":
    print("=" * 60)
    print("PRZYKŁAD UŻYCIA WYTRENOWANEGO MODELU")
    print("=" * 60)
    
    # 1. Wczytaj model
    try:
        model = load_model()
    except FileNotFoundError:
        print("❌ Błąd: Nie znaleziono pliku z modelem!")
        print("   Najpierw uruchom: python binary-classification-network.py")
        exit(1)
    
    print()
    
    # 2. Przygotuj nowe dane do klasyfikacji
    print("📊 Testowanie na nowych danych:")
    print("-" * 60)
    
    # Przykładowe dane testowe
    test_data = torch.tensor([
        [0.12, 0.08],   # Powinno być klasa 0 (małe wartości)
        [0.15, 0.11],   # Powinno być klasa 0 (małe wartości)
        [0.88, 0.92],   # Powinno być klasa 1 (duże wartości)
        [0.91, 0.85],   # Powinno być klasa 1 (duże wartości)
        [0.50, 0.50],   # Granica - niepewne
    ])
    
    # 3. Wykonaj predykcje
    predictions = predict(model, test_data)
    
    # 4. Wyświetl wyniki
    for i, (data_point, pred) in enumerate(zip(test_data, predictions), 1):
        class_label, confidence = classify(pred.item())
        
        print(f"\nPróbka {i}:")
        print(f"  Wejście: [{data_point[0]:.2f}, {data_point[1]:.2f}]")
        print(f"  Prawdopodobieństwo klasy 1: {pred.item():.4f}")
        print(f"  Przewidywana klasa: {class_label}")
        print(f"  Pewność: {confidence*100:.1f}%")
        
        # Interpretacja
        if class_label == 0:
            print(f"  → To prawdopodobnie GRUPA 0 (małe wartości)")
        else:
            print(f"  → To prawdopodobnie GRUPA 1 (duże wartości)")
    
    print()
    print("=" * 60)
    print("💡 PRAKTYCZNE ZASTOSOWANIA:")
    print("=" * 60)
    print("""
1. KONTROLA JAKOŚCI:
   - Wejście: [waga części, rozmiar części]
   - Wyjście: 0 = wadliwa, 1 = dobra
   
2. WYKRYWANIE ANOMALII:
   - Wejście: [czas zdarzenia, liczba prób]
   - Wyjście: 0 = normalne, 1 = podejrzane
   
3. KLASYFIKACJA KLIENTÓW:
   - Wejście: [średnia zakupu, częstotliwość]
   - Wyjście: 0 = okazjonalny, 1 = VIP
   
4. FILTROWANIE SPAMU:
   - Wejście: [słowa kluczowe, liczba linków]
   - Wyjście: 0 = normalny, 1 = spam
    """)
    
    print("=" * 60)
    print("⚠️  WAŻNE: Model działa najlepiej na danych podobnych do treningowych!")
    print("   (wartości w zakresie ~0.1 dla klasy 0, ~0.9 dla klasy 1)")
    print("=" * 60)

