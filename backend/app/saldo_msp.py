"""
Gerenciamento de saldo acumulado de horas MSP.

Categorias de cliente:
- ENTERPRISE: horas contratadas > 20h  -> acumula ate 3 meses
- BUSINESS:   horas contratadas 10-20h -> acumula ate 1 mes
- BASICO:     horas contratadas < 10h  -> sem acumulo

Regras de acumulo (FIFO - consome o saldo mais antigo primeiro).
"""

import os
import json
import logging

logger = logging.getLogger(__name__)

_SALDO_MSP_PATH = os.path.join(os.path.dirname(__file__), "..", "saldo_msp.json")


def _carregar_saldo() -> dict:
    if not os.path.exists(_SALDO_MSP_PATH):
        return {}
    with open(_SALDO_MSP_PATH, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def _salvar_saldo(data: dict) -> None:
    with open(_SALDO_MSP_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_categoria_cliente(horas_contratadas: float) -> str:
    """Retorna a categoria do cliente com base nas horas contratadas.
    - ENTERPRISE: >= 20h
    - BUSINESS:   10h a 19h
    - BASICO:     < 10h
    """
    if horas_contratadas >= 20:
        return "ENTERPRISE"
    elif horas_contratadas >= 10:
        return "BUSINESS"
    else:
        return "BASICO"


def _max_meses_acumulo(horas_contratadas: float) -> int:
    """Retorna quantos meses de saldo o cliente pode acumular."""
    categoria = get_categoria_cliente(horas_contratadas)
    if categoria == "ENTERPRISE":
        return 3
    elif categoria == "BUSINESS":
        return 1
    else:
        return 0


def get_saldo_total(cliente: str) -> float:
    saldo = _carregar_saldo()
    entradas = saldo.get(cliente, [])
    return round(sum(e["horas"] for e in entradas), 2)


def get_saldo_todos() -> dict[str, float]:
    saldo = _carregar_saldo()
    return {
        cliente: round(sum(e["horas"] for e in entradas), 2)
        for cliente, entradas in saldo.items()
        if sum(e["horas"] for e in entradas) > 0
    }


def get_saldo_detalhado() -> dict[str, list[dict]]:
    return _carregar_saldo()


def fechar_mes(
    mes: str,
    horas_trabalhadas_por_cliente: dict[str, float],
    clientes_msp: dict[str, dict],
) -> dict[str, dict]:
    """Fecha o mes calculando saldo de cada cliente conforme sua categoria."""
    saldo = _carregar_saldo()
    resultado = {}

    for nome_cliente, dados_cliente in clientes_msp.items():
        if dados_cliente.get("status") != "Ativo":
            continue

        horas_contratadas: float = dados_cliente.get("horas", 0)
        max_meses = _max_meses_acumulo(horas_contratadas)
        categoria = get_categoria_cliente(horas_contratadas)
        horas_trab = horas_trabalhadas_por_cliente.get(nome_cliente, 0.0)
        entradas = saldo.get(nome_cliente, [])

        if max_meses == 0:
            saldo_anterior_consumido = sum(e["horas"] for e in entradas)
            saldo[nome_cliente] = []
            resultado[nome_cliente] = {
                "categoria": categoria,
                "horas_contratadas": horas_contratadas,
                "horas_trabalhadas": round(horas_trab, 2),
                "saldo_anterior_consumido": round(saldo_anterior_consumido, 2),
                "saldo_gerado": 0.0,
                "saldo_expirado": round(saldo_anterior_consumido, 2),
                "saldo_total_apos": 0.0,
            }
            continue

        horas_restantes_trab = horas_trab
        saldo_consumido = 0.0
        novas_entradas = []

        for entrada in entradas:
            if horas_restantes_trab <= 0:
                novas_entradas.append(entrada)
                continue
            if entrada["horas"] <= horas_restantes_trab:
                horas_restantes_trab -= entrada["horas"]
                saldo_consumido += entrada["horas"]
            else:
                saldo_consumido += horas_restantes_trab
                novas_entradas.append({
                    "mes": entrada["mes"],
                    "horas": round(entrada["horas"] - horas_restantes_trab, 2),
                })
                horas_restantes_trab = 0

        horas_mes_usadas = max(0.0, horas_restantes_trab)
        sobra_mes = horas_contratadas - horas_mes_usadas
        saldo_gerado = max(0.0, round(sobra_mes, 2))

        if saldo_gerado > 0:
            novas_entradas.append({"mes": mes, "horas": saldo_gerado})

        saldo_expirado = 0.0
        if len(novas_entradas) > max_meses:
            excesso = novas_entradas[: len(novas_entradas) - max_meses]
            saldo_expirado = round(sum(e["horas"] for e in excesso), 2)
            novas_entradas = novas_entradas[len(novas_entradas) - max_meses:]

        saldo[nome_cliente] = novas_entradas
        saldo_total_apos = round(sum(e["horas"] for e in novas_entradas), 2)

        resultado[nome_cliente] = {
            "categoria": categoria,
            "horas_contratadas": horas_contratadas,
            "horas_trabalhadas": round(horas_trab, 2),
            "saldo_anterior_consumido": round(saldo_consumido, 2),
            "saldo_gerado": saldo_gerado,
            "saldo_expirado": saldo_expirado,
            "saldo_total_apos": saldo_total_apos,
        }

    _salvar_saldo(saldo)
    return resultado


def ajustar_saldo_manual(cliente: str, horas: float, mes: str, motivo: str = "") -> dict:
    saldo = _carregar_saldo()
    if cliente not in saldo:
        saldo[cliente] = []

    if horas > 0:
        saldo[cliente].append({"mes": mes, "horas": round(horas, 2), "motivo": motivo})
    elif horas < 0:
        desconto = abs(horas)
        novas = []
        for entrada in saldo[cliente]:
            if desconto <= 0:
                novas.append(entrada)
                continue
            if entrada["horas"] <= desconto:
                desconto -= entrada["horas"]
            else:
                novas.append({**entrada, "horas": round(entrada["horas"] - desconto, 2)})
                desconto = 0
        saldo[cliente] = novas

    _salvar_saldo(saldo)
    total = round(sum(e["horas"] for e in saldo[cliente]), 2)
    return {"cliente": cliente, "saldo_total": total, "entradas": saldo[cliente]}


def zerar_saldo_cliente(cliente: str) -> dict:
    saldo = _carregar_saldo()
    saldo[cliente] = []
    _salvar_saldo(saldo)
    return {"cliente": cliente, "saldo_total": 0.0}
