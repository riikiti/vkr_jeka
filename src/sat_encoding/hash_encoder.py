"""Full SAT encoding of hash function rounds."""

from __future__ import annotations

from .cnf_builder import CNFBuilder
from .bit_constraints import encode_ch_word, encode_maj_word, encode_equal, encode_not_equal
from .word_operations import (
    encode_modular_add,
    encode_modular_add_const,
    encode_sigma0_sha256,
    encode_sigma1_sha256,
    encode_little_sigma0_sha256,
    encode_little_sigma1_sha256,
)
from ..hash_functions.sha256 import K as SHA256_K, H0 as SHA256_H0


class SHA256Encoder:
    """Encodes reduced-round SHA-256 as a SAT problem."""

    def __init__(self, num_rounds: int):
        self.num_rounds = num_rounds
        self.builder = CNFBuilder()
        self._message_vars: list[list[int]] = []  # W[0..15]
        self._schedule_vars: list[list[int]] = []  # W[0..num_rounds-1]
        self._state_vars: list[list[list[int]]] = []  # state[round][word_idx]

    def encode(self, fix_iv: bool = True) -> CNFBuilder:
        """Build full CNF encoding.

        Args:
            fix_iv: If True, fix initial state to SHA-256 IV.

        Returns:
            The CNFBuilder with all clauses.
        """
        # Allocate message word variables (W[0..15])
        self._message_vars = [
            self.builder.var_mgr.new_word(f"W{i}") for i in range(16)
        ]

        # Message schedule
        self._encode_message_schedule()

        # Initial state
        state = self._encode_initial_state(fix_iv)
        self._state_vars = [state]

        # Rounds
        for r in range(self.num_rounds):
            state = self._encode_round(state, r)
            self._state_vars.append(state)

        return self.builder

    def _encode_message_schedule(self) -> None:
        """Encode message schedule W[16..num_rounds-1]."""
        self._schedule_vars = list(self._message_vars)  # W[0..15]

        for i in range(16, self.num_rounds):
            # W[i] = sigma1(W[i-2]) + W[i-7] + sigma0(W[i-15]) + W[i-16]
            s1 = encode_little_sigma1_sha256(self.builder, self._schedule_vars[i - 2])
            s0 = encode_little_sigma0_sha256(self.builder, self._schedule_vars[i - 15])

            t1 = self.builder.var_mgr.new_word(f"Wt1_{i}")
            encode_modular_add(self.builder, s1, self._schedule_vars[i - 7], t1)

            t2 = self.builder.var_mgr.new_word(f"Wt2_{i}")
            encode_modular_add(self.builder, s0, self._schedule_vars[i - 16], t2)

            w_i = self.builder.var_mgr.new_word(f"W{i}")
            encode_modular_add(self.builder, t1, t2, w_i)
            self._schedule_vars.append(w_i)

    def _encode_initial_state(self, fix_iv: bool) -> list[list[int]]:
        """Allocate and optionally fix the initial hash state."""
        names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
        state = [self.builder.var_mgr.new_word(f"{n}_0") for n in names]
        if fix_iv:
            for i, word_vars in enumerate(state):
                self.builder.fix_word_value(word_vars, SHA256_H0[i])
        return state

    def _encode_round(self, state: list[list[int]], round_num: int) -> list[list[int]]:
        """Encode one SHA-256 round.

        state: [a, b, c, d, e, f, g, h] as lists of 32 variables each.
        Returns new state.
        """
        a, b, c, d, e, f, g, h = state
        r = round_num

        # Sigma1(e)
        sig1 = encode_sigma1_sha256(self.builder, e)

        # Ch(e, f, g)
        ch = encode_ch_word(self.builder, e, f, g)

        # T1 = h + Sigma1(e) + Ch(e,f,g) + K[r] + W[r]
        t1_1 = self.builder.var_mgr.new_word(f"t1_1_r{r}")
        encode_modular_add(self.builder, h, sig1, t1_1)

        t1_2 = self.builder.var_mgr.new_word(f"t1_2_r{r}")
        encode_modular_add(self.builder, t1_1, ch, t1_2)

        t1_3 = self.builder.var_mgr.new_word(f"t1_3_r{r}")
        encode_modular_add_const(self.builder, t1_2, SHA256_K[r], t1_3)

        T1 = self.builder.var_mgr.new_word(f"T1_r{r}")
        encode_modular_add(self.builder, t1_3, self._schedule_vars[r], T1)

        # Sigma0(a)
        sig0 = encode_sigma0_sha256(self.builder, a)

        # Maj(a, b, c)
        maj = encode_maj_word(self.builder, a, b, c)

        # T2 = Sigma0(a) + Maj(a,b,c)
        T2 = self.builder.var_mgr.new_word(f"T2_r{r}")
        encode_modular_add(self.builder, sig0, maj, T2)

        # new_e = d + T1
        new_e = self.builder.var_mgr.new_word(f"e_{r + 1}")
        encode_modular_add(self.builder, d, T1, new_e)

        # new_a = T1 + T2
        new_a = self.builder.var_mgr.new_word(f"a_{r + 1}")
        encode_modular_add(self.builder, T1, T2, new_a)

        return [new_a, a, b, c, new_e, e, f, g]

    @property
    def message_vars(self) -> list[list[int]]:
        return self._message_vars

    @property
    def output_state_vars(self) -> list[list[int]]:
        return self._state_vars[-1] if self._state_vars else []


class CollisionEncoder:
    """Encodes a collision-finding SAT problem for any supported hash function."""

    # Maps hash function name to (EncoderClass, num_state_words, max_rounds)
    HASH_ENCODERS = {
        "sha256": (SHA256Encoder, 8, 64),
    }

    def __init__(self, num_rounds: int, hash_function: str = "sha256"):
        self.num_rounds = num_rounds
        self.hash_function = hash_function.lower()
        self.builder = CNFBuilder()

    @classmethod
    def _get_encoder_info(cls, name: str):
        """Get encoder class and metadata; imports lazily to avoid circular deps."""
        name = name.lower()
        if name == "sha256":
            return SHA256Encoder, 8, 64
        elif name == "md5":
            from .md5_encoder import MD5Encoder
            return MD5Encoder, 4, 64
        elif name == "md4":
            from .md4_encoder import MD4Encoder
            return MD4Encoder, 4, 48
        else:
            raise ValueError(f"Unsupported hash function: {name}. "
                             f"Supported: sha256, md5, md4")

    def encode(self) -> CNFBuilder:
        """Build CNF for finding M != M' such that H(M) = H(M').

        Creates two copies of the hash function and constrains output equality.
        """
        EncoderClass, num_state_words, max_rounds = self._get_encoder_info(self.hash_function)
        rounds = min(self.num_rounds, max_rounds)

        # First copy
        enc1 = EncoderClass(rounds)
        enc1.builder = self.builder
        enc1.encode(fix_iv=True)

        msg1 = enc1.message_vars
        out1 = enc1.output_state_vars

        # Second copy (shares the same builder)
        enc2 = EncoderClass(rounds)
        enc2.builder = self.builder
        enc2.encode(fix_iv=True)

        msg2 = enc2.message_vars
        out2 = enc2.output_state_vars

        # Constrain: output states are equal
        for word_idx in range(num_state_words):
            for bit in range(32):
                encode_equal(self.builder, out1[word_idx][bit], out2[word_idx][bit])

        # Constrain: messages differ in at least one bit
        diff_vars = []
        for w in range(16):
            for bit in range(32):
                d = self.builder.var_mgr.new_var(f"msg_diff_{w}_{bit}")
                from .bit_constraints import encode_xor
                encode_xor(self.builder, msg1[w][bit], msg2[w][bit], d)
                diff_vars.append(d)

        # At least one diff bit must be 1
        self.builder.add_clause(diff_vars)

        self._msg1 = msg1
        self._msg2 = msg2

        return self.builder

    def fix_message_difference(self, delta_m: list[int]) -> None:
        """Fix the XOR difference between the two messages."""
        for w in range(16):
            for bit in range(32):
                if (delta_m[w] >> bit) & 1:
                    encode_not_equal(self.builder,
                                     self._msg1[w][bit], self._msg2[w][bit])
                else:
                    encode_equal(self.builder,
                                 self._msg1[w][bit], self._msg2[w][bit])
