"""Tests for differential propagation rules."""

import pytest

from src.differential.propagation import (
    propagate_xor,
    propagate_rotation,
    propagate_shift_right,
    ch_differential_prob_bit,
    maj_differential_prob_bit,
    modadd_xor_differential_prob,
    sigma0_sha256_diff,
    sigma1_sha256_diff,
)


class TestXORPropagation:
    def test_basic(self):
        delta, prob = propagate_xor(0x80000000, 0x00000001)
        assert delta == 0x80000001
        assert prob == 1.0

    def test_zero(self):
        delta, prob = propagate_xor(0, 0)
        assert delta == 0
        assert prob == 1.0

    def test_cancel(self):
        delta, prob = propagate_xor(0xAAAAAAAA, 0xAAAAAAAA)
        assert delta == 0
        assert prob == 1.0


class TestRotationPropagation:
    def test_right_rotation(self):
        delta, prob = propagate_rotation(0x80000000, 1, left=False)
        assert delta == 0x40000000
        assert prob == 1.0

    def test_left_rotation(self):
        delta, prob = propagate_rotation(0x00000001, 1, left=True)
        assert delta == 0x00000002
        assert prob == 1.0

    def test_wrap_around(self):
        delta, prob = propagate_rotation(0x00000001, 1, left=False)
        assert delta == 0x80000000
        assert prob == 1.0


class TestShiftPropagation:
    def test_basic(self):
        delta, prob = propagate_shift_right(0x80000000, 1)
        assert delta == 0x40000000
        assert prob == 1.0

    def test_shift_out(self):
        delta, prob = propagate_shift_right(0x00000001, 1)
        assert delta == 0
        assert prob == 1.0


class TestChDifferentialProbability:
    def test_all_zero(self):
        assert ch_differential_prob_bit(0, 0, 0) == 0.0  # prob 1, log2=0

    def test_all_ones(self):
        # All 32 bits active in all three inputs
        prob = ch_differential_prob_bit(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF)
        assert prob == 0.0  # deterministic case

    def test_single_bit_x(self):
        prob = ch_differential_prob_bit(0x1, 0, 0)
        assert prob == -1.0  # one uncertain bit


class TestMajDifferentialProbability:
    def test_all_zero(self):
        assert maj_differential_prob_bit(0, 0, 0) == 0.0

    def test_all_ones(self):
        assert maj_differential_prob_bit(0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF) == 0.0

    def test_single_input(self):
        prob = maj_differential_prob_bit(0x1, 0, 0)
        assert prob == -1.0


class TestModularAddDifferential:
    def test_zero_diff(self):
        assert modadd_xor_differential_prob(0, 0, 0) == 1.0

    def test_msb_diff(self):
        # MSB difference: (0x80000000, 0, 0x80000000) -> prob 1
        assert modadd_xor_differential_prob(0x80000000, 0, 0x80000000) == 1.0

    def test_lsb_possible(self):
        # (1, 0, 1) -> prob 1 (no carry interference)
        assert modadd_xor_differential_prob(1, 0, 1) == 1.0

    def test_impossible(self):
        # (1, 0, 0) is impossible (1+0 can't give 0 at LSB with XOR-diff)
        assert modadd_xor_differential_prob(1, 0, 0) == 0.0


class TestSigmaDifferentials:
    def test_sigma0_zero(self):
        assert sigma0_sha256_diff(0) == 0

    def test_sigma1_zero(self):
        assert sigma1_sha256_diff(0) == 0

    def test_sigma0_nonzero(self):
        result = sigma0_sha256_diff(0x80000000)
        assert result != 0  # non-trivial propagation
