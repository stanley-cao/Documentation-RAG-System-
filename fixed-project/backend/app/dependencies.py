from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel

from app.config import get_settings
from app.db.supabase import get_supabase_client

security = HTTPBearer()

# Supabase signs access tokens with asymmetric keys; only accept those algorithms
ALLOWED_ALGORITHMS: list[str] = ["ES256", "RS256"]

# Cached JWKS keyed by "kid", so we only hit Supabase on startup or key rotation
_jwks_cache: dict[str, dict[str, Any]] = {}


async def _refresh_jwks() -> None:
    """Fetch Supabase's public signing keys into the cache."""
    url = f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(url)
        response.raise_for_status()
    _jwks_cache.clear()
    for key in response.json().get("keys", []):
        if "kid" in key:
            _jwks_cache[key["kid"]] = key


async def get_signing_key(token: str) -> dict[str, Any]:
    """Return the JWK that signed this token, refetching once if the kid is unknown (key rotation)."""
    kid = jwt.get_unverified_header(token).get("kid")
    if not kid:
        raise JWTError("Token header missing kid")
    if kid not in _jwks_cache:
        try:
            await _refresh_jwks()
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Could not fetch auth signing keys: {e}",
            )
    key = _jwks_cache.get(kid)
    if not key:
        raise JWTError("Unknown signing key")
    return key


class User(BaseModel):
    id: str
    email: str | None = None
    is_admin: bool = False


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """Verify Supabase JWT token and extract user info, including admin status."""
    token = credentials.credentials

    try:
        # Verify the signature against Supabase's published public key (no more unverified decode)
        signing_key = await get_signing_key(token)
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=ALLOWED_ALGORITHMS,
            audience="authenticated",
        )

        user_id = payload.get("sub")
        email = payload.get("email")

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID"
            )

        # Query user_profiles for admin status
        supabase = get_supabase_client()
        profile_result = supabase.table("user_profiles").select("is_admin").eq(
            "user_id", user_id
        ).limit(1).execute()

        is_admin = False
        if profile_result and profile_result.data and len(profile_result.data) > 0:
            is_admin = profile_result.data[0].get("is_admin", False)

        return User(id=user_id, email=email, is_admin=is_admin)

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )


async def get_admin_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Require the current user to be an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
