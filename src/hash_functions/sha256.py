"""Reduced-round SHA-256 implementation for cryptanalysis."""

from __future__ import annotations

import struct

# SHA-256 round constants (first 32 bits of fractional parts of cube roots of first 64 primes)
K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

# Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
H0 = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]

MASK32 = 0xFFFFFFFF


def _rotr(x: int, n: int) -> int:
    return ((x >> n) | (x << (32 - n))) & MASK32


def _shr(x: int, n: int) -> int:
    return x >> n


def _ch(x: int, y: int, z: int) -> int:
    return (x & y) ^ (~x & z) & MASK32


def _maj(x: int, y: int, z: int) -> int:
    return (x & y) ^ (x & z) ^ (y & z)


def _sigma0(x: int) -> int:
    return _rotr(x, 2) ^ _rotr(x, 13) ^ _rotr(x, 22)


def _sigma1(x: int) -> int:
    return _rotr(x, 6) ^ _rotr(x, 11) ^ _rotr(x, 25)


def _little_sigma0(x: int) -> int:
    return _rotr(x, 7) ^ _rotr(x, 18) ^ _shr(x, 3)


def _little_sigma1(x: int) -> int:
    return _rotr(x, 17) ^ _rotr(x, 19) ^ _shr(x, 10)


class SHA256Reduced:
    """SHA-256 with configurable number of rounds (1–64)."""

    def __init__(self, num_rounds: int = 64):
        if not 1 <= num_rounds <= 64:
            raise ValueError(f"num_rounds must be 1–64, got {num_rounds}")
        self.num_rounds = num_rounds

    def message_schedule(self, block: list[int]) -> list[int]:
        """Compute message schedule W[0..num_rounds-1] from 16-word block."""
        W = list(block[:16])
        for i in range(16, self.num_rounds):
            W.append(
                (_little_sigma1(W[i - 2]) + W[i - 7]
                 + _little_sigma0(W[i - 15]) + W[i - 16]) & MASK32
            )
        return W

    def compress(self, state: list[int], block: list[int]) -> list[int]:
        """Compression function: process one 512-bit block.

        Args:
            state: 8 x 32-bit words (current hash state).
            block: 16 x 32-bit words (message block).

        Returns:
            New 8-word state.
        """
        W = self.message_schedule(block)
        a, b, c, d, e, f, g, h = state

        for i in range(self.num_rounds):
            T1 = (h + _sigma1(e) + _ch(e, f, g) + K[i] + W[i]) & MASK32
            T2 = (_sigma0(a) + _maj(a, b, c)) & MASK32
            h = g
            g = f
            f = e
            e = (d + T1) & MASK32
            d = c
            c = b
            b = a
            a = (T1 + T2) & MASK32

        return [(s + v) & MASK32 for s, v in zip(state, [a, b, c, d, e, f, g, h])]

    def compress_trace(self, state: list[int], block: list[int]) -> list[list[int]]:
        """Like compress but returns intermediate states for every round.

        Returns list of length num_rounds+1, where trace[0] is the initial state
        and trace[i] is the state after round i.
        """
        W = self.message_schedule(block)
        a, b, c, d, e, f, g, h = state
        trace = [list(state)]

        for i in range(self.num_rounds):
            T1 = (h + _sigma1(e) + _ch(e, f, g) + K[i] + W[i]) & MASK32
            T2 = (_sigma0(a) + _maj(a, b, c)) & MASK32
            h = g
            g = f
            f = e
            e = (d + T1) & MASK32
            d = c
            c = b
            b = a
            a = (T1 + T2) & MASK32
            trace.append([a, b, c, d, e, f, g, h])

        return trace

    def _pad(self, message: bytes) -> bytes:
        """SHA-256 padding."""
        ml = len(message) * 8
        message += b'\x80'
        while (len(message) % 64) != 56:
            message += b'\x00'
        message += struct.pack('>Q', ml)
        return message

    def _parse_blocks(self, padded: bytes) -> list[list[int]]:
        """Parse padded message into list of 16-word blocks."""
        blocks = []
        for i in range(0, len(padded), 64):
            block = list(struct.unpack('>16I', padded[i:i + 64]))
            blocks.append(block)
        return blocks

    def hash(self, message: bytes) -> bytes:
        """Compute SHA-256 hash (reduced rounds)."""
        padded = self._pad(message)
        blocks = self._parse_blocks(padded)
        state = list(H0)
        for block in blocks:
            state = self.compress(state, block)
        return struct.pack('>8I', *state)
