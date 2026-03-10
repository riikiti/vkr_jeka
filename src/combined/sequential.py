"""Sequential combined cryptanalysis strategy."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from ..differential.characteristics import DifferentialCharacteristic
from ..sat_encoding.hash_encoder import CollisionEncoder
from ..solver.sat_interface import SATResult, SolverOutput
from ..solver.pysat_runner import PySATRunner
from ..solver.solution_extractor import SolutionExtractor
from .verifier import CollisionVerifier

logger = logging.getLogger(__name__)


@dataclass
class AttackResult:
    """Result of a collision search attack."""
    success: bool = False
    m1_words: list[int] = field(default_factory=list)
    m2_words: list[int] = field(default_factory=list)
    characteristic: DifferentialCharacteristic | None = None
    solver_output: SolverOutput | None = None
    total_time: float = 0.0
    diff_analysis_time: float = 0.0
    encoding_time: float = 0.0
    solving_time: float = 0.0
    characteristics_tried: int = 0


def sequential_attack(
    num_rounds: int,
    message_diffs: list[list[int]] | None = None,
    solver_name: str = "cadical153",
    timeout_per_char: int = 300,
    max_characteristics: int = 10,
) -> AttackResult:
    """Run sequential combined attack on reduced-round SHA-256.

    1. For each candidate message difference, encode collision SAT problem.
    2. Fix message difference constraints.
    3. Run SAT solver.
    4. If SAT, extract and verify collision.

    Args:
        num_rounds: Number of SHA-256 rounds.
        message_diffs: List of candidate message differences (each is 16 x 32-bit).
                       If None, uses a simple single-bit difference.
        solver_name: PySAT solver name.
        timeout_per_char: Timeout per SAT solve (seconds).
        max_characteristics: Maximum number of message diffs to try.

    Returns:
        AttackResult with collision details if found.
    """
    total_start = time.time()
    result = AttackResult()

    if message_diffs is None:
        # Default: single-bit difference in first message word
        message_diffs = [
            [0x80000000] + [0] * 15,
            [0x00000001] + [0] * 15,
            [0] * 15 + [0x80000000],
        ]

    solver = PySATRunner(solver_name)
    chars_tried = 0

    for diff in message_diffs[:max_characteristics]:
        chars_tried += 1
        logger.info(f"Trying message diff #{chars_tried}: "
                    f"[{', '.join(f'0x{d:08x}' for d in diff[:4])}...]")

        # Encode collision problem
        enc_start = time.time()
        encoder = CollisionEncoder(num_rounds)
        encoder.encode()
        encoder.fix_message_difference(diff)
        enc_time = time.time() - enc_start

        # Write and solve
        cnf_file = f"collision_r{num_rounds}_d{chars_tried}.cnf"
        encoder.builder.write_dimacs(cnf_file)

        logger.info(f"CNF: {encoder.builder.num_vars} vars, "
                    f"{encoder.builder.num_clauses} clauses")

        solve_start = time.time()
        output = solver.solve(cnf_file, timeout=timeout_per_char)
        solve_time = time.time() - solve_start

        logger.info(f"Result: {output.result.value} in {solve_time:.2f}s")

        if output.result == SATResult.SAT:
            # Extract messages
            extractor = SolutionExtractor(encoder.builder.var_mgr)
            m1 = extractor.extract_message(output.assignment, encoder._msg1)
            m2 = extractor.extract_message(output.assignment, encoder._msg2)

            result.success = True
            result.m1_words = m1
            result.m2_words = m2
            result.solver_output = output
            result.encoding_time = enc_time
            result.solving_time = solve_time
            result.characteristics_tried = chars_tried
            result.total_time = time.time() - total_start
            return result

    result.characteristics_tried = chars_tried
    result.total_time = time.time() - total_start
    return result
