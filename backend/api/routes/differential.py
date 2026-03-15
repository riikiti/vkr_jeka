"""Differential analysis API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from src.differential.propagation import (
    modadd_xor_differential_prob,
    ch_differential_prob_bit,
    maj_differential_prob_bit,
    sigma0_sha256_diff,
    sigma1_sha256_diff,
)
from src.differential.probability import estimate_characteristic_probability
from src.hash_functions.sha256 import SHA256Reduced
from src.hash_functions.sha1 import SHA1Reduced
from src.hash_functions.md5 import MD5Reduced
from src.hash_functions.md4 import MD4Reduced

router = APIRouter()


class DiffProbRequest(BaseModel):
    operation: str = Field(..., description="Operation: modadd, ch, maj")
    dx: str = Field(..., description="Input diff X as hex")
    dy: str = Field("0", description="Input diff Y as hex")
    dz: str = Field("0", description="Input/output diff Z as hex")


class ValidateRequest(BaseModel):
    hash_function: str = Field(default="sha256")
    num_rounds: int = Field(default=8, ge=1)
    message_diff: list[str] = Field(..., description="16 hex strings for message diff")
    num_samples: int = Field(default=65536, ge=1, le=10_000_000)
    seed: int = Field(default=42)


@router.post("/probability")
async def compute_differential_probability(req: DiffProbRequest):
    """Compute probability of a differential through a single operation."""
    try:
        dx = int(req.dx, 16)
        dy = int(req.dy, 16)
        dz = int(req.dz, 16)
    except ValueError:
        raise HTTPException(400, "Invalid hex value")

    if req.operation == "modadd":
        prob = modadd_xor_differential_prob(dx, dy, dz)
        return {"operation": "modadd", "probability": prob}
    elif req.operation == "ch":
        log2_prob = ch_differential_prob_bit(dx, dy, dz)
        return {"operation": "ch", "log2_probability": log2_prob}
    elif req.operation == "maj":
        log2_prob = maj_differential_prob_bit(dx, dy, dz)
        return {"operation": "maj", "log2_probability": log2_prob}
    else:
        raise HTTPException(400, f"Unknown operation: {req.operation}")


@router.post("/validate")
async def validate_characteristic(req: ValidateRequest):
    """Experimentally validate a differential characteristic."""
    if len(req.message_diff) != 16:
        raise HTTPException(400, "message_diff must have exactly 16 elements")

    try:
        msg_diff = [int(x, 16) for x in req.message_diff]
    except ValueError:
        raise HTTPException(400, "Invalid hex in message_diff")

    hash_map = {
        "sha256": SHA256Reduced,
        "sha1": SHA1Reduced,
        "md5": MD5Reduced,
        "md4": MD4Reduced,
    }
    hash_cls = hash_map.get(req.hash_function)
    if hash_cls is None:
        raise HTTPException(400, f"Unknown hash function: {req.hash_function}. "
                            f"Available: {', '.join(hash_map)}")

    result = estimate_characteristic_probability(
        hash_cls, req.num_rounds, msg_diff,
        num_samples=req.num_samples, seed=req.seed,
    )

    return {
        "hash_function": req.hash_function,
        "num_rounds": req.num_rounds,
        **result,
    }


@router.post("/sigma-propagation")
async def sigma_propagation(delta_hex: str, sigma_type: str = "sigma0"):
    """Compute differential propagation through Sigma functions."""
    try:
        delta = int(delta_hex, 16)
    except ValueError:
        raise HTTPException(400, "Invalid hex")

    if sigma_type == "sigma0":
        result = sigma0_sha256_diff(delta)
    elif sigma_type == "sigma1":
        result = sigma1_sha256_diff(delta)
    else:
        raise HTTPException(400, f"Unknown sigma type: {sigma_type}")

    return {"input": f"0x{delta:08x}", "output": f"0x{result:08x}", "type": sigma_type}
