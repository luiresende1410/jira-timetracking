import osimport json

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



@app.get("/api/tickets/aws")
async def tickets_aws(
    data_inicio: date = Query(...),
    data_fim: date = Query(...),
):
    servico = _get_servico()
    try:
        raw_issues = await servico.cliente.buscar_issues_projeto(
            project_key="AWS",
        )
    except JiraApiError as e:
        raise HTTPException(status_code=e.status_code or 500, detail=e.message)

    tickets = []
    for issue in raw_issues:
        fields = issue.get("fields", {})
        orgs = fields.get("customfield_10002") or []
        org_name = orgs[0].get("name", "Sem Organization") if orgs else "Sem Organization"
        assignee = fields.get("assignee") or {}
        tickets.append({
            "key": issue.get("key", ""),
            "summary": fields.get("summary", ""),
            "status": (fields.get("status") or {}).get("name", ""),
            "issue_type": (fields.get("issuetype") or {}).get("name", ""),
            "organization": org_name,
            "assignee": assignee.get("displayName", "Sem responsavel"),
            "priority": (fields.get("priority") or {}).get("name", ""),
            "created": fields.get("created", ""),
            "updated": fields.get("updated", ""),
        })

    # Agrupar por organization
    por_org: dict = {}
    for t in tickets:
        org = t["organization"]
        if org not in por_org:
            por_org[org] = []
        por_org[org].append(t)

    return {
        "total": len(tickets),
        "por_organization": [
            {"organization": org, "tickets": ts, "total": len(ts)}
            for org, ts in sorted(por_org.items())
        ],
    }

# ===== Endpoints de Clientes MSP =====

_CLIENTES_MSP_PATH = os.path.join(os.path.dirname(__file__), "..", "clientes_msp.json")

def _carregar_clientes_msp() -> dict:
    if not os.path.exists(_CLIENTES_MSP_PATH):
        return {}
    with open(_CLIENTES_MSP_PATH, "r", encoding="utf-8-sig") as f:
        return json.load(f)

def _salvar_clientes_msp(data: dict) -> None:
    with open(_CLIENTES_MSP_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class ClienteMSPUpdate(BaseModel):
    horas: float
    equipe: str
    status: str  # "Ativo" ou "Suspenso"


@app.get("/api/clientes-msp")
async def get_clientes_msp():
    return _carregar_clientes_msp()


@app.put("/api/clientes-msp/{nome}")
async def put_cliente_msp(nome: str, body: ClienteMSPUpdate):
    data = _carregar_clientes_msp()
    data[nome] = {"horas": body.horas, "equipe": body.equipe, "status": body.status}
    _salvar_clientes_msp(data)
    return data[nome]


@app.delete("/api/clientes-msp/{nome}")
async def delete_cliente_msp(nome: str):
    data = _carregar_clientes_msp()
    if nome in data:
        del data[nome]
        _salvar_clientes_msp(data)
        return {"status": "removido"}
    raise HTTPException(status_code=404, detail="Cliente nao encontrado")
@app.on_event("shutdown")
async def shutdown():
    if _cliente:
        await _cliente.close()
