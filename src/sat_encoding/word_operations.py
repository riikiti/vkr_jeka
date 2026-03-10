"""SAT encoding of word-level operations (modular addition, rotations, shifts)."""

from __future__ import annotations

from .cnf_builder import CNFBuilder
from .bit_constraints import encode_xor3, encode_maj_bit


def rotate_right(bits: list[int], r: int) -> list[int]:
    """ROTR: rearrange variable indices (no new clauses needed)."""
    n = len(bits)
    return [bits[(i + r) % n] for i in range(n)]


def rotate_left(bits: list[int], r: int) -> list[int]:
    """ROTL: rearrange variable indices (no new clauses needed)."""
    n = len(bits)
    return [bits[(i - r) % n] for i in range(n)]


def shift_right(builder: CNFBuilder, bits: list[int], r: int) -> list[int]:
    """SHR: top r bits are fixed to 0, bottom bits shifted.

    Returns new list of variables with top r bits constrained to False.
    """
    zero_vars = []
    for _ in range(r):
        v = builder.var_mgr.new_var()
        builder.fix_false(v)
        zero_vars.append(v)
    # Result: [bits[r], bits[r+1], ..., bits[31], 0, 0, ..., 0]
    return bits[r:] + zero_vars


def encode_modular_add(builder: CNFBuilder, x: list[int], y: list[int],
                       z: list[int]) -> None:
    """Encode z = (x + y) mod 2^32 using ripple-carry adder.

    x, y, z: lists of 32 variable IDs (LSB first).

    Produces ~32 * 22 = ~704 clauses and 32 carry variables.
    """
    assert len(x) == len(y) == len(z) == 32

    # Initial carry = 0
    carry = builder.var_mgr.new_var("carry_0")
    builder.fix_false(carry)

    for i in range(32):
        new_carry = builder.var_mgr.new_var(f"carry_{i + 1}")

        # z[i] = x[i] XOR y[i] XOR carry (8 clauses)
        encode_xor3(builder, x[i], y[i], carry, z[i])

        # new_carry = Maj(x[i], y[i], carry) (14 clauses)
        encode_maj_bit(builder, x[i], y[i], carry, new_carry)

        carry = new_carry
    # MSB carry is discarded (mod 2^32)


def encode_modular_add_const(builder: CNFBuilder, x: list[int], const: int,
                             z: list[int]) -> None:
    """Encode z = (x + const) mod 2^32.

    Constant bits are inlined, reducing the number of clauses.
    """
    assert len(x) == len(z) == 32

    carry = builder.var_mgr.new_var()
    builder.fix_false(carry)

    for i in range(32):
        bit = (const >> i) & 1
        new_carry = builder.var_mgr.new_var()

        if bit == 0:
            # z[i] = x[i] XOR carry, new_carry = x[i] AND carry
            from .bit_constraints import encode_xor, encode_and
            encode_xor(builder, x[i], carry, z[i])
            encode_and(builder, x[i], carry, new_carry)
        else:
            # Adding 1: z[i] = x[i] XNOR carry = NOT(x[i] XOR carry)
            # z[i] = NOT(x[i] XOR carry)
            t = builder.var_mgr.new_var()
            from .bit_constraints import encode_xor, encode_not, encode_or
            encode_xor(builder, x[i], carry, t)
            encode_not(builder, t, z[i])
            # new_carry = x[i] OR carry
            encode_or(builder, x[i], carry, new_carry)

        carry = new_carry


def encode_sigma0_sha256(builder: CNFBuilder, x: list[int]) -> list[int]:
    """Encode SHA-256 Sigma0: ROTR2(x) XOR ROTR13(x) XOR ROTR22(x)."""
    from .bit_constraints import encode_xor3_word
    r2 = rotate_right(x, 2)
    r13 = rotate_right(x, 13)
    r22 = rotate_right(x, 22)
    return encode_xor3_word(builder, r2, r13, r22)


def encode_sigma1_sha256(builder: CNFBuilder, x: list[int]) -> list[int]:
    """Encode SHA-256 Sigma1: ROTR6(x) XOR ROTR11(x) XOR ROTR25(x)."""
    from .bit_constraints import encode_xor3_word
    r6 = rotate_right(x, 6)
    r11 = rotate_right(x, 11)
    r25 = rotate_right(x, 25)
    return encode_xor3_word(builder, r6, r11, r25)


def encode_little_sigma0_sha256(builder: CNFBuilder, x: list[int]) -> list[int]:
    """Encode SHA-256 sigma0: ROTR7(x) XOR ROTR18(x) XOR SHR3(x)."""
    from .bit_constraints import encode_xor3_word
    r7 = rotate_right(x, 7)
    r18 = rotate_right(x, 18)
    s3 = shift_right(builder, x, 3)
    return encode_xor3_word(builder, r7, r18, s3)


def encode_little_sigma1_sha256(builder: CNFBuilder, x: list[int]) -> list[int]:
    """Encode SHA-256 sigma1: ROTR17(x) XOR ROTR19(x) XOR SHR10(x)."""
    from .bit_constraints import encode_xor3_word
    r17 = rotate_right(x, 17)
    r19 = rotate_right(x, 19)
    s10 = shift_right(builder, x, 10)
    return encode_xor3_word(builder, r17, r19, s10)
