"""Extract cryptographic data from SAT solutions."""

from __future__ import annotations

import struct

from .sat_interface import SolverOutput


class SolutionExtractor:
    """Extract message words and hash values from a SAT assignment."""

    def __init__(self, var_mgr):
        self.var_mgr = var_mgr

    def extract_word(self, assignment: dict[int, bool], word_vars: list[int]) -> int:
        """Extract a 32-bit word from variable assignment (LSB-first)."""
        val = 0
        for i, vid in enumerate(word_vars):
            if assignment.get(vid, False):
                val |= 1 << i
        return val

    def extract_message(self, assignment: dict[int, bool],
                        message_vars: list[list[int]]) -> list[int]:
        """Extract 16-word (512-bit) message."""
        return [self.extract_word(assignment, wv) for wv in message_vars]

    def extract_message_bytes(self, assignment: dict[int, bool],
                              message_vars: list[list[int]]) -> bytes:
        """Extract message as bytes (big-endian)."""
        words = self.extract_message(assignment, message_vars)
        return struct.pack(f'>{len(words)}I', *words)

    def extract_state(self, assignment: dict[int, bool],
                      state_vars: list[list[int]]) -> list[int]:
        """Extract hash state (8 words for SHA-256, 5 for SHA-1)."""
        return [self.extract_word(assignment, wv) for wv in state_vars]
