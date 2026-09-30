import logging
from dataclasses import dataclass
from functools import lru_cache
from uuid import UUID

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: UUID
    email: str | None


@lru_cache
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_keys=True)


def _decode_token(token: str, settings: Settings) -> dict:
    if not settings.supabase_issuer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Autenticação Supabase ainda não configurada no servidor.",
        )

    try:
        if settings.supabase_jwt_secret:
            key = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            if not settings.supabase_jwks_url:
                raise RuntimeError("JWKS não configurado")
            signing_key = _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
            key = signing_key.key
            algorithms = ["ES256", "RS256"]

        return jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
        )
    except (jwt.PyJWTError, RuntimeError) as exc:
        logger.warning("Falha ao validar JWT (%s): %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


def _user_from_claims(claims: dict) -> CurrentUser:
    subject = claims.get("sub") or claims.get("id")
    try:
        user_id = UUID(str(subject))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sem identificação de usuário válida.",
        ) from exc
    return CurrentUser(id=user_id, email=claims.get("email"))


async def _verify_with_supabase(token: str, settings: Settings) -> CurrentUser:
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
        )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": settings.supabase_publishable_key,
                },
            )
    except httpx.HTTPError as exc:
        logger.warning("Falha ao consultar Supabase Auth: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível validar a sessão agora. Tente novamente.",
        ) from exc

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão inválida ou expirada.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _user_from_claims(response.json())


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Faça login para continuar.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        return _user_from_claims(_decode_token(credentials.credentials, settings))
    except HTTPException:
        # Tokens HS256 antigos não aparecem no JWKS. O endpoint Auth valida
        # esses tokens sem exigir que o segredo privado seja armazenado aqui.
        return await _verify_with_supabase(credentials.credentials, settings)
