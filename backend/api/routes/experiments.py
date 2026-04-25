"""Experiments API routes."""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
import asyncio
import itertools
import random
import threading
import uuid
import time
import os
import sys

router = APIRouter()

# Thread pool for parallel SAT solving (PySAT releases GIL during C++ solving)
_executor = ThreadPoolExecutor(max_workers=min(32, (os.cpu_count() or 4) * 2))

# In-memory stores
_experiments: dict[str, dict] = {}
_batches: dict[str, dict] = {}
_cancel_flags: dict[str, threading.Event] = {}  # exp_id → cancellation event

# Lock for batch counter updates (asyncio-safe)
_batch_locks: dict[str, asyncio.Lock] = {}


def shutdown_executor() -> None:
    """Gracefully shutdown the thread pool. Called from app lifespan."""
    _executor.shutdown(wait=False, cancel_futures=True)


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
    message_diffs: Optional[list[list[str]]] = Field(
        default=None,
        description="Custom message differences. Each diff is 16 hex strings (32-bit words). None = use defaults.",
    )
    comment: str = Field(default="")


class ParameterGrid(BaseModel):
    num_rounds: list[int] = Field(default_factory=lambda: [8])
    solver: list[str] = Field(default_factory=lambda: ["cadical153"])
    timeout: list[int] = Field(default_factory=lambda: [60])
    hash_function: list[str] = Field(default_factory=lambda: ["sha256"])
    max_characteristics: list[int] = Field(default_factory=lambda: [5])
    method: list[str] = Field(default_factory=lambda: ["combined"])
    combined_strategy: list[str] = Field(default_factory=lambda: ["sequential"])
    message_diffs: Optional[list[list[str]]] = Field(
        default=None,
        description="Custom message differences (each is 16 hex strings). None = use defaults.",
    )


class BatchConfig(BaseModel):
    param_grid: ParameterGrid = Field(default_factory=ParameterGrid)
    max_workers: int = Field(default=4, ge=1, le=32)
    sample_size: Optional[int] = Field(default=None, ge=1)


def _get_hash_instance(name: str, num_rounds: int):
    """Create a hash function instance by name."""
    name = name.lower()
    if name == "sha256":
        from src.hash_functions.sha256 import SHA256Reduced
        return SHA256Reduced(num_rounds)
    elif name == "sha1":
        from src.hash_functions.sha1 import SHA1Reduced
        return SHA1Reduced(num_rounds)
    elif name == "md5":
        from src.hash_functions.md5 import MD5Reduced
        return MD5Reduced(num_rounds)
    elif name == "md4":
        from src.hash_functions.md4 import MD4Reduced
        return MD4Reduced(num_rounds)
    else:
        raise ValueError(f"Unknown hash function: {name}")


def _parse_message_diffs(config: dict) -> list[list[int]] | None:
    """Parse custom message diffs from config."""
    raw_diffs = config.get("message_diffs")
    if not raw_diffs:
        return None
    return [[int(w, 16) for w in diff] for diff in raw_diffs]


def _build_response(result, hash_func_name: str, config: dict) -> dict:
    """Build standard response dict from an AttackResult."""
    resp: dict = {
        "success": result.success,
        "total_time": result.total_time,
        "characteristics_tried": result.characteristics_tried,
        "encoding_time": result.encoding_time,
        "solving_time": result.solving_time,
        "diff_analysis_time": result.diff_analysis_time,
        "m1_words": [f"0x{w:08x}" for w in result.m1_words] if result.success else None,
        "m2_words": [f"0x{w:08x}" for w in result.m2_words] if result.success else None,
        "solver_stats": result.solver_output.stats.to_dict() if result.solver_output else None,
        "attempts": [
            {
                "diff": [f"0x{w:08x}" for w in a.diff],
                "result": a.result,
                "solve_time": round(a.solve_time, 3),
                "encoding_time": round(a.encoding_time, 3),
                "hamming_weight": sum(bin(w & 0xFFFFFFFF).count("1") for w in a.diff),
                "num_vars": getattr(a, "num_vars", 0),
                "num_clauses": getattr(a, "num_clauses", 0),
                "num_conflicts": getattr(a, "num_conflicts", 0),
                "num_decisions": getattr(a, "num_decisions", 0),
                "num_propagations": getattr(a, "num_propagations", 0),
                "num_restarts": getattr(a, "num_restarts", 0),
                "num_learnt_clauses": getattr(a, "num_learnt_clauses", 0),
            }
            for a in getattr(result, "attempts", [])
        ],
    }

    # Compute hashes for found collisions
    if result.success and result.m1_words and result.m2_words:
        try:
            h = _get_hash_instance(hash_func_name, config["num_rounds"])
            endian = "little" if hash_func_name in ("md5", "md4") else "big"
            m1_bytes = b"".join(w.to_bytes(4, endian) for w in result.m1_words)
            m2_bytes = b"".join(w.to_bytes(4, endian) for w in result.m2_words)
            h1 = h.hash(m1_bytes)
            h2 = h.hash(m2_bytes)
            resp["hash1"] = h1.hex()
            resp["hash2"] = h2.hex()
            resp["hashes_match"] = h1 == h2
            xor_diff = [a ^ b for a, b in zip(result.m1_words, result.m2_words)]
            resp["xor_diff"] = [f"0x{d:08x}" for d in xor_diff]
            resp["diff_hamming_weight"] = sum(bin(d).count("1") for d in xor_diff)
        except Exception:
            pass

    return resp


def _run_sync(config: dict, cancel_event: threading.Event | None = None,
              progress_dict: dict | None = None) -> dict:
    """Synchronous experiment runner — executes in thread pool."""
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

    method = config.get("method", "combined")
    strategy = config.get("combined_strategy", "sequential")
    hash_func_name = config.get("hash_function", "sha256")
    message_diffs = _parse_message_diffs(config)

    def _progress_cb(info: dict) -> None:
        if progress_dict is not None:
            progress_dict.update(info)

    common_kwargs = dict(
        num_rounds=config["num_rounds"],
        message_diffs=message_diffs,
        solver_name=config["solver"],
        timeout_per_char=config["timeout"],
        max_characteristics=config["max_characteristics"],
        hash_function=hash_func_name,
        cancel_event=cancel_event,
        progress_callback=_progress_cb,
    )

    if method == "combined" and strategy == "sequential":
        from src.combined.sequential import sequential_attack
        result = sequential_attack(**common_kwargs, seed=config.get("seed", 42))

    elif method == "combined" and strategy == "iterative":
        from src.combined.iterative import iterative_attack
        result = iterative_attack(**common_kwargs, seed=config.get("seed", 42))

    elif method == "combined" and strategy == "hybrid":
        from src.combined.hybrid import hybrid_attack
        result = hybrid_attack(**common_kwargs, seed=config.get("seed", 42))

    elif method == "combined" and strategy == "incremental":
        from src.combined.sequential import sequential_attack_incremental
        result = sequential_attack_incremental(**common_kwargs, seed=config.get("seed", 42))

    elif method == "pure_sat":
        # Baseline: no differential constraint — solver searches full collision space
        from src.sat_encoding.hash_encoder import CollisionEncoder
        from src.combined.sequential import AttackResult, AttemptInfo
        from src.solver.pysat_runner import PySATRunner
        from src.solver.solution_extractor import SolutionExtractor
        import tempfile, os as _os

        enc = CollisionEncoder(config["num_rounds"], hash_function=hash_func_name)
        enc.encode()
        msg_var_ids = (
            [v for word in enc._msg1 for v in word]
            + [v for word in enc._msg2 for v in word]
        )
        fd, cnf_file = tempfile.mkstemp(suffix=".cnf", prefix="pure_sat_")
        _os.close(fd)
        enc.builder.write_dimacs(cnf_file)
        runner = PySATRunner(config["solver"])
        import time as _time
        t0 = _time.time()
        output = runner.solve(cnf_file, timeout=config["timeout"],
                              random_phase_vars=msg_var_ids, seed=config.get("seed", 42),
                              cancel_event=cancel_event)
        elapsed = _time.time() - t0
        try:
            _os.unlink(cnf_file)
        except OSError:
            pass
        ar = AttackResult()
        ar.characteristics_tried = 1
        ar.total_time = elapsed
        if output.result.value == "SATISFIABLE" and output.assignment:
            extractor = SolutionExtractor(enc.builder.var_mgr)
            m1 = extractor.extract_message(output.assignment, enc._msg1)
            m2 = extractor.extract_message(output.assignment, enc._msg2)
            ar.success = (m1 != m2)
            ar.m1_words = m1
            ar.m2_words = m2
            ar.solver_output = output
        ar.attempts.append(AttemptInfo(
            diff=[0] * 16,
            result=output.result.value,
            solve_time=elapsed,
            num_vars=enc.builder.num_vars,
            num_clauses=enc.builder.num_clauses,
            num_conflicts=output.stats.num_conflicts,
            num_decisions=output.stats.num_decisions,
            num_propagations=output.stats.num_propagations,
            num_restarts=output.stats.num_restarts,
        ))
        result = ar

    else:
        return {"success": False, "total_time": 0, "characteristics_tried": 0,
                "message": f"Method '{method}' with strategy '{strategy}' is not supported"}

    return _build_response(result, hash_func_name, config)


async def _execute_experiment(exp_id: str) -> None:
    """Background task: runs a single experiment asynchronously."""
    exp = _experiments[exp_id]
    exp["status"] = "running"
    exp["started_at"] = time.time()
    loop = asyncio.get_running_loop()

    cancel_event = threading.Event()
    _cancel_flags[exp_id] = cancel_event

    config = exp["config"]
    exp["progress"] = {}
    hard_timeout = config.get("timeout", 300) * config.get("max_characteristics", 10) + 60
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(_executor, _run_sync, config, cancel_event, exp["progress"]),
            timeout=hard_timeout,
        )
        if cancel_event.is_set():
            exp["status"] = "cancelled"
            exp["completed_at"] = time.time()
            exp["results"] = result
            exp["error"] = "Отменено пользователем"
        else:
            exp["status"] = "completed"
            exp["completed_at"] = time.time()
            exp["results"] = result
    except asyncio.TimeoutError:
        exp["status"] = "failed"
        exp["completed_at"] = time.time()
        exp["error"] = f"Hard timeout after {hard_timeout}s"
    except Exception as e:
        exp["status"] = "failed"
        exp["completed_at"] = time.time()
        exp["error"] = str(e)
    finally:
        _cancel_flags.pop(exp_id, None)


async def _execute_batch(batch_id: str, max_workers: int) -> None:
    """Background task: runs all experiments in a batch with limited concurrency."""
    batch = _batches[batch_id]
    semaphore = asyncio.Semaphore(max_workers)
    loop = asyncio.get_running_loop()
    lock = _batch_locks[batch_id]

    async def run_one(exp_id: str) -> None:
        async with semaphore:
            exp = _experiments[exp_id]
            exp["status"] = "running"
            exp["started_at"] = time.time()
            async with lock:
                batch["pending"] = max(0, batch["pending"] - 1)
                batch["running"] += 1

            cancel_event = threading.Event()
            _cancel_flags[exp_id] = cancel_event

            config = exp["config"]
            exp["progress"] = {}
            hard_timeout = config.get("timeout", 300) * config.get("max_characteristics", 10) + 60

            try:
                result = await asyncio.wait_for(
                    loop.run_in_executor(_executor, _run_sync, config, cancel_event, exp["progress"]),
                    timeout=hard_timeout,
                )
                if cancel_event.is_set():
                    exp["status"] = "cancelled"
                    exp["completed_at"] = time.time()
                    exp["results"] = result
                    exp["error"] = "Отменено пользователем"
                    async with lock:
                        batch["failed"] += 1
                else:
                    exp["status"] = "completed"
                    exp["completed_at"] = time.time()
                    exp["results"] = result
                    async with lock:
                        batch["completed"] += 1
            except asyncio.TimeoutError:
                exp["status"] = "failed"
                exp["completed_at"] = time.time()
                exp["error"] = f"Hard timeout after {hard_timeout}s"
                async with lock:
                    batch["failed"] += 1
            except Exception as e:
                exp["status"] = "failed"
                exp["completed_at"] = time.time()
                exp["error"] = str(e)
                async with lock:
                    batch["failed"] += 1
            finally:
                _cancel_flags.pop(exp_id, None)
                async with lock:
                    batch["running"] = max(0, batch["running"] - 1)

    await asyncio.gather(*[run_one(eid) for eid in batch["experiment_ids"]])
    batch["status"] = "completed"
    batch["completed_at"] = time.time()


# ── Batch experiments (must be registered BEFORE /{exp_id} catch-all) ───────

@router.post("/batch")
async def run_batch(batch_config: BatchConfig, background_tasks: BackgroundTasks):
    """
    Create and run a batch of experiments across a parameter grid.

    param_grid defines lists of values per parameter — all combinations are
    generated (Cartesian product). Use sample_size for random subsampling.
    """
    grid = batch_config.param_grid
    combos = list(itertools.product(
        grid.num_rounds,
        grid.solver,
        grid.timeout,
        grid.hash_function,
        grid.max_characteristics,
        grid.method,
        grid.combined_strategy,
    ))

    if batch_config.sample_size and len(combos) > batch_config.sample_size:
        random.shuffle(combos)
        combos = combos[: batch_config.sample_size]

    batch_id = str(uuid.uuid4())[:8]
    exp_ids: list[str] = []

    custom_diffs = grid.message_diffs

    for num_rounds, solver, timeout, hash_function, max_chars, method, strategy in combos:
        exp_id = str(uuid.uuid4())[:8]
        exp_ids.append(exp_id)
        _experiments[exp_id] = {
            "id": exp_id,
            "batch_id": batch_id,
            "config": {
                "hash_function": hash_function,
                "num_rounds": num_rounds,
                "method": method,
                "combined_strategy": strategy,
                "solver": solver,
                "timeout": timeout,
                "max_characteristics": max_chars,
                "seed": 42,
                "message_diffs": custom_diffs,
            },
            "status": "pending",
            "started_at": None,
            "completed_at": None,
            "results": None,
            "error": None,
        }

    _batches[batch_id] = {
        "id": batch_id,
        "total": len(exp_ids),
        "pending": len(exp_ids),
        "running": 0,
        "completed": 0,
        "failed": 0,
        "experiment_ids": exp_ids,
        "created_at": time.time(),
        "completed_at": None,
        "status": "running",
        "max_workers": batch_config.max_workers,
    }
    _batch_locks[batch_id] = asyncio.Lock()

    background_tasks.add_task(_execute_batch, batch_id, batch_config.max_workers)
    return _batches[batch_id]


@router.get("/batch/{batch_id}")
async def get_batch(batch_id: str):
    """Get batch status and aggregated summary."""
    if batch_id not in _batches:
        raise HTTPException(404, "Batch not found")
    batch = dict(_batches[batch_id])

    exps = [_experiments[eid] for eid in batch["experiment_ids"] if eid in _experiments]
    finished = [e for e in exps if e.get("results")]
    success_count = sum(1 for e in finished if e["results"].get("success"))
    times = [e["results"]["total_time"] for e in finished if e["results"].get("total_time")]
    batch["summary"] = {
        "success_count": success_count,
        "avg_time": round(sum(times) / len(times), 2) if times else 0,
        "best_time": round(min(times), 2) if times else 0,
    }
    return batch


@router.get("/batch/{batch_id}/experiments")
async def get_batch_experiments(batch_id: str):
    """List all experiments belonging to a batch."""
    if batch_id not in _batches:
        raise HTTPException(404, "Batch not found")
    return [_experiments[eid] for eid in _batches[batch_id]["experiment_ids"] if eid in _experiments]


@router.get("/batches/list")
async def list_batches():
    """List all batches."""
    return list(_batches.values())


@router.post("/batch/{batch_id}/cancel")
async def cancel_batch(batch_id: str):
    """Cancel all running/pending experiments in a batch."""
    if batch_id not in _batches:
        raise HTTPException(404, "Batch not found")
    batch = _batches[batch_id]
    cancelled = 0
    for exp_id in batch["experiment_ids"]:
        exp = _experiments.get(exp_id)
        if exp and exp["status"] in ("pending", "running"):
            cancel_event = _cancel_flags.get(exp_id)
            if cancel_event:
                cancel_event.set()
                cancelled += 1
            if exp["status"] == "pending":
                exp["status"] = "cancelled"
                exp["completed_at"] = time.time()
                exp["error"] = "Отменено пользователем"
                async with _batch_locks[batch_id]:
                    batch["pending"] = max(0, batch["pending"] - 1)
                    batch["failed"] += 1
    return {"cancelled": cancelled, "message": f"Cancel signal sent to {cancelled} experiments"}


@router.delete("/batch/{batch_id}")
async def delete_batch(batch_id: str):
    if batch_id not in _batches:
        raise HTTPException(404, "Batch not found")
    for eid in _batches[batch_id]["experiment_ids"]:
        _experiments.pop(eid, None)
    del _batches[batch_id]
    _batch_locks.pop(batch_id, None)
    return {"deleted": batch_id}


# ── Single experiment (after batch routes to avoid catch-all conflict) ───────

@router.post("/cancel/{exp_id}")
async def cancel_experiment(exp_id: str):
    """Cancel a running experiment. The current SAT attempt will finish, then stop."""
    if exp_id not in _experiments:
        raise HTTPException(404, "Experiment not found")
    exp = _experiments[exp_id]
    if exp["status"] not in ("pending", "running"):
        return {"status": exp["status"], "message": "Experiment already finished"}
    cancel_event = _cancel_flags.get(exp_id)
    if cancel_event:
        cancel_event.set()
    return {"status": "cancelling", "message": "Cancel signal sent"}


@router.post("/run")
async def run_experiment(config: ExperimentConfig, background_tasks: BackgroundTasks):
    """Start a single experiment (non-blocking, poll GET /{id} for status)."""
    exp_id = str(uuid.uuid4())[:8]
    _experiments[exp_id] = {
        "id": exp_id,
        "config": config.model_dump(),
        "status": "pending",
        "started_at": None,
        "completed_at": None,
        "results": None,
        "error": None,
    }
    background_tasks.add_task(_execute_experiment, exp_id)
    return _experiments[exp_id]


@router.get("/list")
async def list_experiments():
    """List all experiments."""
    return list(_experiments.values())


@router.get("/{exp_id}")
async def get_experiment(exp_id: str):
    """Get experiment details (use for polling)."""
    if exp_id not in _experiments:
        raise HTTPException(404, "Experiment not found")
    return _experiments[exp_id]


@router.delete("/{exp_id}")
async def delete_experiment(exp_id: str):
    if exp_id not in _experiments:
        raise HTTPException(404, "Experiment not found")
    del _experiments[exp_id]
    return {"deleted": exp_id}
