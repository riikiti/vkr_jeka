"""Reduced-round MD5 implementation for cryptanalysis."""

from __future__ import annotations

import struct

# MD5 per-step shift amounts
S = [
    7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
   5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
    4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
    6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,
]

# MD5 round constants T[i] = floor(2^32 * |sin(i+1)|)
K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
    0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
    0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
    0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
    0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
    0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
    0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
    0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
    0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

# Message word index per step
G_IDX = [
    # Round 1: g = i
     0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
    # Round 2: g = (5*i + 1) % 16
     1,  6, 11,  0,  5, 10, 15,  4,  9, 14,  3,  8, 13,  2,  7, 12,
    # Round 3: g = (3*i + 5) % 16
     5,  8, 11, 14,  1,  4,  7, 10, 13,  0,  3,  6,  9, 12, 15,  2,
    # Round 4: g = (7*i) % 16
     0,  7, 14,  5, 12,  3, 10,  1,  8, 15,  6, 13,  4, 11,  2,  9,
]

H0 = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]

MASK32 = 0xFFFFFFFF


def _rotl(x: int, n: int) -> int:
    return ((x << n) | (x >> (32 - n))) & MASK32


def _round_func(step: int, b: int, c: int, d: int) -> int:
    """MD5 round function F/G/H/I depending on step number."""
    if step < 16:
        return (b & c) | (~b & d) & MASK32     # F
    elif step < 32:
        return (d & b) | (~d & c) & MASK32     # G
    elif step < 48:
        return b ^ c ^ d                       # H
    else:
        return (c ^ (b | ~d)) & MASK32         # I


class MD5Reduced:
    """MD5 with configurable number of steps (1-64)."""

    def __init__(self, num_rounds: int = 64):
        if not 1 <= num_rounds <= 64:
            raise ValueError(f"num_rounds must be 1-64, got {num_rounds}")
        self.num_rounds = num_rounds

    def compress(self, state: list[int], block: list[int]) -> list[int]:
        """Compression function: one 512-bit block.

        Args:
            state: 4 x 32-bit words (a, b, c, d).
            block: 16 x 32-bit words (message block, little-endian).

        Returns:
            New 4-word state.
        """
        a, b, c, d = state

        for i in range(self.num_rounds):
            f = _round_func(i, b, c, d)
            g = G_IDX[i]
            temp = (a + f + K[i] + block[g]) & MASK32
            a = d
            d = c
            c = b
            b = (b + _rotl(temp, S[i])) & MASK32

        return [(s + v) & MASK32 for s, v in zip(state, [a, b, c, d])]

    def compress_trace(self, state: list[int], block: list[int]) -> list[list[int]]:
        """Compress with round-by-round trace."""
        a, b, c, d = state
        trace = [list(state)]

        for i in range(self.num_rounds):
            f = _round_func(i, b, c, d)
            g = G_IDX[i]
            temp = (a + f + K[i] + block[g]) & MASK32
            a = d
            d = c
            c = b
            b = (b + _rotl(temp, S[i])) & MASK32
            trace.append([a, b, c, d])

        return trace

    def message_schedule(self, block: list[int]) -> list[int]:
        """MD5 has no message expansion — returns the block itself."""
        return list(block[:16])

    def _pad(self, message: bytes) -> bytes:
        """MD5 padding (little-endian length)."""
        ml = len(message) * 8
        message += b'\x80'
        while (len(message) % 64) != 56:
            message += b'\x00'
        message += struct.pack('<Q', ml)  # little-endian!
        return message

    def _parse_blocks(self, padded: bytes) -> list[list[int]]:
        blocks = []
        for i in range(0, len(padded), 64):
            block = list(struct.unpack('<16I', padded[i:i + 64]))  # little-endian!
            blocks.append(block)
        return blocks

    def hash(self, message: bytes) -> bytes:
        """Compute MD5 hash (reduced rounds)."""
        padded = self._pad(message)
        blocks = self._parse_blocks(padded)
        state = list(H0)
        for block in blocks:
            state = self.compress(state, block)
        return struct.pack('<4I', *state)  # little-endian output
