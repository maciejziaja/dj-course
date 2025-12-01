# Podstawy Sieci Neuronowych - Wyjaśnienie

## 1. Czym jest sieć neuronowa?

**Analogia z radiem:**
- Sieć = radio z pokrętłami (wagi)
- Wejście = sygnał radiowy (dane)
- Wyjście = jakość odbioru (predykcja)
- Trening = kręcenie pokrętłami, aż znajdziemy najlepsze ustawienia

**Matematycznie:**
Sieć to funkcja `f(x, w)` gdzie:
- `x` = dane wejściowe
- `w` = wagi (parametry do nauki)
- `f(x, w)` = predykcja

## 2. Jak działa trening?

### Krok 1: Forward Pass
```
Dane wejściowe → Sieć → Predykcja
[0, 1] → model → 0.7 (powinno być 1.0)
```

### Krok 2: Obliczenie błędu (Loss)
```
Loss = różnica między predykcją a prawdą
Loss = |0.7 - 1.0| = 0.3
```

### Krok 3: Backward Pass (propagacja wsteczna)
```
Obliczamy gradienty - kierunek poprawy dla każdej wagi
Gradient = "o ile zmienić wagę, żeby zmniejszyć błąd"
```

### Krok 4: Aktualizacja wag
```
Nowa_waga = Stara_waga - LEARNING_RATE * Gradient
```

## 3. LEARNING_RATE - Kluczowy Parametr

### Co to jest?
`LEARNING_RATE` (współczynnik uczenia) określa **jak duże kroki** robi optymalizator podczas aktualizowania wag.

### Analogia z górą:
Wyobraź sobie, że szukasz najniższego punktu w dolinie (minimum loss):
- **Wysoki LEARNING_RATE (np. 1.0)**: Duże kroki
  - ✅ Szybko docierasz do celu
  - ❌ Możesz "przeskoczyć" minimum i nigdy nie znaleźć optymalnego rozwiązania
  - ❌ Może powodować niestabilność (loss skacze w górę i w dół)

- **Niski LEARNING_RATE (np. 0.001)**: Małe kroki
  - ✅ Stabilny trening, precyzyjne dojście do minimum
  - ❌ Bardzo wolny trening
  - ❌ Może utknąć w lokalnym minimum

- **Średni LEARNING_RATE (np. 0.1-0.5)**: Złoty środek
  - ✅ Dobry balans między szybkością a stabilnością

### W Twoim kodzie:
```python
LEARNING_RATE = 0.5  # Dość wysoki dla małej sieci XOR
optimizer = optim.SGD(model.parameters(), LEARNING_RATE)
```

**Co się dzieje wewnątrz `optimizer.step()`:**
```python
# Dla każdej wagi w modelu:
for param in model.parameters():
    # param.grad zawiera gradient (kierunek poprawy)
    # LEARNING_RATE określa jak duży krok zrobimy
    param.data = param.data - LEARNING_RATE * param.grad
```

### Eksperymenty z LEARNING_RATE:

| LEARNING_RATE | Efekt |
|---------------|-------|
| 0.001 | Bardzo wolny trening, może nie zbiec w 2000 epokach |
| 0.01 | Wolny, ale stabilny |
| 0.1 | Dobry balans |
| 0.5 | Szybki (Twój kod), działa dla XOR |
| 1.0 | Może być niestabilny, loss może oscylować |
| 10.0 | Prawdopodobnie rozbieżny (loss rośnie zamiast maleć) |

## 4. nn.Module - Podstawa PyTorch

### Czym jest?
`nn.Module` to klasa bazowa dla wszystkich modeli w PyTorch. To jak "kontrakt" - każdy model musi go spełnić.

### Co daje `nn.Module`?

1. **Rejestracja parametrów:**
```python
self.fc1 = nn.Linear(2, 4)  # Automatycznie rejestruje wagi i biasy
# Teraz model.parameters() zwróci wszystkie wagi
```

2. **Automatyczne gradienty:**
```python
loss.backward()  # Automatycznie oblicza gradienty dla wszystkich parametrów
```

3. **Przenoszenie na GPU:**
```python
model = model.cuda()  # Przenosi wszystkie parametry na GPU
```

4. **Zapisywanie/ładowanie:**
```python
torch.save(model.state_dict(), 'model.pth')  # Zapisuje wszystkie parametry
```

5. **Tryb treningu/testowania:**
```python
model.train()   # Włącza dropout, batch norm w trybie treningu
model.eval()    # Wyłącza dropout, batch norm w trybie testowania
```

### `super().__init__()`
Wywołuje konstruktor klasy bazowej, żeby wszystkie te funkcje działały.

## 5. Opcje Modyfikacji Sieci

Zobacz plik `xor-network-variations.py` dla przykładów. Główne opcje:

### A. Rozmiar warstw
```python
self.fc1 = nn.Linear(2, 4)   # 4 neurony
self.fc1 = nn.Linear(2, 8)   # 8 neuronów (więcej mocy)
self.fc1 = nn.Linear(2, 2)   # 2 neurony (mniej mocy)
```

### B. Liczba warstw
```python
# 2 warstwy (oryginał)
self.fc1 = nn.Linear(2, 4)
self.fc2 = nn.Linear(4, 1)

# 3 warstwy (głębsza sieć)
self.fc1 = nn.Linear(2, 4)
self.fc2 = nn.Linear(4, 4)  # Dodatkowa warstwa
self.fc3 = nn.Linear(4, 1)
```

### C. Funkcje aktywacji
```python
x = F.relu(x)        # ReLU: max(0, x) - najpopularniejsza
x = torch.tanh(x)    # Tanh: zakres -1 do 1
x = torch.sigmoid(x) # Sigmoid: zakres 0 do 1
x = F.leaky_relu(x)  # Leaky ReLU: pozwala na małe wartości ujemne
```

### D. Regularyzacja
```python
self.dropout = nn.Dropout(0.2)  # Wyłącza 20% neuronów losowo (zapobiega przeuczeniu)
self.bn = nn.BatchNorm1d(4)     # Normalizuje aktywacje
```

### E. Inicjalizacja wag
```python
nn.init.xavier_uniform_(self.fc1.weight)  # Xavier init
nn.init.zeros_(self.fc1.bias)             # Zera dla biasów
```

## 6. PyTorch vs Inne Biblioteki

### PyTorch
- ✅ **Dynamiczne grafy** - możesz debugować krok po kroku
- ✅ **Pythonic** - kod wygląda jak normalny Python
- ✅ **Popularny w badaniach** - łatwo eksperymentować
- ✅ **Dobry dla prototypowania**

### TensorFlow/Keras
- ✅ **Statyczne grafy** (historycznie) - szybsze w produkcji
- ✅ **Bardziej deklaratywny** - mniej kontroli, więcej automatyzacji
- ✅ **Popularny w produkcji** - lepsze wsparcie deployment

### JAX
- ✅ **Funkcjonalny styl** - wszystko to funkcje
- ✅ **Automatyczne różniczkowanie** - bardzo zaawansowane
- ✅ **Popularny w badaniach** - szczególnie w AI/ML

**Dla początkujących:** PyTorch jest najłatwiejszy do zrozumienia, bo kod jest najbardziej "Pythonowy".

## 7. Kluczowe Pojęcia

- **Epoch**: Jeden pełny przejazd przez wszystkie dane treningowe
- **Batch**: Podzbiór danych przetwarzany jednocześnie (w XOR: cały dataset = 1 batch)
- **Loss**: Błąd - różnica między predykcją a prawdą
- **Gradient**: Kierunek poprawy - "w którą stronę zmienić wagę"
- **Backpropagation**: Algorytm obliczania gradientów (propagacja wstecz)
- **Optimizer**: Algorytm aktualizujący wagi (SGD, Adam, itp.)

## 8. Dlaczego XOR jest trudny?

XOR nie jest **liniowo separowalny** - nie można go rozwiązać jedną linią prostą.

```
XOR Truth Table:
[0,0] → 0
[0,1] → 1  ← Trzeba "zakrzywić" przestrzeń
[1,0] → 1
[1,1] → 0
```

Potrzebujemy **warstwy ukrytej** z nieliniową aktywacją (ReLU), żeby "zakrzywić" przestrzeń decyzyjną.





