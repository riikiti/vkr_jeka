"""Probability estimation for differential characteristics."""

from __future__ import annotations

import random
from ..hash_functions.sha256 import SHA256Reduced
from ..hash_functions.sha1 import SHA1Reduced
from ..utils.bit_operations import xor_difference

MASK32 = 0xFFFFFFFF


def estimate_characteristic_probability(
    hash_cls,
    num_rounds: int,
    message_diff: list[int],
    num_samples: int = 2**16,
    seed: int | None = None,
) -> dict:
    """Experimentally estimate the probability that a message difference
    leads to zero output difference (collision) for a reduced-round hash.

    Args:
        hash_cls: Hash class (SHA256Reduced or SHA1Reduced).
        num_rounds: Number of rounds.
        message_diff: List of 16 XOR differences for message words.
        num_samples: Number of random message pairs to test.
        seed: Random seed for reproducibility.

    Returns:
        Dictionary with experimental probability and statistics.
    """
    if seed is not None:
        random.seed(seed)

    h = hash_cls(num_rounds=num_rounds)

    if isinstance(h, SHA256Reduced):
        iv = list(SHA256Reduced.__init__.__module__ and [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
        ])
        state_words = 8
    else:
        iv = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]
        state_words = 5

    collisions = 0
    partial_matches = [0] * state_words

    for _ in range(num_samples):
        # Random message
        m1 = [random.getrandbits(32) for _ in range(16)]
        # Apply difference
        m2 = [(m1[i] ^ message_diff[i]) & MASK32 for i in range(16)]

        h1 = h.compress(list(iv), m1)
        h2 = h.compress(list(iv), m2)

        # Check output difference
        output_diff = [xor_difference(h1[j], h2[j]) for j in range(state_words)]

        if all(d == 0 for d in output_diff):
            collisions += 1

        for j in range(state_words):
            if output_diff[j] == 0:
                partial_matches[j] += 1

    return {
        "num_samples": num_samples,
        "collisions": collisions,
        "collision_rate": collisions / num_samples,
        "partial_match_rates": [pm / num_samples for pm in partial_matches],
    }


def estimate_round_differential_probability(
    hash_cls,
    num_rounds: int,
    message_diff: list[int],
    num_samples: int = 2**16,
    seed: int | None = None,
) -> list[dict]:
    """Estimate per-round differential probabilities using trace.

    Returns list of dicts, one per round, with per-word output differences
    and their frequencies.
    """
    if seed is not None:
        random.seed(seed)

    h = hash_cls(num_rounds=num_rounds)

    if isinstance(h, SHA256Reduced):
        iv = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
              0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    else:
        iv = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]

    state_size = len(iv)
    round_stats = [{"zero_diff_count": [0] * state_size} for _ in range(num_rounds + 1)]

    for _ in range(num_samples):
        m1 = [random.getrandbits(32) for _ in range(16)]
        m2 = [(m1[i] ^ message_diff[i]) & MASK32 for i in range(16)]

        trace1 = h.compress_trace(list(iv), m1)
        trace2 = h.compress_trace(list(iv), m2)

        for r in range(num_rounds + 1):
            for j in range(state_size):
                if xor_difference(trace1[r][j], trace2[r][j]) == 0:
                    round_stats[r]["zero_diff_count"][j] += 1

    for r in range(num_rounds + 1):
        round_stats[r]["zero_diff_rate"] = [
            c / num_samples for c in round_stats[r]["zero_diff_count"]
        ]

    return round_stats
