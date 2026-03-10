"""Differential propagation rules for ARX operations."""

from __future__ import annotations

MASK32 = 0xFFFFFFFF


def propagate_xor(dx: int, dy: int) -> tuple[int, float]:
    """XOR propagation: deterministic, probability 1."""
    return (dx ^ dy) & MASK32, 1.0


def propagate_rotation(delta: int, r: int, left: bool = False) -> tuple[int, float]:
    """Rotation propagation: deterministic, probability 1."""
    if left:
        rotated = ((delta << r) | (delta >> (32 - r))) & MASK32
    else:
        rotated = ((delta >> r) | (delta << (32 - r))) & MASK32
    return rotated, 1.0


def propagate_shift_right(delta: int, r: int) -> tuple[int, float]:
    """Logical right shift propagation: deterministic if top r bits of delta are 0."""
    return (delta >> r) & MASK32, 1.0


def ch_differential_prob_bit(dx: int, dy: int, dz: int) -> float:
    """Compute log2 probability of Ch(x,y,z) differential per-bit.

    Ch(x,y,z) = (x & y) ^ (~x & z)

    For each bit position, the differential is deterministic only when:
    - (dx=0, dy=0, dz=0): output diff = 0, prob 1
    - (dx=0, dy=1, dz=1): output diff = 1, prob 1
    - (dx=1, dy=1, dz=1): output diff = 1, prob 1

    All other active-bit combinations have probability 1/2 per bit.

    Returns log2(probability).
    """
    log2_prob = 0.0
    for i in range(32):
        bx = (dx >> i) & 1
        by = (dy >> i) & 1
        bz = (dz >> i) & 1

        if (bx, by, bz) == (0, 0, 0):
            continue  # prob 1
        elif (bx, by, bz) == (0, 1, 1):
            continue  # output diff = 1, prob 1
        elif (bx, by, bz) == (1, 1, 1):
            continue  # output diff = 1, prob 1
        else:
            log2_prob -= 1.0  # prob 1/2

    return log2_prob


def maj_differential_prob_bit(dx: int, dy: int, dz: int) -> float:
    """Compute log2 probability of Maj(x,y,z) differential per-bit.

    Maj(x,y,z) = (x & y) ^ (x & z) ^ (y & z)

    Deterministic cases per bit:
    - (0,0,0): output 0, prob 1
    - (1,1,1): output 1, prob 1

    All other non-zero patterns have prob 1/2.

    Returns log2(probability).
    """
    log2_prob = 0.0
    for i in range(32):
        bx = (dx >> i) & 1
        by = (dy >> i) & 1
        bz = (dz >> i) & 1

        if (bx, by, bz) == (0, 0, 0):
            continue
        elif (bx, by, bz) == (1, 1, 1):
            continue
        elif bx + by + bz > 0:
            log2_prob -= 1.0

    return log2_prob


def modadd_xor_differential_prob(dx: int, dy: int, dz: int) -> float:
    """Probability of XOR-differential (dx, dy) -> dz for modular addition.

    Uses the Lipmaa-Moriai (2001) formula.

    Returns probability as a float (0.0 if impossible).
    """
    dx &= MASK32
    dy &= MASK32
    dz &= MASK32

    # eq(a, b) = ~(a ^ b): bitwise equality
    eq_dx_dy = ~(dx ^ dy) & MASK32
    eq_dx_dz = ~(dx ^ dz) & MASK32

    # Check feasibility (all bits except MSB)
    mask = (eq_dx_dy | eq_dx_dz) & 0x7FFFFFFF
    if mask != 0x7FFFFFFF:
        return 0.0

    # Count free carry bits: positions where both equalities fail
    free = ~eq_dx_dy & ~eq_dx_dz & 0x7FFFFFFF
    k = bin(free).count('1')

    return 2.0 ** (-k)


def modadd_xor_differential_log2(dx: int, dy: int, dz: int) -> float:
    """Log2 probability of modular addition XOR-differential.

    Returns float('-inf') if impossible.
    """
    p = modadd_xor_differential_prob(dx, dy, dz)
    if p <= 0:
        return float('-inf')
    import math
    return math.log2(p)


def sigma0_sha256_diff(delta: int) -> int:
    """Differential through SHA-256 Sigma0: ROTR2 ^ ROTR13 ^ ROTR22."""
    r2 = ((delta >> 2) | (delta << 30)) & MASK32
    r13 = ((delta >> 13) | (delta << 19)) & MASK32
    r22 = ((delta >> 22) | (delta << 10)) & MASK32
    return r2 ^ r13 ^ r22


def sigma1_sha256_diff(delta: int) -> int:
    """Differential through SHA-256 Sigma1: ROTR6 ^ ROTR11 ^ ROTR25."""
    r6 = ((delta >> 6) | (delta << 26)) & MASK32
    r11 = ((delta >> 11) | (delta << 21)) & MASK32
    r25 = ((delta >> 25) | (delta << 7)) & MASK32
    return r6 ^ r11 ^ r25


def little_sigma0_sha256_diff(delta: int) -> int:
    """Differential through SHA-256 sigma0: ROTR7 ^ ROTR18 ^ SHR3."""
    r7 = ((delta >> 7) | (delta << 25)) & MASK32
    r18 = ((delta >> 18) | (delta << 14)) & MASK32
    s3 = delta >> 3
    return r7 ^ r18 ^ s3


def little_sigma1_sha256_diff(delta: int) -> int:
    """Differential through SHA-256 sigma1: ROTR17 ^ ROTR19 ^ SHR10."""
    r17 = ((delta >> 17) | (delta << 15)) & MASK32
    r19 = ((delta >> 19) | (delta << 13)) & MASK32
    s10 = delta >> 10
    return r17 ^ r19 ^ s10
