"""
Przykłady różnych wariantów architektury sieci dla XOR.
Każdy wariant pokazuje różne opcje modyfikacji.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

# ============================================
# WARIANT 1: ORYGINALNY (z Twojego kodu)
# ============================================
class SimpleXORNet_Original(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)  # 2 wejścia -> 4 neurony
        self.fc2 = nn.Linear(4, 1)  # 4 neurony -> 1 wyjście

    def forward(self, x):
        x = self.fc1(x)
        x = nn.ReLU()(x)  # ReLU jako instancja
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# WARIANT 2: WIĘKSZA WARSTWA UKRYTA
# ============================================
class SimpleXORNet_Larger(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 8)   # Zwiększamy z 4 do 8 neuronów
        self.fc2 = nn.Linear(8, 1)

    def forward(self, x):
        x = self.fc1(x)
        x = F.relu(x)  # Używamy F.relu zamiast nn.ReLU()
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# WARIANT 3: WIĘCEJ WARSTW UKRYTYCH
# ============================================
class SimpleXORNet_Deeper(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.fc2 = nn.Linear(4, 4)  # Dodatkowa warstwa ukryta
        self.fc3 = nn.Linear(4, 1)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))  # Druga warstwa ukryta
        x = self.fc3(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# WARIANT 4: RÓŻNE FUNKCJE AKTYWACJI
# ============================================
class SimpleXORNet_Tanh(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.fc2 = nn.Linear(4, 1)

    def forward(self, x):
        x = self.fc1(x)
        x = torch.tanh(x)  # Tanh zamiast ReLU (zakres: -1 do 1)
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# WARIANT 5: DROPOUT (regularyzacja)
# ============================================
class SimpleXORNet_Dropout(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.dropout = nn.Dropout(0.2)  # Wyłącza 20% neuronów losowo
        self.fc2 = nn.Linear(4, 1)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.dropout(x)  # Tylko podczas treningu!
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# WARIANT 6: BATCH NORMALIZATION
# ============================================
class SimpleXORNet_BatchNorm(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.bn1 = nn.BatchNorm1d(4)  # Normalizuje aktywacje
        self.fc2 = nn.Linear(4, 1)

    def forward(self, x):
        x = self.fc1(x)
        x = self.bn1(x)  # BatchNorm przed aktywacją
        x = F.relu(x)
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# WARIANT 7: RELU JAKO ATRYBUT KLASY
# ============================================
class SimpleXORNet_ReLUAttribute(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.relu = nn.ReLU()  # Definiujemy jako atrybut
        self.fc2 = nn.Linear(4, 1)

    def forward(self, x):
        x = self.fc1(x)
        x = self.relu(x)  # Używamy atrybutu
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# WARIANT 8: SEQUENTIAL (krótsza składnia)
# ============================================
class SimpleXORNet_Sequential(nn.Module):
    def __init__(self):
        super().__init__()
        # nn.Sequential łączy warstwy w sekwencję
        self.net = nn.Sequential(
            nn.Linear(2, 4),
            nn.ReLU(),
            nn.Linear(4, 1),
            nn.Sigmoid()  # Sigmoid też może być w Sequential
        )

    def forward(self, x):
        return self.net(x)  # Bardzo prosty forward!


# ============================================
# WARIANT 9: BEZ SIGMOID (dla regresji)
# ============================================
class SimpleXORNet_NoSigmoid(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.fc2 = nn.Linear(4, 1)
        # Brak sigmoid - wyjście może być dowolną liczbą

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.fc2(x)  # Bez sigmoid
        return x


# ============================================
# WARIANT 10: CUSTOM INITIALIZATION
# ============================================
class SimpleXORNet_CustomInit(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.fc2 = nn.Linear(4, 1)
        
        # Własna inicjalizacja wag
        nn.init.xavier_uniform_(self.fc1.weight)  # Xavier/Glorot init
        nn.init.zeros_(self.fc1.bias)
        nn.init.xavier_uniform_(self.fc2.weight)
        nn.init.zeros_(self.fc2.bias)

    def forward(self, x):
        x = F.relu(self.fc1(x))
        x = self.fc2(x)
        x = torch.sigmoid(x)
        return x


# ============================================
# PRZYKŁAD UŻYCIA - TEST RÓŻNYCH WARIANTÓW
# ============================================
if __name__ == "__main__":
    # Test danych XOR
    X = torch.tensor([[0., 0.], [0., 1.], [1., 0.], [1., 1.]])
    
    print("Testowanie różnych wariantów sieci:\n")
    
    variants = [
        ("Original", SimpleXORNet_Original()),
        ("Larger (8 neurons)", SimpleXORNet_Larger()),
        ("Deeper (3 layers)", SimpleXORNet_Deeper()),
        ("Tanh activation", SimpleXORNet_Tanh()),
        ("With Dropout", SimpleXORNet_Dropout()),
        ("With BatchNorm", SimpleXORNet_BatchNorm()),
        ("Sequential", SimpleXORNet_Sequential()),
    ]
    
    for name, model in variants:
        with torch.no_grad():
            output = model(X)
            print(f"{name:25} | Output shape: {output.shape} | Sample: {output[0].item():.4f}")





