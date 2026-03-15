"""SAT solver runner using PySAT library."""

from __future__ import annotations

import multiprocessing
import time

from .sat_interface import SATSolverInterface, SATResult, SolverStats, SolverOutput


def _solve_in_process(solver_name: str, clauses: list[list[int]],
                      result_dict: dict,
                      random_phase_vars: list[int] | None = None,
                      seed: int = 42) -> None:
    """Target function for the solver subprocess.

    Writes results into the shared manager dict so the parent can read them.
    """
    import random as _random
    from pysat.solvers import Solver

    with Solver(name=solver_name, bootstrap_with=clauses) as solver:
        # Set random initial phases for specified variables so the solver
        # doesn't converge to a trivial all-true / all-false solution.
        if random_phase_vars:
            rng = _random.Random(seed)
            phases = [v if rng.random() < 0.5 else -v for v in random_phase_vars]
            solver.set_phases(phases)

        start = time.time()
        sat = solver.solve()
        elapsed = time.time() - start

        result_dict["elapsed"] = elapsed
        result_dict["sat"] = sat

        if sat:
            model = solver.get_model()
            result_dict["model"] = model
        else:
            result_dict["model"] = None

        # Collect stats — use accum_stats() which works for all solvers
        # (nof_conflicts/nof_decisions are not available on CaDiCaL)
        try:
            acc = solver.accum_stats()
            result_dict["conflicts"] = acc.get("conflicts", 0)
            result_dict["decisions"] = acc.get("decisions", 0)
            result_dict["propagations"] = acc.get("propagations", 0)
            result_dict["restarts"] = acc.get("restarts", 0)
        except Exception:
            pass
        try:
            result_dict["learnt"] = solver.nof_clauses()
        except Exception:
            pass


class PySATRunner(SATSolverInterface):
    """Run SAT solver through PySAT (in a subprocess with enforced timeout).

    Supported solver names: 'cadical153', 'glucose4', 'minisat22',
    'lingeling', 'maplesat'.

    The solver runs in a separate process so it can be killed on timeout
    even if the C extension holds the GIL.
    """

    def __init__(self, solver_name: str = "cadical153"):
        self.solver_name = solver_name

    def solve(self, cnf_file: str, timeout: int = 3600,
              random_phase_vars: list[int] | None = None,
              seed: int = 42) -> SolverOutput:
        from pysat.formula import CNF
        formula = CNF(from_file=cnf_file)
        return self.solve_clauses(formula.clauses, formula.nv, timeout,
                                  random_phase_vars=random_phase_vars, seed=seed)

    def solve_clauses(self, clauses: list[list[int]], num_vars: int,
                      timeout: int = 3600,
                      random_phase_vars: list[int] | None = None,
                      seed: int = 42) -> SolverOutput:
        manager = multiprocessing.Manager()
        result_dict = manager.dict()

        proc = multiprocessing.Process(
            target=_solve_in_process,
            args=(self.solver_name, clauses, result_dict,
                  random_phase_vars, seed),
            daemon=True,
        )

        start = time.time()
        proc.start()
        proc.join(timeout=timeout)
        elapsed = time.time() - start

        if proc.is_alive():
            # Timeout — kill the subprocess
            proc.terminate()
            proc.join(timeout=5)
            if proc.is_alive():
                proc.kill()
                proc.join(timeout=3)

            stats = SolverStats(
                result=SATResult.TIMEOUT,
                solve_time=elapsed,
            )
            return SolverOutput(result=SATResult.TIMEOUT, assignment=None, stats=stats)

        # Process finished — read results
        if "sat" not in result_dict:
            # Process crashed without writing results
            stats = SolverStats(result=SATResult.UNKNOWN, solve_time=elapsed)
            return SolverOutput(result=SATResult.UNKNOWN, assignment=None, stats=stats)

        sat = result_dict["sat"]
        solve_elapsed = result_dict.get("elapsed", elapsed)

        if sat:
            model = result_dict["model"]
            assignment = {abs(l): l > 0 for l in model} if model else None
            result = SATResult.SAT
        else:
            assignment = None
            result = SATResult.UNSAT

        stats = SolverStats(
            result=result,
            solve_time=solve_elapsed,
            num_conflicts=result_dict.get("conflicts", 0),
            num_decisions=result_dict.get("decisions", 0),
            num_propagations=result_dict.get("propagations", 0),
            num_restarts=result_dict.get("restarts", 0),
            num_learnt_clauses=result_dict.get("learnt", 0),
        )

        return SolverOutput(result=result, assignment=assignment, stats=stats)

    def name(self) -> str:
        return f"PySAT({self.solver_name})"
