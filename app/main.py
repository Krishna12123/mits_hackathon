

from fastapi import FastAPI
from app.routers.flood import router as flood_router

app = FastAPI(title="FloodLens API")

app.include_router(flood_router)


@app.get("/")
def home():
    return {"message": "FloodLens backend is running!"}
import ee
from fastapi import FastAPI
from app.routers.flood import router as flood_router

app = FastAPI(title="FloodLens API")

@app.on_event("startup")
def initialize_earth_engine():
    ee.Initialize(project="floodlens-512416")

app.include_router(flood_router)

@app.get("/")
def home():
    return {"message": "FloodLens backend is running!"}

