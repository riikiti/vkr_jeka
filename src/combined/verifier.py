"""Collision verification module."""

from __future__ import annotations

from ..utils.bit_operations import hamming_weight, xor_difference


class CollisionVerifier:
    """Verify collision pairs found by the combined method."""

    def __init__(self, hash_func):
        self.hash_func = hash_func

    def verify(self, m1: bytes, m2: bytes) -> dict:
        """Verify that m1 and m2 produce a collision.

        Returns dict with verification details.
        """
        h1 = self.hash_func.hash(m1)
        h2 = self.hash_func.hash(m2)

        messages_differ = m1 != m2
        hashes_equal = h1 == h2

        # Compute message XOR difference (bit count)
        m1_int = int.from_bytes(m1, 'big')
        m2_int = int.from_bytes(m2, 'big')
        msg_xor = m1_int ^ m2_int
        msg_hamming = bin(msg_xor).count('1')

        return {
            "messages_differ": messages_differ,
            "hashes_equal": hashes_equal,
            "collision_found": messages_differ and hashes_equal,
            "hash1_hex": h1.hex(),
            "hash2_hex": h2.hex(),
            "message_hamming_distance": msg_hamming,
        }

    def verify_words(self, m1_words: list[int], m2_words: list[int]) -> dict:
        """Verify collision from word lists (16 x 32-bit)."""
        import struct
        m1_bytes = struct.pack(f'>{len(m1_words)}I', *m1_words)
        m2_bytes = struct.pack(f'>{len(m2_words)}I', *m2_words)

        # Pad to full message
        result = self.verify(m1_bytes, m2_bytes)

        # Add word-level diff info
        word_diffs = [xor_difference(m1_words[i], m2_words[i])
                      for i in range(len(m1_words))]
        result["word_diffs"] = [f"0x{d:08x}" for d in word_diffs]
        result["active_words"] = sum(1 for d in word_diffs if d != 0)

        return result
