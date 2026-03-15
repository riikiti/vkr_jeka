"""SAT encoding of reduced-round MD4 compression function."""

from __future__ import annotations

from .cnf_builder import CNFBuilder
from .bit_constraints import encode_ch_word, encode_maj_word
from .word_operations import encode_modular_add, encode_modular_add_const, rotate_left
from ..hash_functions.md4 import K_VALUES as MD4_K, S as MD4_S, G_IDX as MD4_G, H0 as MD4_H0


def _encode_md4_f_word(builder: CNFBuilder, b: list[int], c: list[int],
                       d: list[int]) -> list[int]:
    """F(b,c,d) = (b & c) | (~b & d) — same as Ch."""
    return encode_ch_word(builder, b, c, d)


def _encode_md4_g_word(builder: CNFBuilder, b: list[int], c: list[int],
                       d: list[int]) -> list[int]:
    """G(b,c,d) = (b & c) | (b & d) | (c & d) — same as Maj."""
    return encode_maj_word(builder, b, c, d)


def _encode_md4_h_word(builder: CNFBuilder, b: list[int], c: list[int],
                       d: list[int]) -> list[int]:
    """H(b,c,d) = b ^ c ^ d."""
    from .bit_constraints import encode_xor3_word
    return encode_xor3_word(builder, b, c, d)


class MD4Encoder:
    """Encodes reduced-round MD4 as a SAT problem."""

    def __init__(self, num_rounds: int):
        self.num_rounds = min(num_rounds, 48)
        self.builder = CNFBuilder()
        self._message_vars: list[list[int]] = []

    def encode(self, fix_iv: bool = True) -> CNFBuilder:
        """Build full CNF encoding of MD4 compression."""
        self._message_vars = [
            self.builder.var_mgr.new_word(f"M{i}") for i in range(16)
        ]

        state = self._encode_initial_state(fix_iv)
        self._state_vars = [state]

        for step in range(self.num_rounds):
            state = self._encode_step(state, step)
            self._state_vars.append(state)

        return self.builder

    def _encode_initial_state(self, fix_iv: bool) -> list[list[int]]:
        names = ['a', 'b', 'c', 'd']
        state = [self.builder.var_mgr.new_word(f"{n}_0") for n in names]
        if fix_iv:
            for i, word_vars in enumerate(state):
                self.builder.fix_word_value(word_vars, MD4_H0[i])
        return state

    def _encode_step(self, state: list[list[int]], step: int) -> list[list[int]]:
        """Encode one MD4 step.

        MD4 step:
            f = F/G/H(b, c, d)
            temp = a + f + M[g] + K[round]
            new_b = ROTL(temp, s)
            new state = [d, new_b, b, c]
        """
        a, b, c, d = state

        # Round function
        if step < 16:
            f = _encode_md4_f_word(self.builder, b, c, d)
        elif step < 32:
            f = _encode_md4_g_word(self.builder, b, c, d)
        else:
            f = _encode_md4_h_word(self.builder, b, c, d)

        g = MD4_G[step]
        rnd = step // 16

        # t1 = a + f
        t1 = self.builder.var_mgr.new_word(f"md4_t1_s{step}")
        encode_modular_add(self.builder, a, f, t1)

        # t2 = t1 + M[g]
        t2 = self.builder.var_mgr.new_word(f"md4_t2_s{step}")
        encode_modular_add(self.builder, t1, self._message_vars[g], t2)

        # t3 = t2 + K[round]
        if MD4_K[rnd] == 0:
            t3 = t2  # No-op for round 1 (K=0)
        else:
            t3 = self.builder.var_mgr.new_word(f"md4_t3_s{step}")
            encode_modular_add_const(self.builder, t2, MD4_K[rnd], t3)

        # new_b = ROTL(t3, S[step])
        new_b = rotate_left(t3, MD4_S[step])

        return [d, new_b, b, c]

    @property
    def message_vars(self) -> list[list[int]]:
        return self._message_vars

    @property
    def output_state_vars(self) -> list[list[int]]:
        return self._state_vars[-1] if self._state_vars else []
