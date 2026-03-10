"""SAT solver runner using PySAT library."""

from __future__ import annotations

import time

from .sat_interface import SATSolverInterface, SATResult, SolverStats, SolverOutput


class PySATRunner(SATSolverInterface):
    """Run SAT solver through PySAT (in-process).

    Supported solver names: 'cadical153', 'glucose4', 'minisat22',
    'lingeling', 'maplesat'.

    Note: CryptoMiniSat (cms) requires the 'pycryptosat' package separately.
    If available, use solver_name='cms' through this interface.
    """

    def __init__(self, solver_name: str = "cadical153"):
        self.solver_name = solver_name

    def solve(self, cnf_file: str, timeout: int = 3600) -> SolverOutput:
        from pysat.formula import CNF
        formula = CNF(from_file=cnf_file)
        return self.solve_clauses(formula.clauses, formula.nv, timeout)

    def solve_clauses(self, clauses: list[list[int]], num_vars: int,
                      timeout: int = 3600) -> SolverOutput:
        from pysat.solvers import Solver

        with Solver(name=self.solver_name, bootstrap_with=clauses) as solver:
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
            )

        return SolverOutput(result=result, assignment=assignment, stats=stats)

    def name(self) -> str:
        return f"PySAT({self.solver_name})"
