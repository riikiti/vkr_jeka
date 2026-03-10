"""Tests for SAT encoding of bitwise operations."""

import pytest

from src.sat_encoding.cnf_builder import CNFBuilder
from src.sat_encoding.bit_constraints import (
    encode_xor, encode_and, encode_or, encode_not,
    encode_xor3, encode_equal, encode_not_equal,
)


def solve_with_assumptions(builder: CNFBuilder, assumptions: list[int]) -> dict[int, bool] | None:
    """Helper: solve CNF with assumptions using PySAT."""
    from pysat.solvers import Solver
    with Solver(name="cadical153", bootstrap_with=builder.clauses) as s:
        if s.solve(assumptions=assumptions):
            return {abs(l): l > 0 for l in s.get_model()}
    return None


class TestXOREncoding:
    def test_all_combinations(self):
        """XOR encoding gives correct result for all input combinations."""
        for a_val in [False, True]:
            for b_val in [False, True]:
                builder = CNFBuilder()
                a = builder.var_mgr.new_var("a")
                b = builder.var_mgr.new_var("b")
                c = builder.var_mgr.new_var("c")
                encode_xor(builder, a, b, c)

                assumptions = [a if a_val else -a, b if b_val else -b]
                model = solve_with_assumptions(builder, assumptions)
                assert model is not None
                assert model[c] == (a_val ^ b_val)


class TestANDEncoding:
    def test_all_combinations(self):
        for a_val in [False, True]:
            for b_val in [False, True]:
                builder = CNFBuilder()
                a = builder.var_mgr.new_var("a")
                b = builder.var_mgr.new_var("b")
                c = builder.var_mgr.new_var("c")
                encode_and(builder, a, b, c)

                assumptions = [a if a_val else -a, b if b_val else -b]
                model = solve_with_assumptions(builder, assumptions)
                assert model is not None
                assert model[c] == (a_val and b_val)


class TestOREncoding:
    def test_all_combinations(self):
        for a_val in [False, True]:
            for b_val in [False, True]:
                builder = CNFBuilder()
                a = builder.var_mgr.new_var("a")
                b = builder.var_mgr.new_var("b")
                c = builder.var_mgr.new_var("c")
                encode_or(builder, a, b, c)

                assumptions = [a if a_val else -a, b if b_val else -b]
                model = solve_with_assumptions(builder, assumptions)
                assert model is not None
                assert model[c] == (a_val or b_val)


class TestNOTEncoding:
    def test_all_combinations(self):
        for a_val in [False, True]:
            builder = CNFBuilder()
            a = builder.var_mgr.new_var("a")
            z = builder.var_mgr.new_var("z")
            encode_not(builder, a, z)

            model = solve_with_assumptions(builder, [a if a_val else -a])
            assert model is not None
            assert model[z] == (not a_val)


class TestXOR3Encoding:
    def test_all_combinations(self):
        for a_val in [False, True]:
            for b_val in [False, True]:
                for c_val in [False, True]:
                    builder = CNFBuilder()
                    a = builder.var_mgr.new_var()
                    b = builder.var_mgr.new_var()
                    c = builder.var_mgr.new_var()
                    z = builder.var_mgr.new_var()
                    encode_xor3(builder, a, b, c, z)

                    assumptions = [
                        a if a_val else -a,
                        b if b_val else -b,
                        c if c_val else -c,
                    ]
                    model = solve_with_assumptions(builder, assumptions)
                    assert model is not None
                    assert model[z] == (a_val ^ b_val ^ c_val)


class TestEqualEncoding:
    def test_equal(self):
        builder = CNFBuilder()
        a = builder.var_mgr.new_var()
        b = builder.var_mgr.new_var()
        encode_equal(builder, a, b)

        # a=True -> b=True
        model = solve_with_assumptions(builder, [a])
        assert model[b] is True

        # a=False -> b=False
        model = solve_with_assumptions(builder, [-a])
        assert model[b] is False

    def test_not_equal(self):
        builder = CNFBuilder()
        a = builder.var_mgr.new_var()
        b = builder.var_mgr.new_var()
        encode_not_equal(builder, a, b)

        # a=True -> b=False
        model = solve_with_assumptions(builder, [a])
        assert model[b] is False
