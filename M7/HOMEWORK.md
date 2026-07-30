# Zadanie 1

Zastosuj **Bird’s Eye View Pattern** (Lekcja 4). Wybierz:
- TMS - panel zarządzania flotą
- WMS - panel raportów i analityki
- CP - zlecenia transportowe/magazynowe

# Zadanie 2

**Vertical Slices Architecture**.
- Dokonaj refactoru zakładki Route Planner (TMS). Obecnie codebase jest podzielony warstwowo.
- Stwórz plik rules/subagent, który będzie dostosowywał kod do VSA.

# Zadanie 3

**Client-side PDF generator (WMS/TMS/CP).**

Kontekst:
- W repo są już PDFy. Ale mają koszmarny kodzik 🤠 (folder `pdf/`)

Zadanie:
- Zaprojektować sensowne rozwiązanie.
- Czy/jakie wzorce mogą tu pasować?
- Jaką/ie abstrakcje wybrać?
- Sporządź plik rule/subagent ułatwiający pracę nad PDFami
- Przeimplementuj generatory PDFów.

# Zadanie 4

**Zaadaptuj zewnętrzny komponent.**

Apka - do wyboru:
- WMS - reports > financial reports
- TMS - driver details view
- CP - service requests - new stats

Zadanie:
- Podepnij mockowe metryki/statystyki.
- Dodaj storybook stories.

Podziel się efektem wizualnym!

# Zadanie 5

**Wygeneruj UI/UX mockup**.

Zadanie:
- Multi-Select w zagnieżdżonym drzewie.
- Sam(a) określasz parametry/design.
- Weź najprostszy program graficzny (np. excalidraw).
- Narysuj szkic komponentu - ręcznie.
- Promptuj stitch.withgoogle.com i wygeneruj kilka opcji. W szczególności - jeśli pierwsze 3 Ci nie odpowiadają, to każ wygenerować np. kolejne 3

przykładowa struktura drzewiasta:
```md
- magazynowanie towaru
  - zarządzanie uzupełnieniami
    - sugestie uzupełnień
    - sugestie dostawców
  - zarządzanie terminami przydatności
  - raportowanie
    - autonomiczne raporty
    - alerty realtime
    - analiza trendów
  - składowanie wysokomagazynowe
  - last-mile delivery
- transport towaru
  - obsługa priorytetowa
  - raportowanie
    - autonomiczne raporty
    - śledzenie w czasie rzeczywistym
    - geofencing
  - inteligentna optymalizacja dostaw
  - materiały specjalne
    - temperatura kontrolowana
    - materiały niebezpieczne
    - delikatne przedmioty
    - dokumenty prawne
```
Rozwiązanie:
- https://stitch.withgoogle.com/projects/16539016807663827328?pli=1
- https://stitch.withgoogle.com/projects/14643211834076667389?pli=1

# Zadanie 6

(kontynuacja Zad 5)
**Który z designów jest najlepszy?**

Zadanie:
- Spromptuj LLMa, przekazując mu 3 najlepsze opcje (z poprzedniego zadania)
- LLM ma wskazać, który design jest najbardziej adekwatny dla danego rodzaju usera (np. pracownika systemu logistycznego, kontrahenta biznesowego, klienta detalicznego) - I DLACZEGO?

Podziel się zaktualizowanym designem!

# Zadanie 7

**Zaimplementuj playwrightowe testy E2E**.

Zadanie:
- CP/Customer Portal (vue/nuxt).
- ficzer: **New Transportation Request**.

# Zadanie 8

**Browser Automation.**

Wstęp:
- Skonfiguruj MCP: playwright albo chrome devtools.
- Wybierz Frontend: TMS/WMS/CP, postaw apkę.
- Sprowokuj w kodzie błąd.

Zadanie:
- Następnie promptuj LLMa tak, aby otworzył aplikację w przeglądarce, przenawigował do miejsca, w którym błąd występuje, a następnie odczytał błąd z konsoli - i go naprawił.
