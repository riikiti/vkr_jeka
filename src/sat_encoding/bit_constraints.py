"""SAT encoding of basic bitwise operations."""

from __future__ import annotations

from .cnf_builder import CNFBuilder


def encode_not(builder: CNFBuilder, x: int, z: int) -> None:
    """z = NOT x (2 clauses)."""
    builder.add_clause([x, z])
    builder.add_clause([-x, -z])


def encode_and(builder: CNFBuilder, x: int, y: int, z: int) -> None:
    """z = x AND y (3 clauses)."""
    builder.add_clause([-x, -y, z])
    builder.add_clause([x, -z])
    builder.add_clause([y, -z])


def encode_or(builder: CNFBuilder, x: int, y: int, z: int) -> None:
    """z = x OR y (3 clauses)."""
    builder.add_clause([x, y, -z])
    builder.add_clause([-x, z])
    builder.add_clause([-y, z])


def encode_xor(builder: CNFBuilder, x: int, y: int, z: int) -> None:
    """z = x XOR y (4 clauses)."""
    builder.add_clause([-x, -y, -z])
    builder.add_clause([-x, y, z])
    builder.add_clause([x, -y, z])
    builder.add_clause([x, y, -z])


def encode_xor3(builder: CNFBuilder, x: int, y: int, w: int, z: int) -> None:
    """z = x XOR y XOR w (8 clauses).

    Each clause forbids one invalid assignment (where z != x^y^w).
    """
    builder.add_clause([x, y, w, -z])       # forbid (0,0,0,1)
    builder.add_clause([x, y, -w, z])        # forbid (0,0,1,0)
    builder.add_clause([x, -y, w, z])        # forbid (0,1,0,0)
    builder.add_clause([x, -y, -w, -z])      # forbid (0,1,1,1)
    builder.add_clause([-x, y, w, z])        # forbid (1,0,0,0)
    builder.add_clause([-x, y, -w, -z])      # forbid (1,0,1,1)
    builder.add_clause([-x, -y, w, -z])      # forbid (1,1,0,1)
    builder.add_clause([-x, -y, -w, z])      # forbid (1,1,1,0)


def encode_equal(builder: CNFBuilder, a: int, b: int) -> None:
    """a = b (2 clauses)."""
    builder.add_clause([-a, b])
    builder.add_clause([a, -b])


def encode_not_equal(builder: CNFBuilder, a: int, b: int) -> None:
    """a != b, i.e., a XOR b = 1 (2 clauses)."""
    builder.add_clause([a, b])
    builder.add_clause([-a, -b])


def encode_ch_bit(builder: CNFBuilder, x: int, y: int, z: int, out: int) -> None:
    """Encode one bit of Ch(x, y, z) = (x & y) ^ (~x & z) = z ^ (x & (y ^ z)).

    Uses 2 auxiliary variables, 11 clauses.
    """
    t1 = builder.var_mgr.new_var()  # t1 = y XOR z
    t2 = builder.var_mgr.new_var()  # t2 = x AND t1
    encode_xor(builder, y, z, t1)
    encode_and(builder, x, t1, t2)
    encode_xor(builder, z, t2, out)


def encode_maj_bit(builder: CNFBuilder, x: int, y: int, z: int, out: int) -> None:
    """Encode one bit of Maj(x, y, z) = (x & y) | (z & (x ^ y)).

    Uses 3 auxiliary variables, 14 clauses.
    """
    t1 = builder.var_mgr.new_var()  # t1 = x XOR y
    t2 = builder.var_mgr.new_var()  # t2 = z AND t1
    t3 = builder.var_mgr.new_var()  # t3 = x AND y
    encode_xor(builder, x, y, t1)
    encode_and(builder, z, t1, t2)
    encode_and(builder, x, y, t3)
    encode_or(builder, t2, t3, out)


def encode_ch_word(builder: CNFBuilder, x: list[int], y: list[int],
                   z: list[int]) -> list[int]:
    """Encode 32-bit Ch(x, y, z). Returns output word variables."""
    out = builder.var_mgr.new_word("ch_out")
    for i in range(32):
        encode_ch_bit(builder, x[i], y[i], z[i], out[i])
    return out


def encode_maj_word(builder: CNFBuilder, x: list[int], y: list[int],
                    z: list[int]) -> list[int]:
    """Encode 32-bit Maj(x, y, z). Returns output word variables."""
    out = builder.var_mgr.new_word("maj_out")
    for i in range(32):
        encode_maj_bit(builder, x[i], y[i], z[i], out[i])
    return out


def encode_xor_word(builder: CNFBuilder, x: list[int], y: list[int]) -> list[int]:
    """Encode 32-bit XOR. Returns output word variables."""
    out = builder.var_mgr.new_word("xor_out")
    for i in range(32):
        encode_xor(builder, x[i], y[i], out[i])
    return out


def encode_xor3_word(builder: CNFBuilder, x: list[int], y: list[int],
                     w: list[int]) -> list[int]:
    """Encode 32-bit 3-way XOR. Returns output word variables."""
    out = builder.var_mgr.new_word("xor3_out")
    for i in range(32):
        encode_xor3(builder, x[i], y[i], w[i], out[i])
    return out
