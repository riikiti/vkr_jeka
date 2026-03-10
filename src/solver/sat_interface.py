"""Abstract SAT solver interface and data structures."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum


class SATResult(Enum):
    SAT = "SATISFIABLE"
    UNSAT = "UNSATISFIABLE"
    TIMEOUT = "TIMEOUT"
    UNKNOWN = "UNKNOWN"


@dataclass
class SolverStats:
    result: SATResult = SATResult.UNKNOWN
    solve_time: float = 0.0
    num_conflicts: int = 0
    num_decisions: int = 0
    num_propagations: int = 0
    num_restarts: int = 0
    num_learnt_clauses: int = 0
    peak_memory_mb: float = 0.0

    def to_dict(self) -> dict:
        return {
            "result": self.result.value,
            "solve_time": self.solve_time,
            "num_conflicts": self.num_conflicts,
            "num_decisions": self.num_decisions,
            "num_propagations": self.num_propagations,
            "num_restarts": self.num_restarts,
            "num_learnt_clauses": self.num_learnt_clauses,
            "peak_memory_mb": self.peak_memory_mb,
        }


@dataclass
class SolverOutput:
    result: SATResult
    assignment: dict[int, bool] | None = None
    stats: SolverStats = field(default_factory=SolverStats)

    def get_word_value(self, var_ids: list[int]) -> int:
        """Extract a 32-bit word value from SAT assignment (LSB-first var list)."""
        if self.assignment is None:
            raise ValueError("No assignment (UNSAT or timeout)")
        val = 0
        for i, vid in enumerate(var_ids):
            if self.assignment.get(vid, False):
                val |= 1 << i
        return val


class SATSolverInterface(ABC):
    """Unified SAT solver interface."""

    @abstractmethod
    def solve(self, cnf_file: str, timeout: int = 3600) -> SolverOutput:
        pass

    @abstractmethod
    def solve_clauses(self, clauses: list[list[int]], num_vars: int,
                      timeout: int = 3600) -> SolverOutput:
        """Solve from in-memory clauses."""
        pass

    @abstractmethod
    def name(self) -> str:
        pass
