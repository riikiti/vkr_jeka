"""Tests for SAT encoding of word-level operations."""

import pytest
import random

from src.sat_encoding.cnf_builder import CNFBuilder
from src.sat_encoding.word_operations import encode_modular_add, rotate_right, rotate_left


def solve_and_extract(builder: CNFBuilder, word_vars: list[int]) -> int | None:
    """Solve CNF and extract a 32-bit word value."""
    from pysat.solvers import Solver
    with Solver(name="cadical153", bootstrap_with=builder.clauses) as s:
        if s.solve():
            model = {abs(l): l > 0 for l in s.get_model()}
            val = 0
            for i, v in enumerate(word_vars):
                if model.get(v, False):
                    val |= 1 << i
            return val
    return None


class TestModularAdd:
    def test_simple_addition(self):
        """5 + 3 = 8."""
        builder = CNFBuilder()
        x = builder.var_mgr.new_word("x")
        y = builder.var_mgr.new_word("y")
        z = builder.var_mgr.new_word("z")
        encode_modular_add(builder, x, y, z)
        builder.fix_word_value(x, 5)
        builder.fix_word_value(y, 3)

        result = solve_and_extract(builder, z)
        assert result == 8

    def test_overflow(self):
        """0xFFFFFFFF + 1 = 0 (mod 2^32)."""
        builder = CNFBuilder()
        x = builder.var_mgr.new_word("x")
        y = builder.var_mgr.new_word("y")
        z = builder.var_mgr.new_word("z")
        encode_modular_add(builder, x, y, z)
        builder.fix_word_value(x, 0xFFFFFFFF)
        builder.fix_word_value(y, 1)

        result = solve_and_extract(builder, z)
        assert result == 0

    def test_zero_addition(self):
        builder = CNFBuilder()
        x = builder.var_mgr.new_word("x")
        y = builder.var_mgr.new_word("y")
        z = builder.var_mgr.new_word("z")
        encode_modular_add(builder, x, y, z)
        builder.fix_word_value(x, 42)
        builder.fix_word_value(y, 0)

        result = solve_and_extract(builder, z)
        assert result == 42

    def test_random_values(self):
        """Test with a few random values."""
        rng = random.Random(42)
        for _ in range(5):
            a = rng.getrandbits(32)
            b = rng.getrandbits(32)
            expected = (a + b) & 0xFFFFFFFF

            builder = CNFBuilder()
            x = builder.var_mgr.new_word("x")
            y = builder.var_mgr.new_word("y")
            z = builder.var_mgr.new_word("z")
            encode_modular_add(builder, x, y, z)
            builder.fix_word_value(x, a)
            builder.fix_word_value(y, b)

            result = solve_and_extract(builder, z)
            assert result == expected, f"{a} + {b} = {expected}, got {result}"


class TestRotations:
    def test_rotate_right_identity(self):
        bits = list(range(1, 33))
        result = rotate_right(bits, 0)
        assert result == bits

    def test_rotate_right_one(self):
        bits = list(range(1, 33))
        result = rotate_right(bits, 1)
        assert result[0] == bits[1]
        assert result[31] == bits[0]

    def test_rotate_left_one(self):
        bits = list(range(1, 33))
        result = rotate_left(bits, 1)
        assert result[0] == bits[31]
        assert result[1] == bits[0]

    def test_rotate_round_trip(self):
        bits = list(range(1, 33))
        result = rotate_right(rotate_left(bits, 7), 7)
        assert result == bits
