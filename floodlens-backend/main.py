from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import flood, settlements, reports, config_router, auth, ws

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize DB tables and seeds, GEE credentials
    print("🚀 FloodLens API starting up…")
    try:
        init_db()
        print("✅ Database initialized successfully.")
    except Exception as e:
        print(f"⚠️ Database initialization warning: {e}")
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
app.include_router(auth.router,          prefix="/api/auth",        tags=["Auth"])
app.include_router(flood.router,         prefix="/api/flood",       tags=["Flood Detection"])
app.include_router(settlements.router,   prefix="/api/settlements",  tags=["Settlements"])
app.include_router(reports.router,       prefix="/api/reports",      tags=["Reports"])
app.include_router(config_router.router, prefix="/api/config",       tags=["Config"])
app.include_router(ws.router,                                        tags=["Real-Time Stream"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "FloodLens API"}
