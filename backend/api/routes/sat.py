"""SAT encoding API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from src.sat_encoding.hash_encoder import SHA256Encoder, CollisionEncoder

router = APIRouter()


class EncodeRequest(BaseModel):
    hash_function: str = Field(default="sha256")
    num_rounds: int = Field(default=8, ge=1, le=64)
    encode_type: str = Field(default="single", description="single or collision")


@router.post("/encode")
async def encode_to_cnf(req: EncodeRequest):
    """Encode hash function as CNF and return statistics."""
    if req.hash_function != "sha256":
        raise HTTPException(400, "Only sha256 is currently supported for SAT encoding")

    if req.encode_type == "single":
        encoder = SHA256Encoder(req.num_rounds)
        builder = encoder.encode(fix_iv=True)
    elif req.encode_type == "collision":
        encoder = CollisionEncoder(req.num_rounds)
        builder = encoder.encode()
    else:
        raise HTTPException(400, f"Unknown encode_type: {req.encode_type}")

    stats = builder.stats()

    return {
        "hash_function": req.hash_function,
        "num_rounds": req.num_rounds,
        "encode_type": req.encode_type,
        "num_variables": stats["num_vars"],
        "num_clauses": stats["num_clauses"],
        "clause_length_distribution": stats["clause_lengths"],
    }


@router.post("/encode-and-download")
async def encode_and_download(req: EncodeRequest):
    """Encode hash function and return DIMACS CNF content."""
    if req.hash_function != "sha256":
        raise HTTPException(400, "Only sha256 is currently supported")

    if req.encode_type == "single":
        encoder = SHA256Encoder(req.num_rounds)
        builder = encoder.encode(fix_iv=True)
    elif req.encode_type == "collision":
        encoder = CollisionEncoder(req.num_rounds)
        builder = encoder.encode()
    else:
        raise HTTPException(400, f"Unknown encode_type: {req.encode_type}")

    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(
        content=builder.to_dimacs(),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename=sha256_r{req.num_rounds}_{req.encode_type}.cnf"},
    )
