# 4. Модуль дифференциального анализа

## 4.1 Назначение модуля

Модуль дифференциального анализа отвечает за:
- Построение дифференциальных характеристик для целевых хэш-функций.
- Вычисление вероятностей характеристик.
- Фильтрацию и ранжирование кандидатов для последующей передачи SAT-решателю.
- Извлечение достаточных условий (sufficient conditions) для каждой характеристики.

**Расположение:** `src/differential/`

---

## 4.2 Ключевые структуры данных

### BitDifference

Разность одного бита с тремя возможными состояниями:

```python
from enum import Enum

class BitDiffType(Enum):
    ZERO = 0    # бит не изменился (x = x')
    ONE = 1     # бит изменился (x ≠ x')
    UNKNOWN = 2 # значение не определено

class BitDifference:
    """Разность одного бита."""
    def __init__(self, diff_type: BitDiffType, position: int):
        self.diff_type = diff_type
        self.position = position
```

### WordDifference

Разность 32-битного слова:

```python
class WordDifference:
    """XOR-разность 32-битного слова."""
    def __init__(self, xor_diff: int = 0):
        self.xor_diff = xor_diff  # 32-битная XOR-разность

    @property
    def hamming_weight(self) -> int:
        """Число активных (изменённых) бит."""
        return bin(self.xor_diff).count('1')

    @property
    def active_bits(self) -> list[int]:
        """Позиции активных бит (от младшего)."""
        return [i for i in range(32) if (self.xor_diff >> i) & 1]
```

### RoundDifference

Разность состояния на выходе одного раунда:

```python
class RoundDifference:
    """Разности всех рабочих слов после одного раунда."""
    def __init__(self, round_num: int, word_diffs: dict[str, WordDifference]):
        self.round_num = round_num
        self.word_diffs = word_diffs  # {'a': WordDiff, 'b': WordDiff, ...}

    @property
    def total_active_bits(self) -> int:
        return sum(wd.hamming_weight for wd in self.word_diffs.values())
```

### DifferentialCharacteristic

Полная дифференциальная характеристика через все раунды:

```python
class DifferentialCharacteristic:
    """Полная дифференциальная характеристика."""
    def __init__(self):
        self.message_diff: list[WordDifference] = []   # ΔW₀..ΔW₁₅
        self.round_diffs: list[RoundDifference] = []
        self.probability: float = 1.0
        self.conditions: list[BitCondition] = []

    def add_round(self, rd: RoundDifference, prob: float):
        self.round_diffs.append(rd)
        self.probability *= prob

    @property
    def log2_probability(self) -> float:
        import math
        return math.log2(self.probability) if self.probability > 0 else float('-inf')
```

---

## 4.3 Правила распространения разностей

### 4.3.1 XOR

```python
def propagate_xor(delta_x: int, delta_y: int) -> tuple[int, float]:
    """XOR: Δ(x ⊕ y) = Δx ⊕ Δy, вероятность 1."""
    return delta_x ^ delta_y, 1.0
```

### 4.3.2 Битовые функции Ch и Maj

**Ch(x, y, z) = (x ∧ y) ⊕ (¬x ∧ z):**

Для каждого бита `i` дифференциальное поведение зависит от `(Δxᵢ, Δyᵢ, Δzᵢ)`:

```
Δxᵢ=0, Δyᵢ=0, Δzᵢ=0 → ΔChᵢ=0, Pr=1
Δxᵢ=0, Δyᵢ=1, Δzᵢ=0 → ΔChᵢ=?, Pr=1/2  (зависит от xᵢ)
Δxᵢ=0, Δyᵢ=0, Δzᵢ=1 → ΔChᵢ=?, Pr=1/2
Δxᵢ=0, Δyᵢ=1, Δzᵢ=1 → ΔChᵢ=1, Pr=1
Δxᵢ=1, Δyᵢ=0, Δzᵢ=0 → ΔChᵢ=?, Pr=1/2  (зависит от yᵢ⊕zᵢ)
Δxᵢ=1, Δyᵢ=1, Δzᵢ=0 → ΔChᵢ=?, Pr=1/2
Δxᵢ=1, Δyᵢ=0, Δzᵢ=1 → ΔChᵢ=?, Pr=1/2
Δxᵢ=1, Δyᵢ=1, Δzᵢ=1 → ΔChᵢ=1, Pr=1
```

```python
def ch_differential_probability(dx: int, dy: int, dz: int) -> tuple[dict[int, float]]:
    """Вычисляет возможные выходные разности Ch и их вероятности побитно."""
    prob_log2 = 0
    for i in range(32):
        bx = (dx >> i) & 1
        by = (dy >> i) & 1
        bz = (dz >> i) & 1
        if (bx, by, bz) in [(0,0,0), (0,1,1), (1,1,1)]:
            pass  # определённый результат, Pr=1
        else:
            prob_log2 -= 1  # неопределённый бит, Pr=1/2
    return prob_log2
```

**Maj(x, y, z) = (x ∧ y) ⊕ (x ∧ z) ⊕ (y ∧ z):** аналогичная таблица.

### 4.3.3 Модульное сложение

Модульное сложение `z = (x + y) mod 2^32` — наиболее сложная для дифференциального анализа операция.

**XOR-дифференциал модульного сложения:**

Для заданных `Δx, Δy` множество возможных `Δz` и их вероятности определяются carry-пропагацией:

```python
def modadd_xor_differential(dx: int, dy: int, dz: int) -> float:
    """
    Вычисляет вероятность XOR-дифференциала (dx, dy) → dz
    для модульного сложения mod 2^32.

    Использует алгоритм Lipmaa-Moriai (2001).
    """
    # eq(a, b) = ~(a ^ b) — побитное совпадение
    eq_dx_dy = ~(dx ^ dy) & 0xFFFFFFFF
    eq_dx_dz = ~(dx ^ dz) & 0xFFFFFFFF

    # Маска допустимости: (eq(Δx,Δy) ∨ eq(Δx,Δz)) должна быть вся 1
    # кроме MSB
    mask = (eq_dx_dy | eq_dx_dz) & 0x7FFFFFFF  # без старшего бита

    if mask != 0x7FFFFFFF:
        return 0.0  # невозможный дифференциал

    # Число «свободных» бит (carry может быть 0 или 1)
    # определяется позициями, где eq(Δx,Δy)=0 и eq(Δx,Δz)=0
    free_bits = ~eq_dx_dy & ~eq_dx_dz & 0x7FFFFFFF
    k = bin(free_bits).count('1')

    return 2.0 ** (-k)
```

### 4.3.4 Ротация и сдвиг

```python
def propagate_rotation(delta: int, r: int) -> tuple[int, float]:
    """Ротация: Δ(x <<< r) = Δx <<< r, вероятность 1."""
    rotated = ((delta << r) | (delta >> (32 - r))) & 0xFFFFFFFF
    return rotated, 1.0

def propagate_shift_right(delta: int, r: int) -> tuple[int, float]:
    """Логический сдвиг вправо: Δ(x >> r) = Δx >> r, вероятность 1.
    При условии, что старшие r бит Δx равны 0."""
    return delta >> r, 1.0
```

---

## 4.4 Алгоритм генерации характеристик

### Стратегия поиска: Branch and Bound

```
Алгоритм GenerateCharacteristics:

Вход: ΔM (разность сообщения), p_min (мин. вероятность), max_rounds
Выход: список DifferentialCharacteristic

1. Инициализация: пустая характеристика, prob = 1.0
2. Для каждого раунда i = 0..max_rounds-1:
   a. Вычислить ΔWᵢ из message schedule.
   b. Для каждого возможного выходного дифференциала:
      - Вычислить вероятность раунда p_round.
      - Если prob × p_round < p_min → отсечь ветвь.
      - Иначе: добавить раунд, рекурсивно продолжить.
3. Вернуть все характеристики с prob ≥ p_min.
```

### Оптимизации

1. **Greedy-порядок перебора:** Сначала рассматривать дифференциалы с наибольшей вероятностью.
2. **Кэширование:** Мемоизация вероятностей для повторяющихся входных паттернов.
3. **Ограничение на вес Хэмминга:** Отбрасывать дифференциалы с весом > порога.
4. **Параллелизм:** Независимые ветви дерева поиска можно обрабатывать параллельно.

---

## 4.5 Достаточные условия (Sufficient Conditions)

Для каждой дифференциальной характеристики необходимо извлечь **достаточные условия** — ограничения на конкретные биты внутреннего состояния, гарантирующие прохождение разности через раунд.

```python
class BitCondition:
    """Условие на конкретный бит."""
    ZERO = '0'      # бит должен быть 0
    ONE = '1'       # бит должен быть 1
    EQUAL = '='     # бит x_i = x'_i (без разности)
    NEQUAL = '!'    # бит x_i ≠ x'_i (с разностью)
    FREE = '?'      # без ограничений

    def __init__(self, word: str, round_num: int, bit_pos: int, condition: str):
        self.word = word           # 'a', 'e', 'W', etc.
        self.round_num = round_num
        self.bit_pos = bit_pos
        self.condition = condition
```

Достаточные условия определяют, какие биты внутреннего состояния должны принимать фиксированные значения, чтобы дифференциальная характеристика выполнялась. Эти условия напрямую транслируются в дополнительные клозы SAT-задачи.

Пример: если `Ch(e, f, g)` требует, чтобы бит `e[5] = 1` для прохождения разности, добавляется условие:
```
BitCondition(word='e', round=3, bit=5, condition='1')
```

---

## 4.6 Вычисление вероятности характеристики

### Точное вычисление

Для каждого раунда:
1. Определить активные биты в нелинейных операциях.
2. Для каждой нелинейной операции (Ch, Maj, `+`) вычислить вероятность дифференциального перехода.
3. Перемножить вероятности (предположение Маркова).

### Учёт зависимостей

Предположение Маркова (независимость раундов) не вполне точно для хэш-функций, т.к.:
- Слова `b, c, d` в SHA-256 — сдвинутые копии `a` из предыдущих раундов.
- Message schedule создаёт зависимости между `Wᵢ`.

Для более точной оценки применяется **экспериментальная верификация**: случайная выборка пар сообщений, подсчёт доли пар, удовлетворяющих характеристике.

---

## 4.7 Выходные данные модуля

Модуль генерирует:

1. **Список характеристик** — отсортированный по вероятности, с метаданными:
   ```json
   {
     "characteristic_id": "sha256_r16_001",
     "hash_function": "SHA-256",
     "num_rounds": 16,
     "message_diff": "0x80000000 0x00000000 ...",
     "probability_log2": -24.5,
     "num_conditions": 48,
     "conditions": [...]
   }
   ```

2. **Достаточные условия** — для передачи в SAT-кодировщик.

3. **Статистика поиска** — число рассмотренных ветвей, время, отсечённые варианты.

---

## 4.8 Структура файлов модуля

```
src/differential/
├── characteristics.py      # DifferentialCharacteristic, генерация
├── propagation.py          # Правила распространения разностей
├── probability.py          # Вычисление вероятностей
├── conditions.py           # Извлечение достаточных условий
├── message_schedule.py     # Дифференциалы message schedule
└── search.py               # Алгоритмы поиска (BnB, greedy)
```
