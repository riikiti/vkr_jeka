"""FastAPI backend for the cryptanalysis framework."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import hash_functions, differential, sat, experiments, results


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — nothing special needed
    yield
    # Shutdown — stop the thread pool so hanging solvers don't block exit
    experiments.shutdown_executor()


app = FastAPI(
    title="DiffSAT Algorithm",
    description="Combined Differential-SAT Cryptanalysis of Hash Functions",
    version="0.2.0-beta",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    return {"status": "ok", "name": "DiffSAT Algorithm"}


@app.get("/api/health")
async def health():
    return {"status": "healthy"}
