"""Results API routes."""

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/compare")
async def compare_results(experiment_ids: str):
    """Compare results from multiple experiments.

    Args:
        experiment_ids: Comma-separated experiment IDs.
    """
    from . import experiments as exp_module

    ids = [eid.strip() for eid in experiment_ids.split(",")]
    results = []

    for eid in ids:
        if eid not in exp_module._experiments:
            raise HTTPException(404, f"Experiment {eid} not found")
        results.append(exp_module._experiments[eid])

    return {
        "experiments": results,
        "count": len(results),
    }


@router.get("/export/{exp_id}/{format}")
async def export_results(exp_id: str, format: str):
    """Export results in specified format (json, csv)."""
    from . import experiments as exp_module

    if exp_id not in exp_module._experiments:
        raise HTTPException(404, "Experiment not found")

    exp = exp_module._experiments[exp_id]

    if format == "json":
        return exp
    elif format == "csv":
        from fastapi.responses import PlainTextResponse
        # Simple CSV conversion
        if exp.get("results"):
            lines = ["key,value"]
            for k, v in exp["results"].items():
                lines.append(f"{k},{v}")
            return PlainTextResponse(
                content="\n".join(lines),
                media_type="text/csv",
            )
        return PlainTextResponse("No results", media_type="text/csv")
    else:
        raise HTTPException(400, f"Unsupported format: {format}")
