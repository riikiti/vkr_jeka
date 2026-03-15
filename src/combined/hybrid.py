"""Hybrid combined cryptanalysis strategy.

First runs a quick differential probability estimation on a pool of
candidate differentials, then ranks them by estimated probability
and tries the most promising ones with SAT.
"""

from __future__ import annotations

import logging
import os
import random
import tempfile
import time

from ..differential.probability import estimate_characteristic_probability
from ..sat_encoding.hash_encoder import CollisionEncoder
from ..solver.sat_interface import SATResult
from ..solver.pysat_runner import PySATRunner
from ..solver.solution_extractor import SolutionExtractor
from .sequential import AttackResult, AttemptInfo, generate_message_diffs

logger = logging.getLogger(__name__)

# Maps hash function name to its Reduced class
_HASH_CLASSES = {}


def _get_hash_class(name: str):
    """Lazy-load hash class by name."""
    name = name.lower()
    if name not in _HASH_CLASSES:
        if name == "sha256":
            from ..hash_functions.sha256 import SHA256Reduced
            _HASH_CLASSES[name] = SHA256Reduced
        elif name == "sha1":
            from ..hash_functions.sha1 import SHA1Reduced
            _HASH_CLASSES[name] = SHA1Reduced
        elif name == "md5":
            from ..hash_functions.md5 import MD5Reduced
            _HASH_CLASSES[name] = MD5Reduced
        elif name == "md4":
            from ..hash_functions.md4 import MD4Reduced
            _HASH_CLASSES[name] = MD4Reduced
        else:
            raise ValueError(f"Unknown hash function: {name}")
    return _HASH_CLASSES[name]


def hybrid_attack(
    num_rounds: int,
    message_diffs: list[list[int]] | None = None,
    solver_name: str = "cadical153",
    timeout_per_char: int = 300,
    max_characteristics: int = 10,
    hash_function: str = "sha256",
    seed: int = 42,
    scan_samples: int = 4096,
    cancel_event=None,
) -> AttackResult:
    """Run hybrid combined attack.

    Phase 1: Generate a pool of candidate differentials and quickly
    estimate their collision probability using Monte Carlo sampling.

    Phase 2: Sort candidates by estimated probability (best first)
    and try them with the SAT solver.

    Args:
        num_rounds: Number of hash function rounds/steps.
        message_diffs: Custom candidate differentials. If None, auto-generated.
        solver_name: PySAT solver name.
        timeout_per_char: Timeout per SAT solve (seconds).
        max_characteristics: Maximum SAT calls in phase 2.
        hash_function: Hash function name.
        seed: Random seed.
        scan_samples: Number of samples for differential probability scan.

    Returns:
        AttackResult with collision details if found.
    """
    total_start = time.time()
    result = AttackResult()

    # Phase 1: Generate and rank differentials
    scan_pool_size = max(max_characteristics * 3, 16)

    if message_diffs is None:
        candidates = generate_message_diffs(scan_pool_size, seed)
    else:
        candidates = list(message_diffs)

    hash_cls = _get_hash_class(hash_function)

    logger.info(f"Hybrid phase 1: scanning {len(candidates)} differentials "
                f"with {scan_samples} samples each")

    diff_analysis_start = time.time()
    scored: list[tuple[float, list[int]]] = []

    for diff in candidates:
        try:
            stats = estimate_characteristic_probability(
                hash_cls, num_rounds, diff,
                num_samples=scan_samples, seed=seed,
            )
            # Score: higher partial match rate = more promising
            # Use average partial match rate as a proxy for quality
            avg_partial = sum(stats["partial_match_rates"]) / len(stats["partial_match_rates"])
            # Bonus for actual collisions found during scan
            score = avg_partial + stats["collision_rate"] * 1000
            scored.append((score, diff))
        except Exception as e:
            logger.warning(f"Scan failed for diff: {e}")
            scored.append((0.0, diff))

    # Sort by score (best first)
    scored.sort(key=lambda x: x[0], reverse=True)
    diff_analysis_time = time.time() - diff_analysis_start

    logger.info(f"Phase 1 done in {diff_analysis_time:.2f}s. "
                f"Top score: {scored[0][0]:.4f}")

    # Phase 2: SAT solving on top candidates
    solver = PySATRunner(solver_name)
    chars_tried = 0

    for score, diff in scored[:max_characteristics]:
        if cancel_event is not None and cancel_event.is_set():
            logger.info("Cancelled by user")
            break

        chars_tried += 1
        hw = sum(bin(w & 0xFFFFFFFF).count('1') for w in diff)
        logger.info(f"Hybrid SAT #{chars_tried}: score={score:.4f}, HW={hw}, "
                    f"diff=[{', '.join(f'0x{d:08x}' for d in diff[:4])}...]")

        enc_start = time.time()
        encoder = CollisionEncoder(num_rounds, hash_function=hash_function)
        encoder.encode()
        encoder.fix_message_difference(diff)
        enc_time = time.time() - enc_start

        msg_var_ids = [v for word in encoder._msg1 for v in word] + \
                      [v for word in encoder._msg2 for v in word]

        fd, cnf_file = tempfile.mkstemp(
            suffix='.cnf', prefix=f'col_r{num_rounds}_hyb{chars_tried}_')
        os.close(fd)
        encoder.builder.write_dimacs(cnf_file)

        solve_start = time.time()
        solve_seed = int(time.time() * 1000) ^ chars_tried
        output = solver.solve(cnf_file, timeout=timeout_per_char,
                              random_phase_vars=msg_var_ids, seed=solve_seed)
        solve_time = time.time() - solve_start

        try:
            os.unlink(cnf_file)
        except OSError:
            pass

        logger.info(f"Result: {output.result.value} in {solve_time:.2f}s")

        # Track attempt
        result.attempts.append(AttemptInfo(
            diff=list(diff),
            result=output.result.value,
            solve_time=solve_time,
            encoding_time=enc_time,
        ))

        if output.result == SATResult.SAT:
            extractor = SolutionExtractor(encoder.builder.var_mgr)
            m1 = extractor.extract_message(output.assignment, encoder._msg1)
            m2 = extractor.extract_message(output.assignment, encoder._msg2)

            result.success = True
            result.m1_words = m1
            result.m2_words = m2
            result.solver_output = output
            result.encoding_time = enc_time
            result.solving_time = solve_time
            result.diff_analysis_time = diff_analysis_time
            result.characteristics_tried = chars_tried
            result.total_time = time.time() - total_start
            return result

        if output.result == SATResult.TIMEOUT:
            logger.info(f"Timeout, trying next candidate")

    result.characteristics_tried = chars_tried
    result.diff_analysis_time = diff_analysis_time
    result.total_time = time.time() - total_start
    return result
