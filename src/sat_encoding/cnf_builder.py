"""CNF formula builder and variable manager for SAT encoding."""

from __future__ import annotations


class VariableManager:
    """Manages boolean variable allocation for SAT encoding."""

    def __init__(self):
        self._next_var = 1
        self._names: dict[str, int] = {}
        self._reverse: dict[int, str] = {}

    def new_var(self, name: str = "") -> int:
        var = self._next_var
        self._next_var += 1
        if name:
            self._names[name] = var
            self._reverse[var] = name
        return var

    def new_word(self, name: str, bits: int = 32) -> list[int]:
        """Allocate a word of `bits` boolean variables (LSB first)."""
        return [self.new_var(f"{name}[{i}]") for i in range(bits)]

    def get_var(self, name: str) -> int | None:
        return self._names.get(name)

    def get_name(self, var: int) -> str | None:
        return self._reverse.get(var)

    @property
    def num_vars(self) -> int:
        return self._next_var - 1


class CNFBuilder:
    """Builds a CNF formula clause by clause."""

    def __init__(self):
        self.var_mgr = VariableManager()
        self.clauses: list[list[int]] = []

    def add_clause(self, clause: list[int]) -> None:
        self.clauses.append(clause)

    def add_clauses(self, clauses: list[list[int]]) -> None:
        for c in clauses:
            self.clauses.append(c)

    def fix_true(self, var: int) -> None:
        """Fix variable to True (unit clause)."""
        self.add_clause([var])

    def fix_false(self, var: int) -> None:
        """Fix variable to False (unit clause)."""
        self.add_clause([-var])

    def fix_word_value(self, word: list[int], value: int) -> None:
        """Fix a word to a constant value."""
        for i, var in enumerate(word):
            if (value >> i) & 1:
                self.fix_true(var)
            else:
                self.fix_false(var)

    @property
    def num_clauses(self) -> int:
        return len(self.clauses)

    @property
    def num_vars(self) -> int:
        return self.var_mgr.num_vars

    def to_dimacs(self) -> str:
        """Export to DIMACS CNF format."""
        lines = [f"p cnf {self.num_vars} {self.num_clauses}"]
        for clause in self.clauses:
            lines.append(" ".join(str(l) for l in clause) + " 0")
        return "\n".join(lines)

    def write_dimacs(self, filename: str) -> None:
        with open(filename, 'w') as f:
            f.write(self.to_dimacs())

    def stats(self) -> dict:
        """Return statistics about the formula."""
        return {
            "num_vars": self.num_vars,
            "num_clauses": self.num_clauses,
            "clause_lengths": {
                k: sum(1 for c in self.clauses if len(c) == k)
                for k in sorted(set(len(c) for c in self.clauses))
            },
        }
