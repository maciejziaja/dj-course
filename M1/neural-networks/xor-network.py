import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from safetensors.torch import save_file
from torch.utils.tensorboard import SummaryWriter
import os

# Config / settings
LOG_DIR = 'runs/xor'
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)
writer = SummaryWriter(LOG_DIR)

np.set_printoptions(precision=4, suppress=True)

## 1. Definicja Modelu Sieci Neuronowej

# 🔥🔥🔥 (kształt sieci)

class SimpleXORNet(nn.Module):
    def __init__(self):
        super(SimpleXORNet, self).__init__()
        # Warstwa ukryta: 2 wejścia (X) -> 4 neurony
        self.fc1 = nn.Linear(2, 200)
        # Warstwa wyjściowa: 4 neurony -> 1 wyjście (Y)
        self.fc2 = nn.Linear(200, 1)

    def forward(self, x):
        # 1. Przejście przez pierwszą warstwę liniową
        x = self.fc1(x)
        # 2. Zastosowanie nieliniowej funkcji aktywacji ReLU
        x = nn.ReLU()(x)
        # 3. Przejście przez warstwę wyjściową (logits)
        x = self.fc2(x)
        # 4. Zastosowanie Sigmoid do uzyskania prawdopodobieństwa (w zakresie 0-1)
        x = torch.sigmoid(x)
        return x

## 2. Inicjalizacja Modelu

model = SimpleXORNet()
model_epochs = 0

LEARNING_RATE = 0.2 # 🔥🔥🔥

# BCELoss dla klasyfikacji binarnej (używamy go po Sigmoidzie)
criterion = nn.BCELoss()

# Optymalizator: Wskaźnik uczenia (lr) jest kluczowy, tu mała wartość
optimizer = optim.SGD(model.parameters(), LEARNING_RATE)

## 3. Przygotowanie Danych i Pętla Treningowa
# Ważne: PyTorch oczekuje liczb zmiennoprzecinkowych dla wejść sieci.

NUM_EPOCHS = 200 # 🔥🔥🔥

# Dane wejściowe (4 pary: [0, 0], [0, 1], [1, 0], [1, 1])
X = torch.tensor([[0., 0.], [0., 1.], [1., 0.], [1., 1.]])

# Etykiety (oczekiwane wyjścia XOR: 0, 1, 1, 0)
Y = torch.tensor([[0.], [1.], [1.], [0.]])

# 🔥🔥🔥 wykonując ten snippet ponownie "KONTYNUUJESZ" trening modelu o kolejne epoki
# 🔥🔥🔥 aby wystartować trening od zera, stwórz nowy model (uruchom POPRZEDNI snippet)

print("--- Rozpoczęcie Treningu ---")
for epoch in range(NUM_EPOCHS):
    # Krok 1: Forward Pass (przekazanie danych)
    outputs = model(X)

    # Krok 2: Obliczenie Strady (Loss)
    loss = criterion(outputs, Y)

    # Krok 3: Backward Pass (propagacja wsteczna)
    optimizer.zero_grad() # Zerowanie gradientów przed nowym obliczeniem
    loss.backward()       # Obliczenie gradientów
    optimizer.step()      # Aktualizacja wag modelu

    model_epochs += 1
    # Logowanie postępów co 200 epok
    if (epoch + 1) % 20 == 0:
        print(f'Epoka [{epoch+1}/{NUM_EPOCHS}, all: {model_epochs}], Strata (Loss): {loss.item():.6f}')
        # print(f'   outputs: {outputs.detach().numpy()}')
        writer.add_scalar('Loss', loss.item(), epoch)
        writer.add_histogram('Outputs', outputs.data, epoch)
        writer.add_histogram('Gradients/Layer_FC1_Weights', model.fc1.weight.grad, epoch)
        writer.add_histogram('Gradients/Layer_FC2_Weights', model.fc2.weight.grad, epoch)
        writer.add_histogram('Weights/Layer_FC1_Weights', model.fc1.weight.data, epoch)
        writer.add_histogram('Weights/Layer_FC2_Weights', model.fc2.weight.data, epoch)

print("--- Trening Zakończony ---")

## 4. Ocena i Testowanie

print("\n--- Wyniki Testowe (Użyteczne Obliczenie) ---")

# Wyłączenie mechanizmu gradientów, ponieważ tylko testujemy
with torch.no_grad():
    predictions = model(X)
    # Konwersja prawdopodobieństw (0-1) na konkretne klasy (0 lub 1)
    predicted_classes = (predictions >= 0.5).float()

    print(f"Wejścia (X):\n{X.numpy()}")
    print(f"Oczekiwane Wyjścia (Y):\n{Y.numpy().flatten()}")
    print(f"Predykcje Modelu:\n{predicted_classes.numpy().flatten()}")

    # Sprawdzenie użyteczności - czy się nauczyliśmy?
    accuracy = (predicted_classes == Y).sum().item() / len(Y)
    print(f"\nDokładność (Accuracy): {accuracy*100:.2f}%")
    
## 5. Wyświetl model (strukturę i parametry)

print("--- Struktura Sieci (Wbudowane print()) ---")
print(model)

print("--- Parametry Modelu ---")
for name, param in model.named_parameters():
    if param.requires_grad:
        print(f"- {name}:\n{param.data.numpy()}")
        
## 6. Zapisz wagi do pliku

# 1. Definicja ścieżki pliku
MODEL_PATH = "xor_model_weights.pth"

# 2. Zapisz tylko SŁOWNIK STANÓW (wagi i biasy)
# To jest najlepsza praktyka i odpowiednik "wartości" w safetensors.
torch.save(model.state_dict(), MODEL_PATH)

print(f"Model zapisany jako: {MODEL_PATH}")
# Wygenerowany plik to skompresowany słownik w formacie binarnym.

print(f"(run tensorboard/venv): tensorboard --logdir={LOG_DIR}")
print(f"(run tensorboard/venv): tensorboard --logdir=runs")
print("\nopen http://localhost:6006/; SCALARS - how loss changed over time; HISTOGRAMS - how gradients distributed over epochs")