import os
import logging
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, date
from typing import Optional
from dotenv import load_dotenv

from .config import ConfiguracaoJira
from .cliente_api_jira import ClienteApiJira, JiraApiError
from .servico_worklogs import ServicoWorklogs
from .gerador_relatorios import GeradorRelatorios
from .servico_capacity import (
    listar_colaboradores,
    atualizar_colaborador,
    remover_colaborador,
    calcular_capacity,
    PERFIS_CAPACITY,
)
from .models import (
    RelatorioColaborador,
    RelatorioProjeto,
    RelatorioCliente,
    ResumoGeral,
    WorklogEnriquecido,
)

logger = logging.getLogger(__name__)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI(title="Jira Timetracking API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cliente: Optional[ClienteApiJira] = None
_servico: Optional[ServicoWorklogs] = None
_gerador = GeradorRelatorios()


@app.on_event("startup")
async def startup():
    global _cliente, _servico
    base_url = os.getenv("JIRA_BASE_URL", "").strip()
    email = os.getenv("JIRA_EMAIL", "").strip()
    api_token = os.getenv("JIRA_API_TOKEN", "").strip()
    if base_url and email and api_token:
        try:
            config = ConfiguracaoJira(
                base_url=base_url, email=email, api_token=api_token
            )
            _cliente = ClienteApiJira(config)
            await _cliente.autenticar()
            _servico = ServicoWorklogs(_cliente)
            logger.info("Conectado ao Jira automaticamente via .env")
        except Exception as e:
            logger.warning(f"Falha ao conectar via .env: {e}")
    else:
        logger.info("Credenciais .env nao encontradas, aguardando conexao manual")


@app.get("/api/status")
async def status():
    return {"conectado": _servico is not None}


@app.post("/api/conectar")
async def conectar(config: ConfiguracaoJira):
    global _cliente, _servico
    try:
        _cliente = ClienteApiJira(config)
        user_data = await _cliente.autenticar()
        _servico = ServicoWorklogs(_cliente)
        return {"status": "conectado", "usuario": user_data}
    except JiraApiError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)


def _get_servico() -> ServicoWorklogs:
    if not _servico:
        raise HTTPException(
            status_code=400,
            detail="Conecte ao Jira primeiro via POST /api/conectar",
        )
    return _servico


@app.get("/api/worklogs", response_model=list[WorklogEnriquecido])
async def listar_worklogs(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
    colaborador_id: Optional[str] = Query(None),
    projeto_key: Optional[str] = Query(None),
):
    servico = _get_servico()
    try:
        dt_inicio = datetime.combine(data_inicio, datetime.min.time())
        dt_fim = datetime.combine(data_fim, datetime.max.time())
        worklogs = await servico.coletar_worklogs(dt_inicio, dt_fim)
        if colaborador_id:
            worklogs = servico.filtrar_por_colaborador(worklogs, colaborador_id)
        if projeto_key:
            worklogs = servico.filtrar_por_projeto(worklogs, projeto_key)
        return worklogs
    except JiraApiError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)


@app.get("/api/relatorio/completo")
async def relatorio_completo(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
):
    servico = _get_servico()
    dt_inicio = datetime.combine(data_inicio, datetime.min.time())
    dt_fim = datetime.combine(data_fim, datetime.max.time())
    worklogs = await servico.coletar_worklogs(dt_inicio, dt_fim)
    clientes = _gerador.relatorio_por_cliente(worklogs, {})

    # Classificar horas: Billable vs Non-Billable
    billable = 0.0
    non_billable = 0.0
    for c in clientes:
        nome = (c.cliente or "").strip()
        if nome == "Sem Cliente" or nome.lower().startswith("clouddog"):
            non_billable += c.total_horas
        else:
            billable += c.total_horas

    # Renomear "Sem Cliente" para "Projetos Internos"
    for c in clientes:
        if c.cliente == "Sem Cliente":
            c.cliente = "Projetos Internos"

    # Cruzar horas reais com capacity provisionada
    capacity_data = calcular_capacity(data_inicio, data_fim)
    colaboradores_report = _gerador.relatorio_por_colaborador(worklogs)

    # Mapear horas reais por nome de colaborador
    horas_reais_map = {c.nome_colaborador: c.total_horas for c in colaboradores_report}

    capacity_vs_real = []
    for cap_colab in capacity_data["colaboradores"]:
        nome = cap_colab["nome"]
        horas_reais = horas_reais_map.get(nome, 0.0)
        total_prov = cap_colab["total_provisionado"]
        diferenca = round(horas_reais - total_prov, 1)
        percentual = round((horas_reais / total_prov * 100) if total_prov > 0 else 0, 1)
        capacity_vs_real.append({
            "nome": nome,
            "perfil": cap_colab["perfil"],
            "time": cap_colab["time"],
            "horas_provisionadas": total_prov,
            "horas_reais": round(horas_reais, 1),
            "diferenca": diferenca,
            "percentual_utilizacao": percentual,
            "status": "ok" if percentual >= 90 else ("atencao" if percentual >= 70 else "critico"),
        })

    return {
        "resumo": _gerador.resumo_geral(worklogs, data_inicio, data_fim),
        "colaboradores": colaboradores_report,
        "projetos": _gerador.relatorio_por_projeto(worklogs),
        "clientes": [c.model_dump() for c in clientes],
        "billable": {
            "billable": round(billable, 2),
            "non_billable": round(non_billable, 2),
            "total": round(billable + non_billable, 2),
            "percentual_billable": round(billable / (billable + non_billable) * 100, 2) if (billable + non_billable) > 0 else 0,
        },
        "capacity_vs_real": capacity_vs_real,
        "dias_uteis": capacity_data["dias_uteis"],
    }


# ===== Endpoints de Colaboradores e Capacity =====

class ColaboradorUpdate(BaseModel):
    perfil: str
    time: str


@app.get("/api/colaboradores")
async def get_colaboradores():
    return listar_colaboradores()


@app.put("/api/colaboradores/{nome}")
async def put_colaborador(nome: str, body: ColaboradorUpdate):
    return atualizar_colaborador(nome, body.perfil, body.time)


@app.delete("/api/colaboradores/{nome}")
async def delete_colaborador(nome: str):
    if remover_colaborador(nome):
        return {"status": "removido"}
    raise HTTPException(status_code=404, detail="Colaborador nao encontrado")


@app.get("/api/perfis")
async def get_perfis():
    return PERFIS_CAPACITY


@app.get("/api/capacity")
async def get_capacity(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
):
    return calcular_capacity(data_inicio, data_fim)


@app.on_event("shutdown")
async def shutdown():
    if _cliente:
        await _cliente.close()