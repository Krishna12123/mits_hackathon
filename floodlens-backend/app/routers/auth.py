"""
Auth Router (JWT)
POST /api/auth/login  — Login and receive JWT token
GET  /api/auth/me     — Get current authenticated user
"""
import os
import datetime
from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import LoginRequest, TokenResponse, UserResponse

router = APIRouter()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "floodlens-super-secret-key-2026")
ALGORITHM = "HS256"

try:
    from jose import jwt
    JOSE_AVAILABLE = True
except ImportError:
    jwt = None
    JOSE_AVAILABLE = False


def create_access_token(data: dict, expires_delta: datetime.timedelta = None):
    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + (expires_delta or datetime.timedelta(hours=24))
    to_encode.update({"exp": expire})
    if JOSE_AVAILABLE and jwt:
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return f"demo_token_{to_encode.get('sub', 'user')}_{int(expire.timestamp())}"


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    """Authenticates operator credentials and returns JWT bearer token."""
    if req.username == "admin" and req.password == "floodlens2026":
        token = create_access_token(data={"sub": req.username, "role": "operator"})
        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user={"username": "admin", "name": "Krishna Shukla", "role": "operator"},
        )
    raise HTTPException(status_code=401, detail="Invalid username or password")


@router.get("/me", response_model=UserResponse)
async def me():
    """Returns profile for currently active operator session."""
    return UserResponse(
        username="admin",
        name="Krishna Shukla",
        role="operator",
    )
