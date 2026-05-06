import os
import json

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
from .saldo_msp import (
    get_saldo_todos,
    get_saldo_detalhado,
    get_categoria_cliente,
    fechar_mes,
    ajustar_saldo_manual,
    zerar_saldo_cliente,
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from .servico_capacity import (
    listar_colaboradores,
    atualizar_colaborador,
    remover_colaborador,
    calcular_capacity,
    listar_perfis,
    atualizar_perfil,
    criar_perfil,
    deletar_perfil,
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
_scheduler = AsyncIOScheduler(timezone="America/Sao_Paulo")


async def _processar_fechamentos_pendentes():
    """
    Verifica quais meses passados ainda nao foram fechados e processa todos em ordem.
    Um mes e considerado fechado se ja existe pelo menos uma entrada no saldo_msp.json
    com aquele mes, OU se foi registrado no historico de fechamentos.
    """
    import asyncio as _asyncio
    # Aguarda ate 30s para o servico estar disponivel (caso chamado logo apos startup)
    for _ in range(30):
        if _servico:
            break
        await _asyncio.sleep(1)
    if not _servico:
        logger.warning("[Saldo] Jira nao conectado apos 30s, fechamentos pendentes ignorados")
        return

    from calendar import monthrange
    from .saldo_msp import _carregar_saldo, _salvar_saldo

    hoje = date.today()
    clientes = _carregar_clientes_msp()

    # Determinar o mes de inicio: primeiro mes com clientes ativos cadastrados
    # Usamos jan/2026 como ponto de partida (ajuste conforme necessario)
    ano_inicio, mes_inicio = 2026, 1

    # Coletar todos os meses ja fechados a partir do historico do saldo
    saldo_atual = _carregar_saldo()
    meses_fechados = set()
    for entradas in saldo_atual.values():
        for e in entradas:
            meses_fechados.add(e["mes"])

    # Tambem verificar arquivo de controle de fechamentos
    _FECHAMENTOS_PATH = os.path.join(os.path.dirname(__file__), "..", "fechamentos_msp.json")
    if os.path.exists(_FECHAMENTOS_PATH):
        with open(_FECHAMENTOS_PATH, "r", encoding="utf-8-sig") as f:
            import json as _json
            meses_fechados.update(_json.load(f))

    # Listar meses passados que precisam ser fechados (do inicio ate o mes anterior ao atual)
    meses_pendentes = []
    ano, mes = ano_inicio, mes_inicio
    while (ano, mes) < (hoje.year, hoje.month):
        mes_str = f"{ano}-{mes:02d}"
        if mes_str not in meses_fechados:
            meses_pendentes.append((ano, mes, mes_str))
        if mes == 12:
            ano, mes = ano + 1, 1
        else:
            mes += 1

    if not meses_pendentes:
        logger.info("[Saldo] Nenhum mes pendente de fechamento")
        return

    logger.info(f"[Saldo] {len(meses_pendentes)} mes(es) pendente(s): {[m[2] for m in meses_pendentes]}")

    meses_processados = list(meses_fechados)
    for ano_ref, mes_ref, mes_str in meses_pendentes:
        ultimo_dia = monthrange(ano_ref, mes_ref)[1]
        dt_inicio = datetime(ano_ref, mes_ref, 1, 0, 0, 0)
        dt_fim = datetime(ano_ref, mes_ref, ultimo_dia, 23, 59, 59)
        try:
            worklogs = await _servico.coletar_worklogs(dt_inicio, dt_fim)
            relatorio = _gerador.relatorio_por_cliente(worklogs, {})
            horas_por_cliente = {r.cliente: r.total_horas for r in relatorio}
            resultado = fechar_mes(mes_str, horas_por_cliente, clientes)
            meses_processados.append(mes_str)
            logger.info(f"[Saldo] Fechamento {mes_str} concluido: {len(resultado)} clientes processados")
        except Exception as e:
            logger.error(f"[Saldo] Erro ao fechar {mes_str}: {e}")

    # Salvar historico de fechamentos
    with open(_FECHAMENTOS_PATH, "w", encoding="utf-8") as f:
        import json as _json
        _json.dump(sorted(set(meses_processados)), f, ensure_ascii=False, indent=2)


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
            # Processar fechamentos pendentes em background
            import asyncio
            asyncio.create_task(_processar_fechamentos_pendentes())
        except Exception as e:
            logger.warning(f"Falha ao conectar via .env: {e}")
    else:
        logger.info("Credenciais .env nao encontradas, aguardando conexao manual")

    # Agendar fechamento automatico no primeiro dia de cada mes as 00:05 BRT
    async def _fechar_mes_automatico():
        if not _servico:
            logger.warning("[Scheduler] Jira nao conectado, fechamento automatico ignorado")
            return
        from calendar import monthrange
        hoje = date.today()
        if hoje.month == 1:
            ano_ref, mes_ref = hoje.year - 1, 12
        else:
            ano_ref, mes_ref = hoje.year, hoje.month - 1
        mes_str = f"{ano_ref}-{mes_ref:02d}"
        ultimo_dia = monthrange(ano_ref, mes_ref)[1]
        dt_inicio = datetime(ano_ref, mes_ref, 1, 0, 0, 0)
        dt_fim = datetime(ano_ref, mes_ref, ultimo_dia, 23, 59, 59)
        try:
            worklogs = await _servico.coletar_worklogs(dt_inicio, dt_fim)
            relatorio = _gerador.relatorio_por_cliente(worklogs, {})
            horas_por_cliente = {r.cliente: r.total_horas for r in relatorio}
            clientes = _carregar_clientes_msp()
            resultado = fechar_mes(mes_str, horas_por_cliente, clientes)
            # Registrar no historico
            _FECHAMENTOS_PATH = os.path.join(os.path.dirname(__file__), "..", "fechamentos_msp.json")
            fechamentos = []
            if os.path.exists(_FECHAMENTOS_PATH):
                with open(_FECHAMENTOS_PATH, "r", encoding="utf-8-sig") as f:
                    import json as _json
                    fechamentos = _json.load(f)
            if mes_str not in fechamentos:
                fechamentos.append(mes_str)
            with open(_FECHAMENTOS_PATH, "w", encoding="utf-8") as f:
                import json as _json
                _json.dump(sorted(fechamentos), f, ensure_ascii=False, indent=2)
            logger.info(f"[Scheduler] Fechamento automatico {mes_str} concluido: {len(resultado)} clientes")
        except Exception as e:
            logger.error(f"[Scheduler] Erro no fechamento automatico: {e}")

    _scheduler.add_job(
        _fechar_mes_automatico,
        CronTrigger(day=1, hour=0, minute=5, timezone="America/Sao_Paulo"),
        id="fechar_mes_msp",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("[Scheduler] Agendamento de fechamento mensal MSP ativo (dia 1 de cada mes, 00:05 BRT)")


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
        import asyncio
        asyncio.create_task(_processar_fechamentos_pendentes())
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

    # Normalizar nomes com dupla codificacao UTF-8 (problema do Jira)
    def fix_encoding(s: str) -> str:
        try:
            return s.encode('latin1').decode('utf-8')
        except Exception:
            return s

    # Normalizar nomes nos relatorios
    for c in colaboradores_report:
        c.nome_colaborador = fix_encoding(c.nome_colaborador)

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
            "status": "ok" if percentual >= 80 else ("atencao" if percentual >= 50 else "critico"),
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
    dias_ausentes: int = 0


@app.get("/api/colaboradores")
async def get_colaboradores():
    return listar_colaboradores()


@app.put("/api/colaboradores/{nome}")
async def put_colaborador(nome: str, body: ColaboradorUpdate):
    return atualizar_colaborador(nome, body.perfil, body.time, body.dias_ausentes)


@app.delete("/api/colaboradores/{nome}")
async def delete_colaborador(nome: str):
    if remover_colaborador(nome):
        return {"status": "removido"}
    raise HTTPException(status_code=404, detail="Colaborador nao encontrado")


@app.get("/api/perfis")
async def get_perfis():
    return listar_perfis()


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
            data_inicio=data_inicio,
            data_fim=data_fim,
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
    data = _carregar_clientes_msp()
    # Enriquecer com categoria
    for nome, dados in data.items():
        dados["categoria"] = get_categoria_cliente(dados.get("horas", 0))
    return data


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

# ===== Endpoints de Perfis Capacity =====

class PerfilCapacityUpdate(BaseModel):
    categorias: dict[str, float]


@app.get("/api/perfis-capacity")
async def get_perfis_capacity():
    return listar_perfis()


@app.put("/api/perfis-capacity/{perfil}")
async def put_perfil_capacity(perfil: str, body: PerfilCapacityUpdate):
    for categoria, horas in body.categorias.items():
        if horas < 0:
            raise HTTPException(
                status_code=422,
                detail=f"Valor de horas para '{categoria}' deve ser maior ou igual a zero",
            )
    try:
        resultado = atualizar_perfil(perfil, body.categorias)
        return resultado
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


class PerfilCapacityCreate(BaseModel):
    categorias: dict[str, float]


@app.post("/api/perfis-capacity/{perfil}")
async def post_perfil_capacity(perfil: str, body: PerfilCapacityCreate):
    for categoria, horas in body.categorias.items():
        if horas < 0:
            raise HTTPException(
                status_code=422,
                detail=f"Valor de horas para '{categoria}' deve ser maior ou igual a zero",
            )
    try:
        resultado = criar_perfil(perfil, body.categorias)
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.delete("/api/perfis-capacity/{perfil}")
async def delete_perfil_capacity(perfil: str):
    try:
        deletar_perfil(perfil)
        return {"status": "ok"}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))

# ===== Endpoints de Saldo MSP =====

@app.get("/api/msp/saldo")
async def get_saldo_msp():
    """Retorna o saldo acumulado total por cliente."""
    return get_saldo_todos()


@app.get("/api/msp/saldo/detalhado")
async def get_saldo_msp_detalhado():
    """Retorna o saldo detalhado por mes de cada cliente."""
    return get_saldo_detalhado()


class FecharMesRequest(BaseModel):
    mes: str  # formato "YYYY-MM"
    horas_trabalhadas: dict[str, float]  # {nome_cliente: horas}


@app.post("/api/msp/fechar-mes")
async def post_fechar_mes(body: FecharMesRequest):
    """
    Fecha o mes informado calculando o saldo de cada cliente.
    Aplica as regras de acumulo conforme o contrato.
    """
    clientes = _carregar_clientes_msp()
    resultado = fechar_mes(body.mes, body.horas_trabalhadas, clientes)
    return resultado


class AjusteSaldoRequest(BaseModel):
    horas: float
    mes: str  # formato "YYYY-MM"
    motivo: str = ""


@app.post("/api/msp/saldo/{nome}/ajuste")
async def post_ajuste_saldo(nome: str, body: AjusteSaldoRequest):
    """Ajuste manual de saldo para um cliente (positivo = credito, negativo = debito)."""
    return ajustar_saldo_manual(nome, body.horas, body.mes, body.motivo)


@app.delete("/api/msp/saldo/{nome}")
async def delete_saldo_cliente(nome: str):
    """Zera o saldo acumulado de um cliente."""
    return zerar_saldo_cliente(nome)


@app.on_event("shutdown")
async def shutdown():
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
    if _cliente:
        await _cliente.close()







