"""Tests for SHA-256 reduced-round implementation."""

import hashlib
import pytest

from src.hash_functions.sha256 import SHA256Reduced


class TestSHA256Full:
    """Test full 64-round SHA-256 against Python's hashlib."""

    def test_empty_message(self):
        sha = SHA256Reduced(num_rounds=64)
        expected = hashlib.sha256(b"").hexdigest()
        assert sha.hash(b"").hex() == expected

    def test_abc(self):
        sha = SHA256Reduced(num_rounds=64)
        expected = hashlib.sha256(b"abc").hexdigest()
        assert sha.hash(b"abc").hex() == expected

    def test_longer_message(self):
        sha = SHA256Reduced(num_rounds=64)
        msg = b"The quick brown fox jumps over the lazy dog"
        expected = hashlib.sha256(msg).hexdigest()
        assert sha.hash(msg).hex() == expected

    def test_exact_block_size(self):
        sha = SHA256Reduced(num_rounds=64)
        msg = b"a" * 55  # Exactly fills one block after padding
        expected = hashlib.sha256(msg).hexdigest()
        assert sha.hash(msg).hex() == expected

    def test_two_blocks(self):
        sha = SHA256Reduced(num_rounds=64)
        msg = b"a" * 56  # Requires two blocks
        expected = hashlib.sha256(msg).hexdigest()
        assert sha.hash(msg).hex() == expected


class TestSHA256Reduced:
    """Test reduced-round variants."""

    def test_deterministic(self):
        sha = SHA256Reduced(num_rounds=16)
        msg = b"test"
        assert sha.hash(msg) == sha.hash(msg)

    def test_different_messages_different_hashes(self):
        sha = SHA256Reduced(num_rounds=16)
        assert sha.hash(b"hello") != sha.hash(b"world")

    def test_different_rounds_different_hashes(self):
        h8 = SHA256Reduced(num_rounds=8).hash(b"test")
        h16 = SHA256Reduced(num_rounds=16).hash(b"test")
        assert h8 != h16

    def test_invalid_rounds(self):
        with pytest.raises(ValueError):
            SHA256Reduced(num_rounds=0)
        with pytest.raises(ValueError):
            SHA256Reduced(num_rounds=65)

    def test_compress_trace_length(self):
        sha = SHA256Reduced(num_rounds=16)
        iv = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
              0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
        block = [0] * 16
        trace = sha.compress_trace(iv, block)
        assert len(trace) == 17  # initial + 16 rounds

    def test_compress_trace_first_equals_input(self):
        sha = SHA256Reduced(num_rounds=8)
        iv = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
              0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
        block = [0] * 16
        trace = sha.compress_trace(iv, block)
        assert trace[0] == iv


class TestSHA256Operations:
    """Test individual SHA-256 operations."""

    def test_ch(self):
        from src.hash_functions.sha256 import _ch
        # Ch(1111, AAAA, 5555) = AAAA (selects y when x=1)
        assert _ch(0xFFFFFFFF, 0xAAAAAAAA, 0x55555555) == 0xAAAAAAAA
        # Ch(0000, AAAA, 5555) = 5555 (selects z when x=0)
        assert _ch(0x00000000, 0xAAAAAAAA, 0x55555555) == 0x55555555

    def test_maj(self):
        from src.hash_functions.sha256 import _maj
        assert _maj(0xFF, 0xFF, 0x00) == 0xFF
        assert _maj(0xFF, 0x00, 0x00) == 0x00
        assert _maj(0xFF, 0x0F, 0x0F) == 0x0F

    def test_rotr(self):
        from src.hash_functions.sha256 import _rotr
        assert _rotr(0x80000000, 1) == 0x40000000
        assert _rotr(0x00000001, 1) == 0x80000000
