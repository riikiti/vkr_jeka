"""Reduced-round MD4 implementation for cryptanalysis."""

from __future__ import annotations

import struct

# MD4 round constants
K_VALUES = [0x00000000, 0x5A827999, 0x6ED9EBA1]

# Per-step shift amounts
S = [
    # Round 1
    3, 7, 11, 19, 3, 7, 11, 19, 3, 7, 11, 19, 3, 7, 11, 19,
    # Round 2
    3, 5, 9, 13, 3, 5, 9, 13, 3, 5, 9, 13, 3, 5, 9, 13,
    # Round 3
    3, 9, 11, 15, 3, 9, 11, 15, 3, 9, 11, 15, 3, 9, 11, 15,
]

# Message word index per step
G_IDX = [
    # Round 1: i
     0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
    # Round 2: permutation
     0,  4,  8, 12,  1,  5,  9, 13,  2,  6, 10, 14,  3,  7, 11, 15,
    # Round 3: permutation
     0,  8,  4, 12,  2, 10,  6, 14,  1,  9,  5, 13,  3, 11,  7, 15,
]

H0 = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]

MASK32 = 0xFFFFFFFF


def _rotl(x: int, n: int) -> int:
    return ((x << n) | (x >> (32 - n))) & MASK32


def _round_func(step: int, b: int, c: int, d: int) -> int:
    """MD4 round function."""
    if step < 16:
        return (b & c) | (~b & d) & MASK32          # F
    elif step < 32:
        return (b & c) | (b & d) | (c & d)          # G (Maj)
    else:
        return b ^ c ^ d                            # H


class MD4Reduced:
    """MD4 with configurable number of steps (1-48)."""

    def __init__(self, num_rounds: int = 48):
        if not 1 <= num_rounds <= 48:
            raise ValueError(f"num_rounds must be 1-48, got {num_rounds}")
        self.num_rounds = num_rounds

    def compress(self, state: list[int], block: list[int]) -> list[int]:
        """Compression function: one 512-bit block.

        Args:
            state: 4 x 32-bit words (a, b, c, d).
            block: 16 x 32-bit words (little-endian).

        Returns:
            New 4-word state.
        """
        a, b, c, d = state

        for i in range(self.num_rounds):
            f = _round_func(i, b, c, d)
            g = G_IDX[i]
            rnd = i // 16
            temp = (a + f + block[g] + K_VALUES[rnd]) & MASK32
            a = d
            d = c
            c = b
            b = _rotl(temp, S[i])

        return [(s + v) & MASK32 for s, v in zip(state, [a, b, c, d])]

    def compress_trace(self, state: list[int], block: list[int]) -> list[list[int]]:
        """Compress with round-by-round trace."""
        a, b, c, d = state
        trace = [list(state)]

        for i in range(self.num_rounds):
            f = _round_func(i, b, c, d)
            g = G_IDX[i]
            rnd = i // 16
            temp = (a + f + block[g] + K_VALUES[rnd]) & MASK32
            a = d
            d = c
            c = b
            b = _rotl(temp, S[i])
            trace.append([a, b, c, d])

        return trace

    def message_schedule(self, block: list[int]) -> list[int]:
        """MD4 has no message expansion."""
        return list(block[:16])

    def _pad(self, message: bytes) -> bytes:
        """MD4 padding (same as MD5)."""
        ml = len(message) * 8
        message += b'\x80'
        while (len(message) % 64) != 56:
            message += b'\x00'
        message += struct.pack('<Q', ml)
        return message

    def _parse_blocks(self, padded: bytes) -> list[list[int]]:
        blocks = []
        for i in range(0, len(padded), 64):
            block = list(struct.unpack('<16I', padded[i:i + 64]))
            blocks.append(block)
        return blocks

    def hash(self, message: bytes) -> bytes:
        """Compute MD4 hash (reduced rounds)."""
        padded = self._pad(message)
        blocks = self._parse_blocks(padded)
        state = list(H0)
        for block in blocks:
            state = self.compress(state, block)
        return struct.pack('<4I', *state)
