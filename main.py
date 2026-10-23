from fastapi import FastAPI
from app.routers.flood import router as flood_router

app = FastAPI(title="FloodLens API")

app.include_router(flood_router)


@app.get("/")
def home():
    return {"message": "FloodLens backend is running!"}