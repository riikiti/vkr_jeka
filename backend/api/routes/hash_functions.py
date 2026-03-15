"""Hash function API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from src.hash_functions.sha256 import SHA256Reduced
from src.hash_functions.sha1 import SHA1Reduced
from src.hash_functions.md5 import MD5Reduced
from src.hash_functions.md4 import MD4Reduced

router = APIRouter()

HASH_FUNCTIONS = {
    "sha256": {"name": "SHA-256", "max_rounds": 64, "hash_size": 256},
    "sha1": {"name": "SHA-1", "max_rounds": 80, "hash_size": 160},
    "md5": {"name": "MD5", "max_rounds": 64, "hash_size": 128},
    "md4": {"name": "MD4", "max_rounds": 48, "hash_size": 128},
}


class HashRequest(BaseModel):
    hash_function: str = Field(..., description="Hash function name: sha256 or sha1")
    num_rounds: int = Field(..., ge=1, description="Number of rounds")
    message_hex: str = Field(..., description="Message as hex string")


class CompareRequest(BaseModel):
    hash_function: str
    num_rounds: int = Field(..., ge=1)
    message1_hex: str
    message2_hex: str


@router.get("/list")
async def list_hash_functions():
    """List available hash functions and their parameters."""
    return HASH_FUNCTIONS


@router.post("/compute")
async def compute_hash(req: HashRequest):
    """Compute hash of a message."""
    try:
        msg = bytes.fromhex(req.message_hex)
    except ValueError:
        raise HTTPException(400, "Invalid hex string")

    h = _get_hash_func(req.hash_function, req.num_rounds)
    result = h.hash(msg)

    return {
        "hash_hex": result.hex(),
        "hash_function": req.hash_function,
        "num_rounds": req.num_rounds,
        "message_length": len(msg),
    }


@router.post("/compare")
async def compare_hashes(req: CompareRequest):
    """Compute and compare hashes of two messages."""
    try:
        m1 = bytes.fromhex(req.message1_hex)
        m2 = bytes.fromhex(req.message2_hex)
    except ValueError:
        raise HTTPException(400, "Invalid hex string")

    h = _get_hash_func(req.hash_function, req.num_rounds)
    h1 = h.hash(m1)
    h2 = h.hash(m2)

    xor_diff = int.from_bytes(h1, 'big') ^ int.from_bytes(h2, 'big')

    return {
        "hash1_hex": h1.hex(),
        "hash2_hex": h2.hex(),
        "hashes_equal": h1 == h2,
        "xor_diff_hex": f"{xor_diff:0{len(h1)*2}x}",
        "hamming_distance": bin(xor_diff).count('1'),
    }


def _get_hash_func(name: str, num_rounds: int):
    info = HASH_FUNCTIONS.get(name)
    if not info:
        raise HTTPException(400, f"Unknown hash function: {name}. "
                            f"Available: {', '.join(HASH_FUNCTIONS)}")
    if num_rounds > info["max_rounds"]:
        raise HTTPException(400, f"{info['name']} max rounds is {info['max_rounds']}")

    constructors = {
        "sha256": SHA256Reduced,
        "sha1": SHA1Reduced,
        "md5": MD5Reduced,
        "md4": MD4Reduced,
    }
    return constructors[name](num_rounds)
