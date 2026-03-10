"""Tests for SHA-1 reduced-round implementation."""

import hashlib
import pytest

from src.hash_functions.sha1 import SHA1Reduced


class TestSHA1Full:
    """Test full 80-round SHA-1 against hashlib."""

    def test_empty_message(self):
        sha = SHA1Reduced(num_rounds=80)
        expected = hashlib.sha1(b"").hexdigest()
        assert sha.hash(b"").hex() == expected

    def test_abc(self):
        sha = SHA1Reduced(num_rounds=80)
        expected = hashlib.sha1(b"abc").hexdigest()
        assert sha.hash(b"abc").hex() == expected

    def test_longer_message(self):
        sha = SHA1Reduced(num_rounds=80)
        msg = b"The quick brown fox jumps over the lazy dog"
        expected = hashlib.sha1(msg).hexdigest()
        assert sha.hash(msg).hex() == expected


class TestSHA1Reduced:
    """Test reduced-round variants."""

    def test_deterministic(self):
        sha = SHA1Reduced(num_rounds=20)
        msg = b"test"
        assert sha.hash(msg) == sha.hash(msg)

    def test_different_messages(self):
        sha = SHA1Reduced(num_rounds=20)
        assert sha.hash(b"a") != sha.hash(b"b")

    def test_invalid_rounds(self):
        with pytest.raises(ValueError):
            SHA1Reduced(num_rounds=0)
        with pytest.raises(ValueError):
            SHA1Reduced(num_rounds=81)

    def test_compress_trace(self):
        sha = SHA1Reduced(num_rounds=20)
        iv = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0]
        block = [0] * 16
        trace = sha.compress_trace(iv, block)
        assert len(trace) == 21
        assert trace[0] == iv
