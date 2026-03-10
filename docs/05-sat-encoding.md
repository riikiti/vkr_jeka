# 5. Модуль SAT-кодирования

## 5.1 Назначение модуля

Модуль SAT-кодирования преобразует:
- Раундовые операции хэш-функций в булевы ограничения (клозы в CNF).
- Дифференциальные условия в дополнительные клозы.
- Целевые условия (равенство хэшей, фиксация разностей) в ограничения.

**Расположение:** `src/sat_encoding/`

---

## 5.2 Основы CNF-кодирования

### Формат DIMACS CNF

Стандартный формат для SAT-решателей:

```
c Комментарий
p cnf <число_переменных> <число_клозов>
1 -2 3 0         (x₁ ∨ ¬x₂ ∨ x₃)
-1 2 0           (¬x₁ ∨ x₂)
```

Каждая строка — клоз, `0` — терминатор, отрицательное число — отрицание переменной.

### Управление переменными

```python
class VariableManager:
    """Управление булевыми переменными SAT-задачи."""

    def __init__(self):
        self._next_var = 1
        self._names: dict[str, int] = {}

    def new_var(self, name: str = "") -> int:
        """Создать новую булеву переменную."""
        var = self._next_var
        self._next_var += 1
        if name:
            self._names[name] = var
        return var

    def new_word(self, name: str, bits: int = 32) -> list[int]:
        """Создать 32-битное слово (список переменных)."""
        return [self.new_var(f"{name}[{i}]") for i in range(bits)]

    @property
    def num_vars(self) -> int:
        return self._next_var - 1
```

### Построитель клозов

```python
class CNFBuilder:
    """Построитель CNF-формулы."""

    def __init__(self):
        self.var_mgr = VariableManager()
        self.clauses: list[list[int]] = []

    def add_clause(self, clause: list[int]):
        """Добавить клоз (дизъюнкцию литералов)."""
        self.clauses.append(clause)

    def add_clauses(self, clauses: list[list[int]]):
        for c in clauses:
            self.add_clause(c)

    def to_dimacs(self) -> str:
        """Экспорт в DIMACS CNF формат."""
        lines = [f"p cnf {self.var_mgr.num_vars} {len(self.clauses)}"]
        for clause in self.clauses:
            lines.append(" ".join(str(l) for l in clause) + " 0")
        return "\n".join(lines)

    def write_dimacs(self, filename: str):
        with open(filename, 'w') as f:
            f.write(self.to_dimacs())
```

---

## 5.3 Кодирование побитовых операций

### 5.3.1 NOT (отрицание)

`z = ¬x` кодируется двумя клозами:
```
(x ∨ z)       — если x=0, то z=1
(¬x ∨ ¬z)    — если x=1, то z=0
```

```python
def encode_not(builder: CNFBuilder, x: int, z: int):
    builder.add_clause([x, z])
    builder.add_clause([-x, -z])
```

### 5.3.2 AND (конъюнкция)

`z = x ∧ y` — 3 клоза:
```
(¬x ∨ ¬y ∨ z)     — если x=1 и y=1, то z=1
(x ∨ ¬z)           — если x=0, то z=0
(y ∨ ¬z)           — если y=0, то z=0
```

```python
def encode_and(builder: CNFBuilder, x: int, y: int, z: int):
    builder.add_clause([-x, -y, z])
    builder.add_clause([x, -z])
    builder.add_clause([y, -z])
```

### 5.3.3 OR (дизъюнкция)

`z = x ∨ y` — 3 клоза:
```
(x ∨ y ∨ ¬z)
(¬x ∨ z)
(¬y ∨ z)
```

### 5.3.4 XOR (исключающее ИЛИ)

`z = x ⊕ y` — 4 клоза:
```
(¬x ∨ ¬y ∨ ¬z)
(¬x ∨ y ∨ z)
(x ∨ ¬y ∨ z)
(x ∨ y ∨ ¬z)
```

```python
def encode_xor(builder: CNFBuilder, x: int, y: int, z: int):
    builder.add_clause([-x, -y, -z])
    builder.add_clause([-x, y, z])
    builder.add_clause([x, -y, z])
    builder.add_clause([x, y, -z])
```

### 5.3.5 XOR трёх переменных

`z = x ⊕ y ⊕ w` можно через промежуточную переменную или напрямую (8 клозов):

```python
def encode_xor3(builder: CNFBuilder, x: int, y: int, w: int, z: int):
    """z = x ⊕ y ⊕ w — 8 клозов."""
    builder.add_clause([-x, -y, -w, -z])
    builder.add_clause([-x, -y, w, z])
    builder.add_clause([-x, y, -w, z])
    builder.add_clause([-x, y, w, -z])
    builder.add_clause([x, -y, -w, z])
    builder.add_clause([x, -y, w, -z])
    builder.add_clause([x, y, -w, -z])
    builder.add_clause([x, y, w, z])
```

---

## 5.4 Кодирование операций хэш-функций

### 5.4.1 Ch(x, y, z)

`Ch(x, y, z) = (x ∧ y) ⊕ (¬x ∧ z)`

Для каждого бита `i`:

```python
def encode_ch_bit(builder, xi, yi, zi, out_i):
    """Кодирует один бит Ch.
    out = (x ∧ y) ⊕ (¬x ∧ z)
    Эквивалентно: out = z ⊕ (x ∧ (y ⊕ z))
    """
    # Вводим промежуточные переменные
    t1 = builder.var_mgr.new_var()  # t1 = y ⊕ z
    t2 = builder.var_mgr.new_var()  # t2 = x ∧ t1
    encode_xor(builder, yi, zi, t1)
    encode_and(builder, xi, t1, t2)
    encode_xor(builder, zi, t2, out_i)
```

**Число клозов на бит:** 4 + 3 + 4 = 11 клозов, 2 вспомогательные переменные.

### 5.4.2 Maj(x, y, z)

`Maj(x, y, z) = (x ∧ y) ⊕ (x ∧ z) ⊕ (y ∧ z)`

Эквивалентная форма: `Maj = (x ∧ y) ∨ (z ∧ (x ⊕ y))`

```python
def encode_maj_bit(builder, xi, yi, zi, out_i):
    """Кодирует один бит Maj."""
    t1 = builder.var_mgr.new_var()  # t1 = x ⊕ y
    t2 = builder.var_mgr.new_var()  # t2 = z ∧ t1
    t3 = builder.var_mgr.new_var()  # t3 = x ∧ y
    encode_xor(builder, xi, yi, t1)
    encode_and(builder, zi, t1, t2)
    encode_and(builder, xi, yi, t3)
    encode_or(builder, t2, t3, out_i)
```

### 5.4.3 Модульное сложение (32-битное)

`z = (x + y) mod 2^32` — наиболее затратная операция по числу клозов.

**Стратегия кодирования: ripple-carry adder.**

```python
def encode_modular_add(builder, x_bits: list, y_bits: list, z_bits: list):
    """
    Кодирует z = (x + y) mod 2^32.
    x_bits, y_bits, z_bits — списки из 32 переменных (от LSB к MSB).
    """
    carry = builder.var_mgr.new_var("carry_0")
    # carry_0 = 0 (нет входного переноса)
    builder.add_clause([-carry])

    for i in range(32):
        new_carry = builder.var_mgr.new_var(f"carry_{i+1}")

        # z[i] = x[i] ⊕ y[i] ⊕ carry
        encode_xor3(builder, x_bits[i], y_bits[i], carry, z_bits[i])

        # new_carry = majority(x[i], y[i], carry)
        # = (x ∧ y) ∨ (x ∧ c) ∨ (y ∧ c)
        encode_maj_bit(builder, x_bits[i], y_bits[i], carry, new_carry)

        carry = new_carry
    # Старший carry отбрасывается (mod 2^32)
```

**Число клозов:** ~32 × (8 + 14) ≈ 704 клоза на одно сложение.

**Альтернатива: Parallel prefix adder (Kogge-Stone)**
- Меньшая глубина логической схемы → лучшая propagation в SAT-решателе.
- Больше вспомогательных переменных, но SAT-решатели часто работают быстрее.

### 5.4.4 Битовая ротация и сдвиг

Ротация и сдвиг не требуют клозов — это просто перенумерация переменных:

```python
def rotate_right(bits: list[int], r: int) -> list[int]:
    """ROTR: перенумерация без новых клозов."""
    n = len(bits)
    return [bits[(i + r) % n] for i in range(n)]

def shift_right(builder, bits: list[int], r: int) -> list[int]:
    """SHR: старшие r бит = 0."""
    result = [builder.var_mgr.new_var() for _ in range(r)]
    for v in result:
        builder.add_clause([-v])  # фиксируем в 0
    return result + bits[:len(bits) - r]
```

---

## 5.5 Кодирование одного раунда SHA-256

```python
def encode_sha256_round(builder, state, W_i, K_i, round_num):
    """
    Кодирует один раунд SHA-256.
    state = (a, b, c, d, e, f, g, h) — списки переменных по 32 бита.
    Возвращает новое состояние.
    """
    a, b, c, d, e, f, g, h = state

    # Σ₁(e) = ROTR⁶(e) ⊕ ROTR¹¹(e) ⊕ ROTR²⁵(e)
    sigma1 = encode_sigma1(builder, e)

    # Ch(e, f, g)
    ch = encode_ch(builder, e, f, g)

    # T₁ = h + Σ₁(e) + Ch(e,f,g) + Kᵢ + Wᵢ
    t1_1 = builder.var_mgr.new_word(f"t1_1_r{round_num}")
    encode_modular_add(builder, h, sigma1, t1_1)
    t1_2 = builder.var_mgr.new_word(f"t1_2_r{round_num}")
    encode_modular_add(builder, t1_1, ch, t1_2)
    t1_3 = builder.var_mgr.new_word(f"t1_3_r{round_num}")
    encode_modular_add_const(builder, t1_2, K_i, t1_3)
    T1 = builder.var_mgr.new_word(f"T1_r{round_num}")
    encode_modular_add(builder, t1_3, W_i, T1)

    # Σ₀(a) = ROTR²(a) ⊕ ROTR¹³(a) ⊕ ROTR²²(a)
    sigma0 = encode_sigma0(builder, a)

    # Maj(a, b, c)
    maj = encode_maj(builder, a, b, c)

    # T₂ = Σ₀(a) + Maj(a,b,c)
    T2 = builder.var_mgr.new_word(f"T2_r{round_num}")
    encode_modular_add(builder, sigma0, maj, T2)

    # Новое состояние
    new_e = builder.var_mgr.new_word(f"e_r{round_num+1}")
    encode_modular_add(builder, d, T1, new_e)

    new_a = builder.var_mgr.new_word(f"a_r{round_num+1}")
    encode_modular_add(builder, T1, T2, new_a)

    return (new_a, a, b, c, new_e, e, f, g)
```

### Оценка размера CNF

| Компонент (1 раунд SHA-256) | Переменных | Клозов |
|-----------------------------|------------|--------|
| Σ₀, Σ₁ (ротации + XOR) | ~192 | ~384 |
| Ch (32 бита) | ~64 | ~352 |
| Maj (32 бита) | ~96 | ~448 |
| Модульные сложения (×6) | ~384 | ~4224 |
| **Итого на раунд** | **~736** | **~5408** |
| **16 раундов** | **~11 776** | **~86 528** |
| **24 раунда** | **~17 664** | **~129 792** |

---

## 5.6 Кодирование дифференциальных условий

### Фиксация разности

Для двух копий хэш-функции (с сообщениями `M` и `M'`):

```python
def encode_xor_difference(builder, x_bits, x_prime_bits, delta: int):
    """Фиксирует XOR-разность: x ⊕ x' = delta."""
    for i in range(32):
        if (delta >> i) & 1:
            # x[i] ≠ x'[i]
            encode_xor_equals_one(builder, x_bits[i], x_prime_bits[i])
        else:
            # x[i] = x'[i]
            encode_equal(builder, x_bits[i], x_prime_bits[i])

def encode_equal(builder, a, b):
    """a = b (2 клоза)."""
    builder.add_clause([-a, b])
    builder.add_clause([a, -b])

def encode_xor_equals_one(builder, a, b):
    """a ⊕ b = 1, т.е. a ≠ b (2 клоза)."""
    builder.add_clause([a, b])
    builder.add_clause([-a, -b])
```

### Кодирование достаточных условий

```python
def encode_sufficient_conditions(builder, conditions: list, var_map: dict):
    """Добавляет достаточные условия как unit clauses."""
    for cond in conditions:
        var = var_map[(cond.word, cond.round_num, cond.bit_pos)]
        if cond.condition == '1':
            builder.add_clause([var])
        elif cond.condition == '0':
            builder.add_clause([-var])
```

---

## 5.7 Структура файлов модуля

```
src/sat_encoding/
├── cnf_builder.py              # CNFBuilder, VariableManager, DIMACS I/O
├── bit_constraints.py          # Кодирование побитовых операций (XOR, AND, OR)
├── word_operations.py          # Модульное сложение, ротации, сдвиги
├── hash_encoder.py             # Кодирование полных раундов SHA-256 / SHA-1
├── differential_constraints.py # Кодирование дифференциальных условий
└── optimizations.py            # Оптимизации CNF (symmetry breaking, предвычисления)
```
