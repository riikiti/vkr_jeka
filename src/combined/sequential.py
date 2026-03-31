"""Sequential combined cryptanalysis strategy."""

from __future__ import annotations

import logging
import os
import random
import tempfile
import time
from dataclasses import dataclass, field

from ..differential.characteristics import DifferentialCharacteristic
from ..sat_encoding.hash_encoder import CollisionEncoder
from ..solver.sat_interface import SATResult, SolverOutput
from ..solver.pysat_runner import PySATRunner
from ..solver.solution_extractor import SolutionExtractor
from .verifier import CollisionVerifier

logger = logging.getLogger(__name__)


def generate_message_diffs(count: int, seed: int = 42) -> list[list[int]]:
    """Generate a list of message differences ordered by expected difficulty.

    Strategy:
        1. Single-bit MSB diffs in each word (best — no carry propagation)
        2. Single-bit LSB diffs in each word
        3. Other single-bit diffs (random bit positions)
        4. Two-bit diffs (random)
        5. Multi-word single-bit diffs

    Args:
        count: How many differences to generate.
        seed: Random seed for reproducibility.

    Returns:
        List of message differences (each is 16 x 32-bit words).
    """
    diffs: list[list[int]] = []

    # Phase 1: MSB (bit 31) in each of 16 words — best for mod-add (no carry)
    for w in range(16):
        d = [0] * 16
        d[w] = 0x80000000
        diffs.append(d)
        if len(diffs) >= count:
            return diffs

    # Phase 2: LSB (bit 0) in each of 16 words
    for w in range(16):
        d = [0] * 16
        d[w] = 0x00000001
        diffs.append(d)
        if len(diffs) >= count:
            return diffs

    # Phase 3: Random single-bit diffs (other bit positions)
    rng = random.Random(seed)
    seen = {(w, b) for w in range(16) for b in (0, 31)}
    while len(diffs) < min(count, 32 + 512):
        w = rng.randint(0, 15)
        b = rng.randint(1, 30)
        if (w, b) in seen:
            continue
        seen.add((w, b))
        d = [0] * 16
        d[w] = 1 << b
        diffs.append(d)
        if len(diffs) >= count:
            return diffs

    # Phase 4: Two-bit diffs in same word
    for _ in range(count - len(diffs)):
        w = rng.randint(0, 15)
        b1 = rng.randint(0, 31)
        b2 = rng.randint(0, 31)
        while b2 == b1:
            b2 = rng.randint(0, 31)
        d = [0] * 16
        d[w] = (1 << b1) | (1 << b2)
        diffs.append(d)
        if len(diffs) >= count:
            return diffs

    return diffs[:count]


@dataclass
class AttemptInfo:
    """Info about a single SAT-solving attempt."""
    diff: list[int] = field(default_factory=list)
    result: str = ""        # "SAT", "UNSAT", "TIMEOUT", "CANCELLED", "ERROR"
    solve_time: float = 0.0
    encoding_time: float = 0.0
    num_vars: int = 0
    num_clauses: int = 0
    num_conflicts: int = 0
    num_decisions: int = 0
    num_propagations: int = 0
    num_restarts: int = 0
    num_learnt_clauses: int = 0


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
    attempts: list[AttemptInfo] = field(default_factory=list)


def sequential_attack(
    num_rounds: int,
    message_diffs: list[list[int]] | None = None,
    solver_name: str = "cadical153",
    timeout_per_char: int = 300,
    max_characteristics: int = 10,
    hash_function: str = "sha256",
    cancel_event=None,
) -> AttackResult:
    """Run sequential combined attack on a reduced-round hash function.

    1. For each candidate message difference, encode collision SAT problem.
    2. Fix message difference constraints.
    3. Run SAT solver.
    4. If SAT, extract and verify collision.

    Args:
        num_rounds: Number of hash function rounds/steps.
        message_diffs: List of candidate message differences (each is 16 x 32-bit).
                       If None, uses a simple single-bit difference.
        solver_name: PySAT solver name.
        timeout_per_char: Timeout per SAT solve (seconds).
        max_characteristics: Maximum number of message diffs to try.
        hash_function: Hash function name ('sha256', 'md5', 'md4').

    Returns:
        AttackResult with collision details if found.
    """
    total_start = time.time()
    result = AttackResult()

    if message_diffs is None:
        message_diffs = generate_message_diffs(max_characteristics)

    solver = PySATRunner(solver_name)
    chars_tried = 0

    for diff in message_diffs[:max_characteristics]:
        if cancel_event is not None and cancel_event.is_set():
            logger.info("Cancelled by user")
            break

        chars_tried += 1
        hw = sum(bin(w & 0xFFFFFFFF).count('1') for w in diff)
        logger.info(f"Trying message diff #{chars_tried} (HW={hw}): "
                    f"[{', '.join(f'0x{d:08x}' for d in diff[:4])}...]")

        # Encode collision problem
        enc_start = time.time()
        encoder = CollisionEncoder(num_rounds, hash_function=hash_function)
        encoder.encode()
        encoder.fix_message_difference(diff)
        enc_time = time.time() - enc_start

        # Collect message variable IDs for random phase initialization
        msg_var_ids = [v for word in encoder._msg1 for v in word] + \
                      [v for word in encoder._msg2 for v in word]

        # Write and solve (unique temp file to avoid race conditions)
        fd, cnf_file = tempfile.mkstemp(
            suffix='.cnf', prefix=f'col_r{num_rounds}_d{chars_tried}_')
        os.close(fd)
        encoder.builder.write_dimacs(cnf_file)

        logger.info(f"CNF: {encoder.builder.num_vars} vars, "
                    f"{encoder.builder.num_clauses} clauses")

        cnf_vars = encoder.builder.num_vars
        cnf_clauses = encoder.builder.num_clauses

        solve_start = time.time()
        solve_seed = int(time.time() * 1000) ^ chars_tried
        output = solver.solve(cnf_file, timeout=timeout_per_char,
                              random_phase_vars=msg_var_ids, seed=solve_seed,
                              cancel_event=cancel_event)
        solve_time = time.time() - solve_start

        # Clean up temp file
        try:
            os.unlink(cnf_file)
        except OSError:
            pass

        logger.info(f"Result: {output.result.value} in {solve_time:.2f}s")

        # Track attempt with full solver stats
        attempt = AttemptInfo(
            diff=list(diff),
            result=output.result.value,
            solve_time=solve_time,
            encoding_time=enc_time,
            num_vars=cnf_vars,
            num_clauses=cnf_clauses,
            num_conflicts=output.stats.num_conflicts,
            num_decisions=output.stats.num_decisions,
            num_propagations=output.stats.num_propagations,
            num_restarts=output.stats.num_restarts,
            num_learnt_clauses=output.stats.num_learnt_clauses,
        )
        result.attempts.append(attempt)

        if output.result in (SATResult.TIMEOUT, SATResult.CANCELLED):
            if output.result == SATResult.CANCELLED:
                logger.info("Solver cancelled by user")
                break
            logger.info(f"Solver timed out after {timeout_per_char}s, trying next diff")
            continue

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
