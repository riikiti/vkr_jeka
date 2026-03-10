"""Experiments API routes."""

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import BaseModel, Field
import uuid
import time
import json

router = APIRouter()

# In-memory experiment store (in production, use a database)
_experiments: dict[str, dict] = {}


class ExperimentConfig(BaseModel):
    hash_function: str = Field(default="sha256")
    num_rounds: int = Field(default=8, ge=1)
    method: str = Field(default="combined", description="pure_sat, pure_differential, combined")
    combined_strategy: str = Field(default="sequential", description="sequential, iterative, hybrid")
    solver: str = Field(default="cadical153")
    timeout: int = Field(default=300, ge=1)
    seed: int = Field(default=42)
    probability_threshold_log2: float = Field(default=-30.0)
    max_characteristics: int = Field(default=10, ge=1)
    repetitions: int = Field(default=1, ge=1, le=20)
    comment: str = Field(default="")


@router.post("/run")
async def run_experiment(config: ExperimentConfig):
    """Start a new experiment (synchronous for now)."""
    exp_id = str(uuid.uuid4())[:8]

    _experiments[exp_id] = {
        "id": exp_id,
        "config": config.model_dump(),
        "status": "running",
        "started_at": time.time(),
        "results": None,
    }

    try:
        # Import here to avoid circular dependencies
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

        if config.method == "combined" and config.combined_strategy == "sequential":
            from src.combined.sequential import sequential_attack

            result = sequential_attack(
                num_rounds=config.num_rounds,
                solver_name=config.solver,
                timeout_per_char=config.timeout,
                max_characteristics=config.max_characteristics,
            )

            _experiments[exp_id]["status"] = "completed"
            _experiments[exp_id]["completed_at"] = time.time()
            _experiments[exp_id]["results"] = {
                "success": result.success,
                "total_time": result.total_time,
                "characteristics_tried": result.characteristics_tried,
                "encoding_time": result.encoding_time,
                "solving_time": result.solving_time,
                "m1_words": [f"0x{w:08x}" for w in result.m1_words] if result.success else None,
                "m2_words": [f"0x{w:08x}" for w in result.m2_words] if result.success else None,
                "solver_stats": result.solver_output.stats.to_dict() if result.solver_output else None,
            }
        else:
            _experiments[exp_id]["status"] = "completed"
            _experiments[exp_id]["results"] = {"message": "Method not yet implemented"}

    except Exception as e:
        _experiments[exp_id]["status"] = "failed"
        _experiments[exp_id]["error"] = str(e)

    return _experiments[exp_id]


@router.get("/list")
async def list_experiments():
    """List all experiments."""
    return list(_experiments.values())


@router.get("/{exp_id}")
async def get_experiment(exp_id: str):
    """Get experiment details."""
    if exp_id not in _experiments:
        raise HTTPException(404, "Experiment not found")
    return _experiments[exp_id]


@router.delete("/{exp_id}")
async def delete_experiment(exp_id: str):
    """Delete an experiment."""
    if exp_id not in _experiments:
        raise HTTPException(404, "Experiment not found")
    del _experiments[exp_id]
    return {"deleted": exp_id}
