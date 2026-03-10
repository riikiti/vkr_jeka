"""Bit-level utility functions for cryptanalysis."""

from __future__ import annotations

MASK32 = 0xFFFFFFFF


def hamming_weight(x: int) -> int:
    """Number of set bits in a 32-bit word."""
    return bin(x & MASK32).count('1')


def active_bits(x: int, width: int = 32) -> list[int]:
    """Positions of set bits (LSB = 0)."""
    return [i for i in range(width) if (x >> i) & 1]


def xor_difference(a: int, b: int) -> int:
    """XOR difference of two 32-bit words."""
    return (a ^ b) & MASK32


def word_to_bits(word: int, width: int = 32) -> list[int]:
    """Convert 32-bit word to list of bits (LSB first)."""
    return [(word >> i) & 1 for i in range(width)]


def bits_to_word(bits: list[int]) -> int:
    """Convert list of bits (LSB first) to 32-bit word."""
    val = 0
    for i, b in enumerate(bits):
        if b:
            val |= 1 << i
    return val & MASK32


def rotr(x: int, n: int, width: int = 32) -> int:
    """Right rotation."""
    return ((x >> n) | (x << (width - n))) & ((1 << width) - 1)


def rotl(x: int, n: int, width: int = 32) -> int:
    """Left rotation."""
    return ((x << n) | (x >> (width - n))) & ((1 << width) - 1)


def format_word_hex(x: int) -> str:
    """Format 32-bit word as 0x-prefixed hex string."""
    return f"0x{x:08x}"


def format_word_bin(x: int) -> str:
    """Format 32-bit word as binary string."""
    return f"{x:032b}"
