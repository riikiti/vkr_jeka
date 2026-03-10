# 7. Комбинированный алгоритм криптоанализа

## 7.1 Общая идея

Комбинированный метод объединяет дифференциальный криптоанализ и SAT-решатели в единый конвейер, где:
1. **Дифференциальный анализ** генерирует кандидатные характеристики и сужает пространство поиска.
2. **SAT-решатель** находит конкретные пары сообщений, удовлетворяющие ограничениям.
3. **Верификатор** подтверждает найденные коллизии на полной модели хэш-функции.

---

## 7.2 Три стратегии комбинирования

### 7.2.1 Sequential (последовательная)

```
┌─────────────────────┐
│  Генерация           │
│  дифференциальных    │──→ Список характеристик (отсортированный по Pr)
│  характеристик       │
└─────────────────────┘
           │
           ▼
     Для каждой характеристики d:
┌─────────────────────┐
│  SAT-кодирование     │
│  hash + diff(d)      │──→ CNF-файл
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  SAT-решатель        │──→ SAT: пара (M, M')  /  UNSAT: след. характеристика
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  Верификация         │──→ H(M) = H(M') ?
└─────────────────────┘
```

**Псевдокод:**

```python
def sequential_attack(hash_func, num_rounds, p_min, max_characteristics, timeout):
    # Этап 1: Дифференциальный анализ
    characteristics = generate_characteristics(
        hash_func, num_rounds, p_min, max_count=max_characteristics
    )
    characteristics.sort(key=lambda c: c.probability, reverse=True)

    # Этап 2: SAT-поиск
    for char in characteristics:
        # Кодирование
        cnf = encode_hash_with_differential(hash_func, num_rounds, char)
        cnf.write_dimacs("problem.cnf")

        # Решение
        result = solver.solve("problem.cnf", timeout=timeout)

        if result.result == SATResult.SAT:
            m1, m2 = extract_collision_pair(result.assignment)

            # Верификация
            if hash_func.hash(m1) == hash_func.hash(m2):
                return CollisionResult(m1, m2, char, result.stats)

    return None  # Коллизия не найдена
```

**Преимущества:** простота реализации, полная утилизация дифференциального анализа.

**Недостатки:** каждая SAT-задача решается с нуля; если характеристика неудачная, время тратится впустую.

### 7.2.2 Iterative (итеративная)

Постепенное уточнение дифференциальных ограничений на основе обратной связи от SAT-решателя.

```
┌──────────────┐     ┌──────────────┐
│ Дифф. анализ │◄───►│ SAT-решатель │
│              │     │ (инкрем.)    │
└──────────────┘     └──────────────┘
       │                    │
       ▼                    ▼
  Уточнение            Конфликтные
  характеристики       клозы → подсказки
```

**Псевдокод:**

```python
def iterative_attack(hash_func, num_rounds, max_iterations):
    # Базовое кодирование (без дифференциальных ограничений)
    base_cnf = encode_hash_collision(hash_func, num_rounds)
    inc_solver = IncrementalSolver()
    inc_solver.add_base_formula(base_cnf)

    # Начальная характеристика (грубая)
    char = generate_initial_characteristic(hash_func, num_rounds)

    for iteration in range(max_iterations):
        # Добавить текущие дифференциальные ограничения как assumptions
        assumptions = char.to_assumptions()
        result = inc_solver.solve_with_assumptions(assumptions)

        if result.result == SATResult.SAT:
            m1, m2 = extract_collision_pair(result.assignment)
            if verify_collision(hash_func, m1, m2):
                return CollisionResult(m1, m2, char, result.stats)

        elif result.result == SATResult.UNSAT:
            # Анализ конфликтного ядра (UNSAT core)
            core = inc_solver.get_unsat_core()
            # Ослабить или изменить характеристику
            char = refine_characteristic(char, core)

    return None
```

**Преимущества:** learnt clauses сохраняются между итерациями; обратная связь от SAT-решателя направляет поиск характеристик.

**Недостатки:** сложнее реализация; требует инкрементального решателя.

### 7.2.3 Hybrid (гибридная)

Параллельный запуск нескольких стратегий с обменом информацией.

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Sequential      │    │  Iterative       │    │  Pure SAT        │
│  (top-5 chars)   │    │  (adaptive)      │    │  (no diff guide) │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────┬───────────┘──────────────────────┘
                    ▼
           Shared learnt clauses
           First result wins
```

```python
from concurrent.futures import ProcessPoolExecutor, FIRST_COMPLETED, wait

def hybrid_attack(hash_func, num_rounds, timeout):
    with ProcessPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(sequential_attack, hash_func, num_rounds,
                          p_min=2**-30, max_characteristics=5, timeout=timeout),
            executor.submit(iterative_attack, hash_func, num_rounds,
                          max_iterations=50),
            executor.submit(pure_sat_attack, hash_func, num_rounds,
                          timeout=timeout),
        }

        done, pending = wait(futures, return_when=FIRST_COMPLETED)

        for f in done:
            result = f.result()
            if result is not None:
                for p in pending:
                    p.cancel()
                return result

    return None
```

---

## 7.3 Кодирование задачи поиска коллизий

Для поиска коллизии необходимо закодировать **две копии** хэш-функции:

```
Копия 1: M  → H(M)     (переменные с префиксом "")
Копия 2: M' → H(M')    (переменные с префиксом "prime_")
```

Условие коллизии:
```
H(M) = H(M')    и    M ≠ M'
```

```python
def encode_collision_search(hash_func, num_rounds) -> CNFBuilder:
    builder = CNFBuilder()

    # Кодирование первой копии
    M, state1 = encode_full_hash(builder, hash_func, num_rounds, prefix="")

    # Кодирование второй копии
    M_prime, state2 = encode_full_hash(builder, hash_func, num_rounds, prefix="prime_")

    # Условие: H(M) = H(M')
    for word_idx in range(len(state1)):
        for bit in range(32):
            encode_equal(builder, state1[word_idx][bit], state2[word_idx][bit])

    # Условие: M ≠ M' (хотя бы один бит различается)
    diff_vars = []
    for w in range(16):
        for bit in range(32):
            d = builder.var_mgr.new_var()
            encode_xor(builder, M[w][bit], M_prime[w][bit], d)
            diff_vars.append(d)
    builder.add_clause(diff_vars)  # хотя бы один diff_var = 1

    return builder
```

---

## 7.4 Оптимизации комбинированного метода

### 7.4.1 Symmetry Breaking

Добавление ограничений для устранения симметричных решений:

```python
# Лексикографическое упорядочение: M < M' (по первому различающемуся биту)
def add_symmetry_breaking(builder, M, M_prime):
    """M должно быть лексикографически меньше M'."""
    # Первый бит M[0][0] < M'[0][0]: если M'[0][0]=0, то M[0][0]=0
    # Реализуется через вспомогательные переменные
    ...
```

### 7.4.2 Фиксация входной разности

Вместо поиска произвольной коллизии, зафиксировать входную разность ΔM:

```python
def fix_message_difference(builder, M, M_prime, delta_M: list[int]):
    """Зафиксировать ΔM = M ⊕ M'."""
    for w in range(16):
        encode_xor_difference(builder, M[w], M_prime[w], delta_M[w])
```

### 7.4.3 Частичная фиксация состояния

Если дифференциальная характеристика определяет значения некоторых бит, зафиксировать их:

```python
def fix_known_bits(builder, conditions, var_map):
    """Зафиксировать биты, определённые дифференциальной характеристикой."""
    for cond in conditions:
        var = var_map[(cond.word, cond.round_num, cond.bit_pos)]
        if cond.condition == '0':
            builder.add_clause([-var])
        elif cond.condition == '1':
            builder.add_clause([var])
```

---

## 7.5 Верификация результатов

```python
class CollisionVerifier:
    """Верификация найденных коллизий."""

    def __init__(self, hash_func):
        self.hash_func = hash_func

    def verify(self, m1: bytes, m2: bytes) -> dict:
        h1 = self.hash_func.hash(m1)
        h2 = self.hash_func.hash(m2)

        return {
            "messages_differ": m1 != m2,
            "hashes_equal": h1 == h2,
            "collision_found": m1 != m2 and h1 == h2,
            "hash_value": h1.hex() if h1 == h2 else None,
            "hamming_distance_messages": bin(
                int.from_bytes(m1, 'big') ^ int.from_bytes(m2, 'big')
            ).count('1'),
        }
```

---

## 7.6 Структура файлов

```
src/combined/
├── sequential.py       # Последовательная стратегия
├── iterative.py        # Итеративная стратегия
├── hybrid.py           # Гибридная стратегия (параллельная)
├── collision_encoder.py # Кодирование задачи коллизий
├── verifier.py         # Верификация результатов
└── optimizations.py    # Symmetry breaking, фиксация разностей
```
