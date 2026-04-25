"""SAT solver runner using PySAT library."""

from __future__ import annotations

import threading
import time

from .sat_interface import SATSolverInterface, SATResult, SolverStats, SolverOutput


class PySATRunner(SATSolverInterface):
    """Run SAT solver through PySAT with threading-based timeout and cancellation.

    PySAT solvers (CaDiCaL, Glucose, MiniSAT) release the GIL during C-level
    solving, so threading is sufficient for timeout enforcement. Cancellation is
    handled via solver.interrupt(), which is immediate and reliable on all platforms.

    Supported solver names: 'cadical153', 'glucose4', 'minisat22'.
    """

    def __init__(self, solver_name: str = "cadical153"):
        self.solver_name = solver_name

    def solve(self, cnf_file: str, timeout: int = 3600,
              random_phase_vars: list[int] | None = None,
              seed: int = 42,
              cancel_event=None) -> SolverOutput:
        from pysat.formula import CNF
        formula = CNF(from_file=cnf_file)
        return self.solve_clauses(formula.clauses, formula.nv, timeout,
                                  random_phase_vars=random_phase_vars, seed=seed,
                                  cancel_event=cancel_event)

    def solve_clauses(self, clauses: list[list[int]], num_vars: int,
                      timeout: int = 3600,
                      random_phase_vars: list[int] | None = None,
                      seed: int = 42,
                      cancel_event=None) -> SolverOutput:
        import random as _random
        from pysat.solvers import Solver

        result: dict = {}
        exc_holder: list = [None]
        # Holds the live Solver instance so the main thread can call interrupt()
        solver_holder: list = [None]

        def _run() -> None:
            with Solver(name=self.solver_name, bootstrap_with=clauses) as solver:
                solver_holder[0] = solver
                try:
                    if random_phase_vars:
                        rng = _random.Random(seed)
                        phases = [v if rng.random() < 0.5 else -v
                                  for v in random_phase_vars]
                        solver.set_phases(phases)

                    t0_solve = time.time()
                    sat = solver.solve()
                    result["elapsed"] = time.time() - t0_solve
                    result["sat"] = sat

                    if sat:
                        result["model"] = solver.get_model()
                    else:
                        result["model"] = None

                    try:
                        acc = solver.accum_stats()
                        result["conflicts"]    = acc.get("conflicts", 0)
                        result["decisions"]    = acc.get("decisions", 0)
                        result["propagations"] = acc.get("propagations", 0)
                        result["restarts"]     = acc.get("restarts", 0)
                    except Exception:
                        pass
                    try:
                        result["learnt"] = solver.nof_clauses()
                    except Exception:
                        pass
                except Exception as exc:
                    exc_holder[0] = exc
                finally:
                    solver_holder[0] = None  # clear ref before solver context exits

        thread = threading.Thread(target=_run, daemon=True)
        t0 = time.time()
        thread.start()

        poll = 0.1  # 100 ms — fast enough for responsive cancellation
        remaining = float(timeout)
        while thread.is_alive() and remaining > 0:
            thread.join(timeout=min(poll, remaining))
            remaining = timeout - (time.time() - t0)
            if cancel_event is not None and cancel_event.is_set():
                break

        elapsed = time.time() - t0

        if thread.is_alive():
            # Interrupt the solver — immediate signal into C layer
            s = solver_holder[0]
            if s is not None:
                try:
                    s.interrupt()
                except Exception:
                    pass
            thread.join(timeout=5)

            cancelled = cancel_event is not None and cancel_event.is_set()
            res = SATResult.CANCELLED if cancelled else SATResult.TIMEOUT
            stats = SolverStats(result=res, solve_time=elapsed)
            return SolverOutput(result=res, assignment=None, stats=stats)

        if exc_holder[0] is not None:
            stats = SolverStats(result=SATResult.UNKNOWN, solve_time=elapsed)
            return SolverOutput(result=SATResult.UNKNOWN, assignment=None, stats=stats)

        if "sat" not in result:
            stats = SolverStats(result=SATResult.UNKNOWN, solve_time=elapsed)
            return SolverOutput(result=SATResult.UNKNOWN, assignment=None, stats=stats)

        sat = result["sat"]
        solve_elapsed = result.get("elapsed", elapsed)

        if sat:
            model = result["model"]
            assignment = {abs(l): l > 0 for l in model} if model else None
            res = SATResult.SAT
        else:
            assignment = None
            res = SATResult.UNSAT

        stats = SolverStats(
            result=res,
            solve_time=solve_elapsed,
            num_conflicts=result.get("conflicts", 0),
            num_decisions=result.get("decisions", 0),
            num_propagations=result.get("propagations", 0),
            num_restarts=result.get("restarts", 0),
            num_learnt_clauses=result.get("learnt", 0),
        )
        return SolverOutput(result=res, assignment=assignment, stats=stats)

    def name(self) -> str:
        return f"PySAT({self.solver_name})"


class IncrementalPySATRunner:
    """Incremental SAT runner: one solver instance kept alive across multiple solve calls.

    Differential constraints are added as clauses guarded by per-attempt activation
    literals, so learned clauses accumulate and benefit subsequent attempts.

    Usage:
        with IncrementalPySATRunner("cadical153", base_clauses) as runner:
            act = runner.new_activation_var()
            runner.add_activation_clauses(act, diff_clauses)
            output = runner.solve([act], timeout=60, ...)
    """

    def __init__(self, solver_name: str, base_clauses: list[list[int]]):
        from pysat.solvers import Solver
        self._solver_name = solver_name
        self._solver = Solver(name=solver_name, bootstrap_with=base_clauses)
        # Track the highest variable seen so we can allocate fresh activation vars
        self._max_var = max(
            (abs(lit) for clause in base_clauses for lit in clause),
            default=0,
        )

    def new_activation_var(self) -> int:
        """Allocate a fresh variable ID above all existing ones."""
        self._max_var += 1
        return self._max_var

    def add_activation_clauses(self, act_var: int, diff_clauses: list[list[int]]) -> None:
        """Add diff_clauses guarded by act_var.

        Each clause c becomes (¬act_var ∨ c), so it only fires when
        act_var is assumed True during solve().
        """
        for clause in diff_clauses:
            self._solver.add_clause([-act_var] + clause)

    def solve(
        self,
        assumptions: list[int],
        timeout: int = 3600,
        random_phase_vars: list[int] | None = None,
        seed: int = 42,
        cancel_event=None,
    ) -> SolverOutput:
        """Solve under assumptions with a threading-based timeout.

        Learned clauses from this call persist in the solver for all future calls.
        """
        import threading
        import random as _random

        if random_phase_vars:
            rng = _random.Random(seed)
            phases = [v if rng.random() < 0.5 else -v for v in random_phase_vars]
            self._solver.set_phases(phases)

        result_holder: list = [None]
        exc_holder: list = [None]

        def _run():
            try:
                result_holder[0] = self._solver.solve(assumptions=assumptions)
            except Exception as exc:
                exc_holder[0] = exc

        thread = threading.Thread(target=_run, daemon=True)
        t0 = time.time()
        thread.start()

        poll = 0.3
        remaining = float(timeout)
        while thread.is_alive() and remaining > 0:
            thread.join(timeout=min(poll, remaining))
            remaining = timeout - (time.time() - t0)
            if cancel_event is not None and cancel_event.is_set():
                break

        elapsed = time.time() - t0

        if thread.is_alive():
            # Interrupt the solver; it will unblock the thread
            try:
                self._solver.interrupt()
            except Exception:
                pass
            thread.join(timeout=5)
            try:
                self._solver.clear_interrupt()
            except Exception:
                pass
            cancelled = cancel_event is not None and cancel_event.is_set()
            res = SATResult.CANCELLED if cancelled else SATResult.TIMEOUT
            stats = SolverStats(result=res, solve_time=elapsed)
            return SolverOutput(result=res, assignment=None, stats=stats)

        if exc_holder[0] is not None:
            stats = SolverStats(result=SATResult.UNKNOWN, solve_time=elapsed)
            return SolverOutput(result=SATResult.UNKNOWN, assignment=None, stats=stats)

        sat = result_holder[0]
        # sat is None when the solver was interrupted before returning
        if sat is None:
            try:
                self._solver.clear_interrupt()
            except Exception:
                pass
            stats = SolverStats(result=SATResult.TIMEOUT, solve_time=elapsed)
            return SolverOutput(result=SATResult.TIMEOUT, assignment=None, stats=stats)

        if sat:
            model = self._solver.get_model()
            assignment = {abs(l): l > 0 for l in model} if model else None
            result = SATResult.SAT
        else:
            assignment = None
            result = SATResult.UNSAT

        try:
            acc = self._solver.accum_stats()
            nc = acc.get("conflicts", 0)
            nd = acc.get("decisions", 0)
            np_ = acc.get("propagations", 0)
            nr = acc.get("restarts", 0)
        except Exception:
            nc = nd = np_ = nr = 0

        # nof_clauses() for incremental solver returns total clauses accumulated
        # across all attempts (base + activation + ALL learned so far).
        # This is intentionally cumulative — it shows learned clause growth.
        nl = 0
        try:
            nl = self._solver.nof_clauses()
        except Exception:
            pass

        stats = SolverStats(
            result=result,
            solve_time=elapsed,
            num_conflicts=nc,
            num_decisions=nd,
            num_propagations=np_,
            num_restarts=nr,
            num_learnt_clauses=nl,
        )
        return SolverOutput(result=result, assignment=assignment, stats=stats)

    def close(self) -> None:
        try:
            self._solver.delete()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def name(self) -> str:
        return f"IncrementalPySAT({self._solver_name})"
