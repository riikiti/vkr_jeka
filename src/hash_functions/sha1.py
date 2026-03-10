"""Reduced-round SHA-1 implementation for cryptanalysis."""

from __future__ import annotations

import struct

K_VALUES = [0x5A827999, 0x6ED9EBA1, 0x8F1BBCDC, 0xCA62C1D6]

H0 = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]

MASK32 = 0xFFFFFFFF


def _rotl(x: int, n: int) -> int:
    return ((x << n) | (x >> (32 - n))) & MASK32


def _round_function(i: int, b: int, c: int, d: int) -> tuple[int, int]:
    """Return (f_i(b,c,d), K_i) for round i."""
    if i < 20:
        f = (b & c) ^ (~b & d) & MASK32
        k = K_VALUES[0]
    elif i < 40:
        f = b ^ c ^ d
        k = K_VALUES[1]
    elif i < 60:
        f = (b & c) ^ (b & d) ^ (c & d)
        k = K_VALUES[2]
    else:
        f = b ^ c ^ d
        k = K_VALUES[3]
    return f, k


class SHA1Reduced:
    """SHA-1 with configurable number of rounds (1–80)."""

    def __init__(self, num_rounds: int = 80):
        if not 1 <= num_rounds <= 80:
            raise ValueError(f"num_rounds must be 1–80, got {num_rounds}")
        self.num_rounds = num_rounds

    def message_schedule(self, block: list[int]) -> list[int]:
        """Compute message schedule W[0..num_rounds-1]."""
        W = list(block[:16])
        for i in range(16, self.num_rounds):
            W.append(_rotl(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1))
        return W

    def compress(self, state: list[int], block: list[int]) -> list[int]:
        """Compression function: one 512-bit block."""
        W = self.message_schedule(block)
        a, b, c, d, e = state

        for i in range(self.num_rounds):
            f, k = _round_function(i, b, c, d)
            T = (_rotl(a, 5) + f + e + k + W[i]) & MASK32
            e = d
            d = c
            c = _rotl(b, 30)
            b = a
            a = T

        return [(s + v) & MASK32 for s, v in zip(state, [a, b, c, d, e])]

    def compress_trace(self, state: list[int], block: list[int]) -> list[list[int]]:
        """Compress with full round-by-round trace."""
        W = self.message_schedule(block)
        a, b, c, d, e = state
        trace = [list(state)]

        for i in range(self.num_rounds):
            f, k = _round_function(i, b, c, d)
            T = (_rotl(a, 5) + f + e + k + W[i]) & MASK32
            e = d
            d = c
            c = _rotl(b, 30)
            b = a
            a = T
            trace.append([a, b, c, d, e])

        return trace

    def _pad(self, message: bytes) -> bytes:
        ml = len(message) * 8
        message += b'\x80'
        while (len(message) % 64) != 56:
            message += b'\x00'
        message += struct.pack('>Q', ml)
        return message

    def _parse_blocks(self, padded: bytes) -> list[list[int]]:
        blocks = []
        for i in range(0, len(padded), 64):
            block = list(struct.unpack('>16I', padded[i:i + 64]))
            blocks.append(block)
        return blocks

    def hash(self, message: bytes) -> bytes:
        """Compute SHA-1 hash (reduced rounds)."""
        padded = self._pad(message)
        blocks = self._parse_blocks(padded)
        state = list(H0)
        for block in blocks:
            state = self.compress(state, block)
        return struct.pack('>5I', *state)
