# 6. Интеграция SAT-решателей

## 6.1 Назначение модуля

Модуль обеспечивает:
- Унифицированный интерфейс для различных SAT-решателей.
- Запуск решателя, управление таймаутами и ресурсами.
- Парсинг результатов (SAT/UNSAT, назначение переменных).
- Сбор статистики (время, конфликты, решения).

**Расположение:** `src/solver/`

---

## 6.2 Поддерживаемые SAT-решатели

| Решатель | Особенности | Применение |
|----------|-------------|-----------|
| **CryptoMiniSat** | Встроенная поддержка XOR-клозов, Gauss elimination | Основной для криптоанализа |
| **MiniSAT** | Классический CDCL, стабильный | Базовый бенчмарк |
| **Glucose** | Агрессивное удаление learnt clauses | Для задач с большим числом клозов |
| **Cadical** | Современный, высокопроизводительный | Альтернатива |

### CryptoMiniSat — рекомендуемый выбор

CryptoMiniSat имеет критическое преимущество для криптографических задач: нативная поддержка XOR-клозов через Gaussian elimination. Это позволяет:
- Представлять XOR-ограничения одним XOR-клозом вместо экспоненциального числа обычных клозов.
- Ускорять unit propagation для линейных ограничений.

---

## 6.3 Архитектура интерфейса

### Абстрактный интерфейс

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum

class SATResult(Enum):
    SAT = "SATISFIABLE"
    UNSAT = "UNSATISFIABLE"
    TIMEOUT = "TIMEOUT"
    UNKNOWN = "UNKNOWN"

@dataclass
class SolverStats:
    result: SATResult
    solve_time: float           # секунды
    num_conflicts: int
    num_decisions: int
    num_propagations: int
    num_restarts: int
    num_learnt_clauses: int
    peak_memory_mb: float

@dataclass
class SolverOutput:
    result: SATResult
    assignment: dict[int, bool] | None  # var_id → True/False
    stats: SolverStats

class SATSolverInterface(ABC):
    """Унифицированный интерфейс SAT-решателя."""

    @abstractmethod
    def solve(self, cnf_file: str, timeout: int = 3600) -> SolverOutput:
        """Решить SAT-задачу из файла DIMACS CNF."""
        pass

    @abstractmethod
    def solve_with_assumptions(self, cnf_file: str,
                                assumptions: list[int],
                                timeout: int = 3600) -> SolverOutput:
        """Решить с дополнительными предположениями (unit assumptions)."""
        pass

    @abstractmethod
    def name(self) -> str:
        pass
```

### Реализация для CryptoMiniSat

```python
import subprocess
import re

class CryptoMiniSatRunner(SATSolverInterface):

    def __init__(self, binary_path: str = "cryptominisat5"):
        self.binary = binary_path

    def solve(self, cnf_file: str, timeout: int = 3600) -> SolverOutput:
        cmd = [self.binary, "--verb", "1", "--maxtime", str(timeout), cnf_file]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout+10)
        return self._parse_output(result.stdout, result.stderr)

    def _parse_output(self, stdout: str, stderr: str) -> SolverOutput:
        # Определить результат
        if "s SATISFIABLE" in stdout:
            result = SATResult.SAT
            assignment = self._parse_assignment(stdout)
        elif "s UNSATISFIABLE" in stdout:
            result = SATResult.UNSAT
            assignment = None
        else:
            result = SATResult.TIMEOUT
            assignment = None

        stats = self._parse_stats(stderr)
        return SolverOutput(result=result, assignment=assignment, stats=stats)

    def _parse_assignment(self, stdout: str) -> dict[int, bool]:
        assignment = {}
        for line in stdout.split('\n'):
            if line.startswith('v '):
                for lit in line[2:].split():
                    val = int(lit)
                    if val != 0:
                        assignment[abs(val)] = (val > 0)
        return assignment

    def _parse_stats(self, stderr: str) -> SolverStats:
        """Парсинг статистики из stderr CryptoMiniSat."""
        # Извлечение метрик из вывода решателя
        stats = SolverStats(
            result=SATResult.UNKNOWN,
            solve_time=self._extract_float(stderr, r"Total time\s*:\s*([\d.]+)"),
            num_conflicts=self._extract_int(stderr, r"conflicts\s*:\s*(\d+)"),
            num_decisions=self._extract_int(stderr, r"decisions\s*:\s*(\d+)"),
            num_propagations=self._extract_int(stderr, r"propagations\s*:\s*(\d+)"),
            num_restarts=self._extract_int(stderr, r"restarts\s*:\s*(\d+)"),
            num_learnt_clauses=self._extract_int(stderr, r"learnt.*?:\s*(\d+)"),
            peak_memory_mb=self._extract_float(stderr, r"Memory used\s*:\s*([\d.]+)")
        )
        return stats

    def name(self) -> str:
        return "CryptoMiniSat"
```

### Реализация через PySAT (in-process)

```python
from pysat.solvers import Solver

class PySATRunner(SATSolverInterface):
    """Запуск SAT-решателя через PySAT (в одном процессе)."""

    def __init__(self, solver_name: str = "cms"):
        # cms = CryptoMiniSat, glucose4, minisat22, cadical153
        self.solver_name = solver_name

    def solve(self, cnf_file: str, timeout: int = 3600) -> SolverOutput:
        from pysat.formula import CNF
        import time

        formula = CNF(from_file=cnf_file)

        with Solver(name=self.solver_name, bootstrap_with=formula) as solver:
            start = time.time()
            sat = solver.solve()
            elapsed = time.time() - start

            if sat:
                model = solver.get_model()
                assignment = {abs(l): l > 0 for l in model}
                result = SATResult.SAT
            else:
                assignment = None
                result = SATResult.UNSAT

            stats = SolverStats(
                result=result,
                solve_time=elapsed,
                num_conflicts=solver.nof_conflicts(),
                num_decisions=solver.nof_decisions(),
                num_propagations=solver.nof_propagations(),
                num_restarts=solver.nof_restarts(),
                num_learnt_clauses=solver.nof_clauses(),
                peak_memory_mb=0.0
            )
            return SolverOutput(result=result, assignment=assignment, stats=stats)
```

---

## 6.4 Инкрементальный режим

Для комбинированного метода важен **инкрементальный режим**: добавление новых клозов без перезапуска решателя.

```python
class IncrementalSolver:
    """Инкрементальный SAT-решатель для итеративного комбинированного метода."""

    def __init__(self, solver_name: str = "cms"):
        self.solver = Solver(name=solver_name)
        self._clause_count = 0

    def add_base_formula(self, cnf_file: str):
        """Загрузить базовую CNF (кодирование хэш-функции)."""
        formula = CNF(from_file=cnf_file)
        for clause in formula.clauses:
            self.solver.add_clause(clause)
            self._clause_count += 1

    def add_differential_constraints(self, clauses: list[list[int]]):
        """Добавить дифференциальные ограничения."""
        for clause in clauses:
            self.solver.add_clause(clause)
            self._clause_count += 1

    def solve_with_assumptions(self, assumptions: list[int]) -> SolverOutput:
        """Решить с assumptions (откатываемые ограничения)."""
        sat = self.solver.solve(assumptions=assumptions)
        if sat:
            model = self.solver.get_model()
            return SolverOutput(SATResult.SAT, {abs(l): l > 0 for l in model}, ...)
        return SolverOutput(SATResult.UNSAT, None, ...)
```

---

## 6.5 Извлечение решений

### Из назначения SAT → пара сообщений

```python
class SolutionExtractor:
    """Извлечение криптографических данных из SAT-решения."""

    def __init__(self, var_map: dict):
        self.var_map = var_map  # отображение имён → переменных

    def extract_message(self, assignment: dict[int, bool], prefix: str = "M") -> bytes:
        """Извлечь 512-битное сообщение."""
        words = []
        for w in range(16):
            word_val = 0
            for bit in range(32):
                var = self.var_map[f"{prefix}_W{w}[{bit}]"]
                if assignment.get(var, False):
                    word_val |= (1 << bit)
            words.append(word_val)
        return b''.join(w.to_bytes(4, 'big') for w in words)

    def extract_collision_pair(self, assignment):
        """Извлечь пару сообщений (M, M') для коллизии."""
        m1 = self.extract_message(assignment, prefix="M")
        m2 = self.extract_message(assignment, prefix="M_prime")
        return m1, m2
```

---

## 6.6 Структура файлов модуля

```
src/solver/
├── sat_interface.py        # Абстрактный интерфейс SATSolverInterface
├── cryptominisat_runner.py # Обёртка для CryptoMiniSat
├── pysat_runner.py         # Обёртка через PySAT
├── incremental.py          # Инкрементальный режим
├── solution_extractor.py   # Извлечение решений
└── stats_collector.py      # Сбор и агрегация статистики
```
