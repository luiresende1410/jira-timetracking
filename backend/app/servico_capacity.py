import json
import os
from datetime import date, timedelta
from typing import Optional


# Perfis e suas horas diarias por categoria
PERFIS_CAPACITY = {
    "Tech Leader": {
        "Horas Administrativas": 4.0,
        "Horas de Apoio": 2.0,
        "Horas Efetivas": 2.0,
    },
    "Efetivo": {
        "Horas Administrativas": 1.0,
        "Horas de Apoio": 3.0,
        "Horas Efetivas": 4.0,
    },
    "Estagiario": {
        "Horas Administrativas": 1.0,
        "Horas de Estudo": 3.0,
        "Horas Efetivas": 2.0,
    },
}

_COLABORADORES_PATH = os.path.join(os.path.dirname(__file__), "..", "colaboradores.json")


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


def atualizar_colaborador(nome: str, perfil: str, time: str) -> dict:
    data = _carregar_colaboradores()
    data[nome] = {"perfil": perfil, "time": time}
    _salvar_colaboradores(data)
    return data[nome]


def remover_colaborador(nome: str) -> bool:
    data = _carregar_colaboradores()
    if nome in data:
        del data[nome]
        _salvar_colaboradores(data)
        return True
    return False


def contar_dias_uteis(inicio: date, fim: date) -> int:
    """Conta dias uteis (seg-sex) no periodo, sem considerar feriados."""
    dias = 0
    atual = inicio
    while atual <= fim:
        if atual.weekday() < 5:  # 0=seg, 4=sex
            dias += 1
        atual += timedelta(days=1)
    return dias


def calcular_capacity(periodo_inicio: date, periodo_fim: date) -> dict:
    """Calcula capacity provisionada para cada colaborador no periodo."""
    colaboradores = _carregar_colaboradores()
    dias_uteis = contar_dias_uteis(periodo_inicio, periodo_fim)

    resultado = {
        "dias_uteis": dias_uteis,
        "periodo_inicio": periodo_inicio.isoformat(),
        "periodo_fim": periodo_fim.isoformat(),
        "perfis": PERFIS_CAPACITY,
        "colaboradores": [],
    }

    for nome, info in colaboradores.items():
        perfil = info.get("perfil", "Efetivo")
        time = info.get("time", "A definir")
        categorias = PERFIS_CAPACITY.get(perfil, PERFIS_CAPACITY["Efetivo"])

        capacity = {}
        total_provisionado = 0.0
        for categoria, horas_dia in categorias.items():
            horas = round(horas_dia * dias_uteis, 1)
            capacity[categoria] = horas
            total_provisionado += horas

        resultado["colaboradores"].append({
            "nome": nome,
            "perfil": perfil,
            "time": time,
            "capacity": capacity,
            "total_provisionado": round(total_provisionado, 1),
        })

    return resultado
