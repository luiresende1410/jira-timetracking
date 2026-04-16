from pydantic import BaseModel, field_validator
from datetime import datetime, date
from typing import Optional
import re


class ConfiguracaoJira(BaseModel):
    base_url: str
    email: str
    api_token: str
    max_resultados_por_pagina: int = 1000
    timeout_segundos: int = 30

    @field_validator("base_url")
    @classmethod
    def validar_base_url(cls, v: str) -> str:
        pattern = r"^https?://[^\s/$]+(?:/[^\s/$]+)*$"
        if not re.match(pattern, v) or v.endswith("/"):
            raise ValueError("baseUrl deve ser uma URL valida sem barra final")
        return v

    @field_validator("email")
    @classmethod
    def validar_email(cls, v: str) -> str:
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
            raise ValueError("email deve ser um formato valido")
        return v

    @field_validator("api_token")
    @classmethod
    def validar_api_token(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("apiToken nao pode ser vazio")
        return v

    @field_validator("max_resultados_por_pagina")
    @classmethod
    def validar_max_resultados(cls, v: int) -> int:
        if not 1 <= v <= 1000:
            raise ValueError("maxResultadosPorPagina deve estar entre 1 e 1000")
        return v
