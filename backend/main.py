"""FastAPI backend for the cryptanalysis framework."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import hash_functions, differential, sat, experiments, results

app = FastAPI(
    title="Hash Cryptanalysis Framework",
    description="Combined Differential-SAT Cryptanalysis of Hash Functions",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hash_functions.router, prefix="/api/hash", tags=["Hash Functions"])
app.include_router(differential.router, prefix="/api/diff", tags=["Differential Analysis"])
app.include_router(sat.router, prefix="/api/sat", tags=["SAT Encoding"])
app.include_router(experiments.router, prefix="/api/experiments", tags=["Experiments"])
app.include_router(results.router, prefix="/api/results", tags=["Results"])


@app.get("/")
async def root():
    return {"status": "ok", "name": "Hash Cryptanalysis Framework"}


@app.get("/api/health")
async def health():
    return {"status": "healthy"}
