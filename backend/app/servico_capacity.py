import json
import logging
import os
from datetime import date, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

_COLABORADORES_PATH = os.path.join(os.path.dirname(__file__), "..", "colaboradores.json")
_PERFIS_PATH = os.path.join(os.path.dirname(__file__), "..", "perfis_capacity.json")


# Colaboradores I/O

def _carregar_colaboradores() -> dict:
    if not os.path.exists(_COLABORADORES_PATH):
        return {}
    with open(_COLABORADORES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _salvar_colaboradores(data: dict) -> None:
    with open(_COLABORADORES_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def listar_colaboradores() -> dict:
    return _carregar_colaboradores()


def atualizar_colaborador(nome: str, perfil: str, time: str, dias_ausentes: int = 0) -> dict:
    data = _carregar_colaboradores()
    # Preservar dias_ausentes existente se nao for passado explicitamente
    existente = data.get(nome, {})
    data[nome] = {
        "perfil": perfil,
        "time": time,
        "dias_ausentes": dias_ausentes if dias_ausentes > 0 else existente.get("dias_ausentes", 0),
    }
    _salvar_colaboradores(data)
    return data[nome]


def remover_colaborador(nome: str) -> bool:
    data = _carregar_colaboradores()
    if nome in data:
        del data[nome]
        _salvar_colaboradores(data)
        return True
    return False


# Perfis Capacity I/O

def _carregar_perfis() -> dict:
    if not os.path.exists(_PERFIS_PATH):
        logger.warning("perfis_capacity.json nao encontrado em %s", _PERFIS_PATH)
        return {}
    with open(_PERFIS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _salvar_perfis(data: dict) -> None:
    with open(_PERFIS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def listar_perfis() -> dict:
    return _carregar_perfis()


def atualizar_perfil(perfil: str, categorias: dict) -> dict:
    """Atualiza as categorias de um perfil existente. Lanca KeyError se perfil nao existe."""
    data = _carregar_perfis()
    if perfil not in data:
        raise KeyError(f"Perfil '{perfil}' nao encontrado")
    data[perfil] = categorias
    _salvar_perfis(data)
    return data[perfil]


def criar_perfil(perfil: str, categorias: dict) -> dict:
    """Cria um novo perfil. Lanca ValueError se perfil ja existe."""
    data = _carregar_perfis()
    if perfil in data:
        raise ValueError(f"Perfil '{perfil}' ja existe")
    data[perfil] = categorias
    _salvar_perfis(data)
    return data[perfil]


def deletar_perfil(perfil: str) -> None:
    """Remove um perfil. Lanca KeyError se perfil nao existe."""
    data = _carregar_perfis()
    if perfil not in data:
        raise KeyError(f"Perfil '{perfil}' nao encontrado")
    del data[perfil]
    _salvar_perfis(data)


# Dias uteis

def contar_dias_uteis(inicio: date, fim: date) -> int:
    """Conta dias uteis (seg-sex) no periodo, sem considerar feriados."""
    dias = 0
    atual = inicio
    while atual <= fim:
        if atual.weekday() < 5:  # 0=seg, 4=sex
            dias += 1
        atual += timedelta(days=1)
    return dias


# Capacity

def calcular_capacity(periodo_inicio: date, periodo_fim: date) -> dict:
    """Calcula capacity provisionada para cada colaborador no periodo."""
    colaboradores = _carregar_colaboradores()
    perfis_capacity = _carregar_perfis()
    dias_uteis = contar_dias_uteis(periodo_inicio, periodo_fim)

    perfil_efetivo_fallback = perfis_capacity.get("Efetivo", {})

    resultado = {
        "dias_uteis": dias_uteis,
        "periodo_inicio": periodo_inicio.isoformat(),
        "periodo_fim": periodo_fim.isoformat(),
        "perfis": perfis_capacity,
        "colaboradores": [],
    }

    for nome, info in colaboradores.items():
        perfil = info.get("perfil", "Efetivo")
        time = info.get("time", "A definir")
        categorias = perfis_capacity.get(perfil, perfil_efetivo_fallback)

        dias_ausentes = info.get("dias_ausentes", 0)
        dias_efetivos = max(0, dias_uteis - dias_ausentes)

        capacity = {}
        total_provisionado = 0.0
        for categoria, horas_dia in categorias.items():
            horas = round(horas_dia * dias_efetivos, 1)
            capacity[categoria] = horas
            total_provisionado += horas

        resultado["colaboradores"].append({
            "nome": nome,
            "perfil": perfil,
            "time": time,
            "dias_ausentes": dias_ausentes,
            "capacity": capacity,
            "total_provisionado": round(total_provisionado, 1),
        })

    return resultado


