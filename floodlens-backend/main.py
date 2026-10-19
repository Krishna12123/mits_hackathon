from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.routers import flood, settlements, reports, config_router, auth

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize GEE credentials, DB pool, etc.
    print("🚀 FloodLens API starting up…")
    yield
    print("🛑 FloodLens API shutting down…")

app = FastAPI(
    title="FloodLens API",
    description="Flood detection & monitoring API · NAKSHATRA 2026",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,        prefix="/api/auth",        tags=["Auth"])
app.include_router(flood.router,       prefix="/api/flood",       tags=["Flood Detection"])
app.include_router(settlements.router, prefix="/api/settlements",  tags=["Settlements"])
app.include_router(reports.router,     prefix="/api/reports",      tags=["Reports"])
app.include_router(config_router.router, prefix="/api/config",    tags=["Config"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "FloodLens API"}
