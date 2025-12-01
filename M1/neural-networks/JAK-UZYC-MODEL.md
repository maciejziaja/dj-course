# Jak wykorzystać wytrenowaną sieć neuronową? 🧠

## Co robi ta sieć?

Wyobraź sobie, że masz **automatycznego asystenta**, który patrzy na **dwie liczby** i odpowiada na pytanie: **"Czy te liczby należą do grupy A czy grupy B?"**

Sieć została wytrenowana, aby rozpoznawać:
- **Grupa 0 (Klasa 0)**: liczby małe (około 0.1)
- **Grupa 1 (Klasa 1)**: liczby duże (około 0.9)

Po treningu sieć "wie", jak rozróżnić te dwie grupy i może to zrobić dla **nowych, nieznanych danych**.

---

## Praktyczne przykłady użycia

### 1. **System kontroli jakości w fabryce** 🏭

**Sytuacja**: Masz maszynę produkującą części. Każda część ma dwie cechy (np. waga i rozmiar).

**Jak użyć sieci**:
- Podajesz dwie liczby (wagę i rozmiar części)
- Sieć odpowiada: **0** = część wadliwa, **1** = część dobra
- Automatycznie odrzucasz wadliwe części

**Przykład**:
```
Część: waga=0.12, rozmiar=0.08
Sieć: "To część wadliwa (0)" → ODRZUĆ
```

---

### 2. **System wykrywania anomalii w bezpieczeństwie** 🔒

**Sytuacja**: Monitorujesz system komputerowy. Każde zdarzenie ma dwie cechy (np. czas trwania i liczbę prób dostępu).

**Jak użyć sieci**:
- Podajesz dwie liczby opisujące zdarzenie
- Sieć odpowiada: **0** = normalne, **1** = podejrzane
- Automatycznie alarmujesz przy podejrzanych zdarzeniach

**Przykład**:
```
Zdarzenie: czas=0.15, próby=0.11
Sieć: "To normalne (0)" → IGNORUJ
```

---

### 3. **Klasyfikacja klientów w sklepie** 🛒

**Sytuacja**: Chcesz automatycznie kategoryzować klientów na podstawie ich zachowania.

**Jak użyć sieci**:
- Podajesz dwie cechy klienta (np. średnia wartość zakupu i częstotliwość wizyt)
- Sieć odpowiada: **0** = klient okazjonalny, **1** = klient VIP
- Automatycznie oferujesz różne promocje

**Przykład**:
```
Klient: średnia=0.92, częstotliwość=0.88
Sieć: "To klient VIP (1)" → WYŚLIJ EKSLUZYWNĄ OFERTĘ
```

---

### 4. **System medyczny - wstępna diagnoza** 🏥

**Sytuacja**: Chcesz szybko ocenić, czy pacjent wymaga pilnej opieki.

**Jak użyć sieci**:
- Podajesz dwie wartości (np. temperatura i ciśnienie krwi - znormalizowane)
- Sieć odpowiada: **0** = stan normalny, **1** = wymaga uwagi
- Automatycznie priorytetyzujesz pacjentów

**Przykład**:
```
Pacjent: temperatura=0.13, ciśnienie=0.09
Sieć: "Stan normalny (0)" → STANDARDOWA KOLEJKA
```

---

### 5. **Filtrowanie emaili** 📧

**Sytuacja**: Chcesz automatycznie rozpoznawać spam.

**Jak użyć sieci**:
- Podajesz dwie cechy emaila (np. liczbę słów kluczowych i liczbę linków - znormalizowane)
- Sieć odpowiada: **0** = normalny email, **1** = spam
- Automatycznie przenosisz spam do folderu

**Przykład**:
```
Email: słowa_kluczowe=0.95, linki=0.87
Sieć: "To spam (1)" → PRZENIEŚ DO SPAMU
```

---

## Jak to działa w praktyce?

### Krok 1: Wczytaj wytrenowany model
```python
model = SimpleNN()
model.load_state_dict(torch.load('binary_classification_model_weights.pth'))
model.eval()  # Tryb oceny (nie treningu)
```

### Krok 2: Przygotuj nowe dane
```python
# Nowa część do sprawdzenia
nowa_czesc = torch.tensor([[0.12, 0.08]])  # [waga, rozmiar]
```

### Krok 3: Uzyskaj predykcję
```python
with torch.no_grad():  # Nie obliczaj gradientów (szybsze)
    wynik = model(nowa_czesc)
    prawdopodobienstwo = wynik.item()
    
    if prawdopodobienstwo < 0.5:
        print("Klasa 0 - część wadliwa")
    else:
        print("Klasa 1 - część dobra")
```

---

## Ważne uwagi ⚠️

1. **Sieć działa tylko na danych podobnych do tych, na których była trenowana**
   - Jeśli trenowałeś na liczbach 0.1-0.9, nie zadziała dobrze na liczbach 100-900

2. **Potrzebujesz znormalizować dane**
   - Przed użyciem przeskaluj swoje dane do zakresu podobnego do danych treningowych

3. **Sieć daje prawdopodobieństwo, nie pewność**
   - Wynik 0.3 oznacza "prawdopodobnie klasa 0"
   - Wynik 0.8 oznacza "prawdopodobnie klasa 1"

4. **To prosty przykład**
   - W prawdziwych zastosowaniach używa się większych sieci i więcej danych treningowych

---

## Podsumowanie

Wytrenowana sieć to jak **"inteligentny filtr"**, który:
- ✅ Bierze **dwie liczby** jako wejście
- ✅ Zwraca **prawdopodobieństwo** (0-1)
- ✅ Może **automatyzować decyzje** w różnych systemach
- ✅ Działa **szybko** i **automatycznie**

Najważniejsze: sieć "nauczyła się" rozpoznawać wzorce podczas treningu i teraz może je zastosować do **nowych, nieznanych danych**!

