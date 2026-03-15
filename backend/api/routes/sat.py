"""SAT encoding API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from src.sat_encoding.hash_encoder import SHA256Encoder, CollisionEncoder
from src.sat_encoding.md5_encoder import MD5Encoder
from src.sat_encoding.md4_encoder import MD4Encoder

router = APIRouter()

SINGLE_ENCODERS = {
    "sha256": (SHA256Encoder, 64),
    "md5": (MD5Encoder, 64),
    "md4": (MD4Encoder, 48),
}


class EncodeRequest(BaseModel):
    hash_function: str = Field(default="sha256")
    num_rounds: int = Field(default=8, ge=1)
    encode_type: str = Field(default="single", description="single or collision")


def _build_cnf(req: EncodeRequest):
    """Build CNF for any supported hash function and encode type."""
    hf = req.hash_function.lower()
    if req.encode_type == "single":
        entry = SINGLE_ENCODERS.get(hf)
        if entry is None:
            raise HTTPException(400, f"Unknown hash function: {hf}. "
                                f"Available: {', '.join(SINGLE_ENCODERS)}")
        EncoderClass, max_rounds = entry
        rounds = min(req.num_rounds, max_rounds)
        encoder = EncoderClass(rounds)
        return encoder.encode(fix_iv=True)
    elif req.encode_type == "collision":
        # CollisionEncoder supports sha256, md5, md4
        try:
            encoder = CollisionEncoder(req.num_rounds, hash_function=hf)
            return encoder.encode()
        except ValueError as e:
            raise HTTPException(400, str(e))
    else:
        raise HTTPException(400, f"Unknown encode_type: {req.encode_type}")


@router.post("/encode")
async def encode_to_cnf(req: EncodeRequest):
    """Encode hash function as CNF and return statistics."""
    builder = _build_cnf(req)
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
    builder = _build_cnf(req)

    from fastapi.responses import PlainTextResponse
    hf = req.hash_function.lower()
    return PlainTextResponse(
        content=builder.to_dimacs(),
        media_type="text/plain",
        headers={"Content-Disposition": f"attachment; filename={hf}_r{req.num_rounds}_{req.encode_type}.cnf"},
    )
