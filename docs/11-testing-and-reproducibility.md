# 11. Тестирование и воспроизводимость

## 11.1 Стратегия тестирования

### Уровни тестирования

| Уровень | Охват | Инструмент |
|---------|-------|-----------|
| **Unit** | Отдельные функции и классы | pytest |
| **Integration** | Взаимодействие модулей (diff → SAT → solver) | pytest |
| **End-to-End** | Полный пайплайн криптоанализа | pytest + скрипты |
| **Regression** | Проверка на известных результатах (MD5, SHA-1) | фиксированные тесты |

---

## 11.2 Unit-тесты

### Тесты хэш-функций

```python
# tests/test_hash_functions/test_sha256.py
import hashlib

class TestSHA256Reduced:
    def test_full_rounds_matches_reference(self):
        """Полный SHA-256 (64 раунда) совпадает с hashlib."""
        sha = SHA256Reduced(num_rounds=64)
        msg = b"abc"
        assert sha.hash(msg).hex() == hashlib.sha256(msg).hexdigest()

    def test_nist_vectors(self):
        """Проверка на тестовых векторах NIST."""
        vectors = [
            (b"", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
            (b"abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
        ]
        sha = SHA256Reduced(num_rounds=64)
        for msg, expected in vectors:
            assert sha.hash(msg).hex() == expected

    def test_reduced_rounds_deterministic(self):
        """Уменьшенный вариант детерминирован."""
        sha16 = SHA256Reduced(num_rounds=16)
        msg = b"test message"
        assert sha16.hash(msg) == sha16.hash(msg)

    def test_ch_function(self):
        """Проверка Ch(x, y, z) = (x & y) ^ (~x & z)."""
        sha = SHA256Reduced()
        assert sha._ch(0xFFFFFFFF, 0xAAAAAAAA, 0x55555555) == 0xAAAAAAAA
        assert sha._ch(0x00000000, 0xAAAAAAAA, 0x55555555) == 0x55555555

    def test_maj_function(self):
        """Проверка Maj(x, y, z)."""
        sha = SHA256Reduced()
        assert sha._maj(0xFF, 0xFF, 0x00) == 0xFF
        assert sha._maj(0xFF, 0x00, 0x00) == 0x00
```

### Тесты дифференциального анализа

```python
# tests/test_differential/test_propagation.py

class TestDifferentialPropagation:
    def test_xor_propagation(self):
        """XOR: Δ(x ⊕ y) = Δx ⊕ Δy."""
        delta, prob = propagate_xor(0x80000000, 0x00000001)
        assert delta == 0x80000001
        assert prob == 1.0

    def test_rotation_propagation(self):
        """Ротация: Δ(x <<< r) = Δx <<< r."""
        delta, prob = propagate_rotation(0x80000000, 5)
        assert delta == 0x00000010
        assert prob == 1.0

    def test_modadd_zero_diff(self):
        """Mod add: нулевая разность → нулевой выход."""
        prob = modadd_xor_differential(0, 0, 0)
        assert prob == 1.0

    def test_modadd_impossible_diff(self):
        """Mod add: невозможный дифференциал → вероятность 0."""
        # Δx=1, Δy=0, Δz=0 невозможен (LSB: 1+0 не может дать 0)
        prob = modadd_xor_differential(1, 0, 0)
        assert prob == 0.0

    def test_modadd_known_probability(self):
        """Mod add: известная вероятность для простого случая."""
        # Δx=0x80000000, Δy=0, Δz=0x80000000: вероятность 1
        prob = modadd_xor_differential(0x80000000, 0, 0x80000000)
        assert prob == 1.0
```

### Тесты SAT-кодирования

```python
# tests/test_sat_encoding/test_bit_constraints.py
from pysat.solvers import Solver

class TestBitConstraints:
    def test_xor_encoding(self):
        """XOR-кодирование: все 4 комбинации входов дают правильный результат."""
        for a_val in [True, False]:
            for b_val in [True, False]:
                builder = CNFBuilder()
                a, b, c = 1, 2, 3
                builder.var_mgr._next_var = 4
                encode_xor(builder, a, b, c)

                with Solver(bootstrap_with=builder.clauses) as s:
                    assumptions = [a if a_val else -a, b if b_val else -b]
                    assert s.solve(assumptions=assumptions)
                    model = {abs(l): l > 0 for l in s.get_model()}
                    assert model[3] == (a_val ^ b_val)

    def test_modular_add_encoding(self):
        """Модульное сложение: проверка на конкретных значениях."""
        builder = CNFBuilder()
        x = builder.var_mgr.new_word("x")
        y = builder.var_mgr.new_word("y")
        z = builder.var_mgr.new_word("z")
        encode_modular_add(builder, x, y, z)

        # Фиксируем x=5, y=3, проверяем z=8
        fix_word_value(builder, x, 5)
        fix_word_value(builder, y, 3)

        with Solver(bootstrap_with=builder.clauses) as s:
            assert s.solve()
            model = {abs(l): l > 0 for l in s.get_model()}
            z_val = extract_word_value(model, z)
            assert z_val == 8
```

---

## 11.3 Integration-тесты

```python
# tests/test_combined/test_pipeline.py

class TestCombinedPipeline:
    def test_md5_reduced_collision(self):
        """Поиск коллизии для MD5 с малым числом раундов (должен найти)."""
        result = sequential_attack(
            hash_func=MD5Reduced(num_rounds=16),
            num_rounds=16,
            p_min=2**-20,
            max_characteristics=10,
            timeout=60
        )
        assert result is not None
        assert result.m1 != result.m2
        assert MD5Reduced(16).hash(result.m1) == MD5Reduced(16).hash(result.m2)

    def test_sha256_8_rounds(self):
        """Комбинированная атака на 8-раундовый SHA-256."""
        result = sequential_attack(
            hash_func=SHA256Reduced(num_rounds=8),
            num_rounds=8,
            p_min=2**-15,
            max_characteristics=20,
            timeout=120
        )
        # Может не найти за 120с, но не должен упасть с ошибкой
        if result is not None:
            verifier = CollisionVerifier(SHA256Reduced(8))
            assert verifier.verify(result.m1, result.m2)["collision_found"]
```

---

## 11.4 Воспроизводимость экспериментов

### Фиксация случайности

```python
import random
import numpy as np

def set_global_seed(seed: int):
    """Фиксация всех источников случайности."""
    random.seed(seed)
    np.random.seed(seed)
```

### Сохранение артефактов

Для каждого запуска эксперимента сохраняются:

| Артефакт | Формат | Назначение |
|----------|--------|-----------|
| Конфигурация | YAML | Параметры запуска |
| CNF-файлы | DIMACS | Точный вход SAT-решателя |
| Логи решателя | текст | Детали работы решателя |
| Характеристики | JSON | Найденные дифф. характеристики |
| Результаты | JSON + CSV | Метрики и коллизии |
| Окружение | `pip freeze`, `uname` | Воспроизведение среды |

### Контрольные суммы

```python
import hashlib

def compute_artifact_hash(filepath: str) -> str:
    """SHA-256 контрольная сумма артефакта."""
    with open(filepath, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()
```

### Воспроизведение эксперимента

```bash
# 1. Клонировать репозиторий
git clone <repo-url> && cd hash-cryptanalysis
git checkout <commit-hash>

# 2. Установить зависимости
pip install -r requirements.txt

# 3. Запустить эксперимент с той же конфигурацией
python experiments/scripts/run_experiment.py --config experiments/configs/exp3_combined.yaml --seed 42
```

---

## 11.5 Критерии оценки качества (для ВКР)

| Критерий | Описание | Порог |
|----------|----------|-------|
| Покрытие кода тестами | Unit-тесты покрывают критические модули | ≥ 80% |
| Корректность хэш-реализации | Совпадение с эталонными реализациями | 100% |
| Корректность SAT-кодирования | Прохождение всех unit-тестов | 100% |
| Воспроизводимость | Повторный запуск даёт тот же результат | Детерминировано при фикс. seed |
| Документация | Все модули задокументированы | Полная |
