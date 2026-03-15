"""Iterative combined cryptanalysis strategy.

Starts with a candidate differential, and if SAT returns UNSAT,
mutates the differential (flips bits, changes active words) to
explore nearby differentials. This creates an evolutionary search.
"""

from __future__ import annotations

import logging
import os
import random
import tempfile
import time

from ..sat_encoding.hash_encoder import CollisionEncoder
from ..solver.sat_interface import SATResult
from ..solver.pysat_runner import PySATRunner
from ..solver.solution_extractor import SolutionExtractor
from .sequential import AttackResult, AttemptInfo, generate_message_diffs

logger = logging.getLogger(__name__)

MASK32 = 0xFFFFFFFF


def _mutate_diff(diff: list[int], rng: random.Random) -> list[int]:
    """Mutate a message difference by flipping/moving bits."""
    new = list(diff)
    action = rng.randint(0, 3)

    if action == 0:
        # Flip one random bit in an active word
        active = [i for i in range(16) if new[i] != 0]
        if active:
            w = rng.choice(active)
            bit = rng.randint(0, 31)
            new[w] ^= 1 << bit
            if new[w] == 0:
                # Keep at least one active bit
                new[w] = 1 << rng.randint(0, 31)
    elif action == 1:
        # Move the active difference to a different word
        active = [i for i in range(16) if new[i] != 0]
        if active:
            src = rng.choice(active)
            dst = rng.randint(0, 15)
            if dst != src:
                new[dst] = new[src]
                new[src] = 0
    elif action == 2:
        # Replace with a single-bit MSB diff in a random word
        new = [0] * 16
        new[rng.randint(0, 15)] = 0x80000000
    else:
        # Replace with a single-bit diff at a random position
        new = [0] * 16
        w = rng.randint(0, 15)
        new[w] = 1 << rng.randint(0, 31)

    # Ensure at least one non-zero word
    if all(w == 0 for w in new):
        new[0] = 0x80000000

    return new


def iterative_attack(
    num_rounds: int,
    message_diffs: list[list[int]] | None = None,
    solver_name: str = "cadical153",
    timeout_per_char: int = 300,
    max_characteristics: int = 10,
    hash_function: str = "sha256",
    seed: int = 42,
    cancel_event=None,
) -> AttackResult:
    """Run iterative combined attack.

    Unlike sequential, when a differential fails (UNSAT), this strategy
    mutates it and retries, exploring the neighborhood of promising
    differentials.

    Args:
        num_rounds: Number of hash function rounds/steps.
        message_diffs: Initial candidate differentials. If None, auto-generated.
        solver_name: PySAT solver name.
        timeout_per_char: Timeout per SAT solve (seconds).
        max_characteristics: Maximum total SAT calls.
        hash_function: Hash function name.
        seed: Random seed.

    Returns:
        AttackResult with collision details if found.
    """
    total_start = time.time()
    result = AttackResult()
    rng = random.Random(seed)

    if message_diffs is None:
        message_diffs = generate_message_diffs(max(4, max_characteristics // 2), seed)

    solver = PySATRunner(solver_name)
    chars_tried = 0
    tried_hashes: set[tuple[int, ...]] = set()

    # Start with the seed differentials, then mutate
    current_diff = message_diffs[0]
    diff_queue = list(message_diffs[1:])

    while chars_tried < max_characteristics:
        if cancel_event is not None and cancel_event.is_set():
            logger.info("Cancelled by user")
            break

        diff_key = tuple(current_diff)
        if diff_key in tried_hashes:
            # Already tried this exact differential, pick next or mutate
            if diff_queue:
                current_diff = diff_queue.pop(0)
            else:
                current_diff = _mutate_diff(current_diff, rng)
            continue

        tried_hashes.add(diff_key)
        chars_tried += 1

        active_words = sum(1 for w in current_diff if w != 0)
        hw = sum(bin(w & MASK32).count('1') for w in current_diff)
        logger.info(f"Iterative #{chars_tried}: {active_words} active words, "
                    f"HW={hw}, diff=[{', '.join(f'0x{d:08x}' for d in current_diff[:4])}...]")

        # Encode and solve
        enc_start = time.time()
        encoder = CollisionEncoder(num_rounds, hash_function=hash_function)
        encoder.encode()
        encoder.fix_message_difference(current_diff)
        enc_time = time.time() - enc_start

        msg_var_ids = [v for word in encoder._msg1 for v in word] + \
                      [v for word in encoder._msg2 for v in word]

        fd, cnf_file = tempfile.mkstemp(
            suffix='.cnf', prefix=f'col_r{num_rounds}_iter{chars_tried}_')
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
            diff=list(current_diff),
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
            result.characteristics_tried = chars_tried
            result.total_time = time.time() - total_start
            return result

        # UNSAT or TIMEOUT — mutate and try again
        if output.result == SATResult.UNSAT:
            # UNSAT is definitive — this diff can't work, mutate more aggressively
            for _ in range(2):
                candidate = _mutate_diff(current_diff, rng)
                if tuple(candidate) not in tried_hashes:
                    diff_queue.append(candidate)

        # TIMEOUT — the diff might work with more time, try a simpler variant
        if output.result == SATResult.TIMEOUT:
            # Try reducing to single-bit diff in the same active word
            active = [i for i in range(16) if current_diff[i] != 0]
            if active:
                w = active[0]
                simple = [0] * 16
                simple[w] = 0x80000000  # just MSB
                if tuple(simple) not in tried_hashes:
                    diff_queue.insert(0, simple)

        # Pick next differential
        if diff_queue:
            current_diff = diff_queue.pop(0)
        else:
            current_diff = _mutate_diff(current_diff, rng)

    result.characteristics_tried = chars_tried
    result.total_time = time.time() - total_start
    return result
