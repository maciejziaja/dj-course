"""
Eksperyment pokazujący wpływ LEARNING_RATE na trening sieci XOR.
Uruchom ten skrypt, żeby zobaczyć jak różne wartości wpływają na zbieżność.
"""

import torch
import torch.nn as nn
import torch.optim as optim
import matplotlib.pyplot as plt

# Prosty model XOR
class SimpleXORNet(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(2, 4)
        self.fc2 = nn.Linear(4, 1)

    def forward(self, x):
        x = torch.relu(self.fc1(x))
        x = torch.sigmoid(self.fc2(x))
        return x

# Dane XOR
X = torch.tensor([[0., 0.], [0., 1.], [1., 0.], [1., 1.]])
Y = torch.tensor([[0.], [1.], [1.], [0.]])

# Różne wartości LEARNING_RATE do przetestowania
learning_rates = [0.001, 0.01, 0.1, 0.5, 1.0, 2.0]
NUM_EPOCHS = 2000

print("=" * 60)
print("EKSPERYMENT: Wpływ LEARNING_RATE na trening")
print("=" * 60)

results = {}

for lr in learning_rates:
    # Stwórz nowy model dla każdego LEARNING_RATE
    model = SimpleXORNet()
    criterion = nn.BCELoss()
    optimizer = optim.SGD(model.parameters(), lr=lr)
    
    losses = []
    
    # Trening
    for epoch in range(NUM_EPOCHS):
        outputs = model(X)
        loss = criterion(outputs, Y)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        losses.append(loss.item())
        
        # Sprawdź czy osiągnęliśmy dobrą dokładność
        if epoch % 200 == 0:
            with torch.no_grad():
                predictions = (model(X) >= 0.5).float()
                accuracy = (predictions == Y).sum().item() / len(Y)
                if accuracy == 1.0:  # 100% dokładność
                    print(f"LR={lr:6.3f} | Epoka {epoch:4d} | Loss: {loss.item():.6f} | Accuracy: 100% ✓")
                    break
    
    # Finalna ocena
    with torch.no_grad():
        predictions = (model(X) >= 0.5).float()
        accuracy = (predictions == Y).sum().item() / len(Y)
        final_loss = losses[-1]
    
    results[lr] = {
        'losses': losses,
        'final_loss': final_loss,
        'accuracy': accuracy,
        'converged_epoch': len(losses)
    }
    
    status = "✓ ZBIEGŁO" if accuracy == 1.0 else "✗ NIE ZBIEGŁO"
    print(f"LR={lr:6.3f} | Final Loss: {final_loss:.6f} | Accuracy: {accuracy*100:.1f}% | {status}")

print("\n" + "=" * 60)
print("PODSUMOWANIE:")
print("=" * 60)
print(f"{'LR':<8} | {'Final Loss':<12} | {'Accuracy':<10} | {'Status':<15}")
print("-" * 60)

for lr in sorted(learning_rates):
    r = results[lr]
    status = "Zbiegło ✓" if r['accuracy'] == 1.0 else "Nie zbiegło ✗"
    print(f"{lr:<8.3f} | {r['final_loss']:<12.6f} | {r['accuracy']*100:<9.1f}% | {status}")

print("\n💡 WNIOSKI:")
print("   - Zbyt mały LR (0.001) → wolny trening")
print("   - Optymalny LR (0.1-0.5) → szybki i stabilny")
print("   - Zbyt duży LR (2.0) → niestabilny, może nie zbiec")

# Opcjonalnie: wykres (wymaga matplotlib)
try:
    plt.figure(figsize=(12, 6))
    for lr in learning_rates:
        losses = results[lr]['losses']
        plt.plot(losses, label=f'LR={lr}', alpha=0.7)
    
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title('Wpływ LEARNING_RATE na zbieżność treningu')
    plt.legend()
    plt.yscale('log')  # Skala logarytmiczna dla lepszej czytelności
    plt.grid(True, alpha=0.3)
    plt.savefig('learning_rate_comparison.png')
    print(f"\n📊 Wykres zapisany jako: learning_rate_comparison.png")
except ImportError:
    print("\n💡 Zainstaluj matplotlib, żeby zobaczyć wykres: pip install matplotlib")





