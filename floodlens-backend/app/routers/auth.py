"""
Auth Router (JWT)
POST /api/auth/login  — Login and receive JWT token
GET  /api/auth/me     — Get current user
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
async def login(req: LoginRequest):
    # Demo credentials — replace with DB lookup + bcrypt verify
    if req.username == "admin" and req.password == "floodlens2026":
        return {
            "access_token": "demo_jwt_token_here",
            "token_type":   "bearer",
            "user":         {"username": "admin", "name": "Krishna Shukla"},
        }
    raise HTTPException(401, "Invalid credentials")


@router.get("/me")
async def me():
    return {"username": "admin", "name": "Krishna Shukla", "role": "operator"}
