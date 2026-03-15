"""SAT encoding of reduced-round MD5 compression function."""

from __future__ import annotations

from .cnf_builder import CNFBuilder
from .bit_constraints import encode_ch_word, encode_maj_word, encode_xor_word
from .word_operations import encode_modular_add, encode_modular_add_const, rotate_left
from ..hash_functions.md5 import K as MD5_K, S as MD5_S, G_IDX as MD5_G, H0 as MD5_H0


def _encode_md5_f_word(builder: CNFBuilder, b: list[int], c: list[int],
                       d: list[int]) -> list[int]:
    """F(b,c,d) = (b & c) | (~b & d) — same as Ch(b,c,d)."""
    return encode_ch_word(builder, b, c, d)


def _encode_md5_g_word(builder: CNFBuilder, b: list[int], c: list[int],
                       d: list[int]) -> list[int]:
    """G(b,c,d) = (d & b) | (~d & c) — Ch with swapped args."""
    return encode_ch_word(builder, d, b, c)


def _encode_md5_h_word(builder: CNFBuilder, b: list[int], c: list[int],
                       d: list[int]) -> list[int]:
    """H(b,c,d) = b ^ c ^ d."""
    from .bit_constraints import encode_xor3_word
    return encode_xor3_word(builder, b, c, d)


def _encode_md5_i_word(builder: CNFBuilder, b: list[int], c: list[int],
                       d: list[int]) -> list[int]:
    """I(b,c,d) = c ^ (b | ~d).

    Encode as: not_d = ~d, or_bd = b | not_d, out = c ^ or_bd.
    """
    from .bit_constraints import encode_not, encode_or, encode_xor
    out = builder.var_mgr.new_word("md5_i_out")
    for i in range(32):
        not_d = builder.var_mgr.new_var()
        encode_not(builder, d[i], not_d)
        or_bd = builder.var_mgr.new_var()
        encode_or(builder, b[i], not_d, or_bd)
        encode_xor(builder, c[i], or_bd, out[i])
    return out


class MD5Encoder:
    """Encodes reduced-round MD5 as a SAT problem."""

    def __init__(self, num_rounds: int):
        self.num_rounds = min(num_rounds, 64)
        self.builder = CNFBuilder()
        self._message_vars: list[list[int]] = []

    def encode(self, fix_iv: bool = True) -> CNFBuilder:
        """Build full CNF encoding of MD5 compression."""
        # Allocate 16 message words
        self._message_vars = [
            self.builder.var_mgr.new_word(f"M{i}") for i in range(16)
        ]

        # Initial state
        state = self._encode_initial_state(fix_iv)
        self._state_vars = [state]

        # Steps
        for step in range(self.num_rounds):
            state = self._encode_step(state, step)
            self._state_vars.append(state)

        return self.builder

    def _encode_initial_state(self, fix_iv: bool) -> list[list[int]]:
        names = ['a', 'b', 'c', 'd']
        state = [self.builder.var_mgr.new_word(f"{n}_0") for n in names]
        if fix_iv:
            for i, word_vars in enumerate(state):
                self.builder.fix_word_value(word_vars, MD5_H0[i])
        return state

    def _encode_step(self, state: list[list[int]], step: int) -> list[list[int]]:
        """Encode one MD5 step.

        MD5 step:
            f = F/G/H/I(b, c, d)
            temp = a + f + K[step] + M[g]
            new_b = b + ROTL(temp, s)
            new state = [d, new_b, b, c]
        """
        a, b, c, d = state

        # Round function
        if step < 16:
            f = _encode_md5_f_word(self.builder, b, c, d)
        elif step < 32:
            f = _encode_md5_g_word(self.builder, b, c, d)
        elif step < 48:
            f = _encode_md5_h_word(self.builder, b, c, d)
        else:
            f = _encode_md5_i_word(self.builder, b, c, d)

        g = MD5_G[step]

        # temp = a + f
        t1 = self.builder.var_mgr.new_word(f"md5_t1_s{step}")
        encode_modular_add(self.builder, a, f, t1)

        # t2 = t1 + K[step]
        t2 = self.builder.var_mgr.new_word(f"md5_t2_s{step}")
        encode_modular_add_const(self.builder, t1, MD5_K[step], t2)

        # t3 = t2 + M[g]
        t3 = self.builder.var_mgr.new_word(f"md5_t3_s{step}")
        encode_modular_add(self.builder, t2, self._message_vars[g], t3)

        # rotated = ROTL(t3, S[step])
        rotated = rotate_left(t3, MD5_S[step])

        # new_b = b + rotated
        new_b = self.builder.var_mgr.new_word(f"b_{step + 1}")
        encode_modular_add(self.builder, b, rotated, new_b)

        return [d, new_b, b, c]

    @property
    def message_vars(self) -> list[list[int]]:
        return self._message_vars

    @property
    def output_state_vars(self) -> list[list[int]]:
        return self._state_vars[-1] if self._state_vars else []
