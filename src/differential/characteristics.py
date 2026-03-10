"""Data structures for differential characteristics."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field


@dataclass
class WordDifference:
    """XOR difference of a 32-bit word."""

    xor_diff: int = 0

    @property
    def hamming_weight(self) -> int:
        return bin(self.xor_diff & 0xFFFFFFFF).count('1')

    @property
    def active_bits(self) -> list[int]:
        return [i for i in range(32) if (self.xor_diff >> i) & 1]

    @property
    def is_zero(self) -> bool:
        return self.xor_diff == 0

    def __repr__(self) -> str:
        return f"WordDiff(0x{self.xor_diff:08x}, hw={self.hamming_weight})"


@dataclass
class RoundDifference:
    """Differences of all working words after one round."""

    round_num: int
    word_diffs: dict[str, WordDifference] = field(default_factory=dict)

    @property
    def total_active_bits(self) -> int:
        return sum(wd.hamming_weight for wd in self.word_diffs.values())

    @property
    def is_zero(self) -> bool:
        return all(wd.is_zero for wd in self.word_diffs.values())


@dataclass
class BitCondition:
    """Sufficient condition on a specific bit."""

    ZERO = '0'
    ONE = '1'
    EQUAL = '='
    NEQUAL = '!'
    FREE = '?'

    word: str
    round_num: int
    bit_pos: int
    condition: str

    def __repr__(self) -> str:
        return f"{self.word}[{self.round_num}][{self.bit_pos}]={self.condition}"


@dataclass
class DifferentialCharacteristic:
    """Complete differential characteristic across all rounds."""

    hash_function: str = ""
    num_rounds: int = 0
    message_diff: list[int] = field(default_factory=list)  # 16 x 32-bit XOR diffs
    round_diffs: list[RoundDifference] = field(default_factory=list)
    probability: float = 1.0
    conditions: list[BitCondition] = field(default_factory=list)

    def add_round(self, rd: RoundDifference, round_prob: float) -> None:
        self.round_diffs.append(rd)
        self.probability *= round_prob

    @property
    def log2_probability(self) -> float:
        if self.probability <= 0:
            return float('-inf')
        return math.log2(self.probability)

    @property
    def total_active_bits(self) -> int:
        return sum(rd.total_active_bits for rd in self.round_diffs)

    @property
    def num_conditions(self) -> int:
        return len([c for c in self.conditions if c.condition != BitCondition.FREE])

    def to_dict(self) -> dict:
        return {
            "hash_function": self.hash_function,
            "num_rounds": self.num_rounds,
            "message_diff": [f"0x{d:08x}" for d in self.message_diff],
            "probability_log2": self.log2_probability,
            "total_active_bits": self.total_active_bits,
            "num_conditions": self.num_conditions,
            "rounds": [
                {
                    "round": rd.round_num,
                    "active_bits": rd.total_active_bits,
                    "words": {
                        name: f"0x{wd.xor_diff:08x}"
                        for name, wd in rd.word_diffs.items()
                        if not wd.is_zero
                    },
                }
                for rd in self.round_diffs
            ],
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)
