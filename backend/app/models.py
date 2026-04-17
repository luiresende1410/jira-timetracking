from pydantic import BaseModel
from datetime import datetime, date
from typing import Optional


class Worklog(BaseModel):
    id: str
    issue_id: str
    author_account_id: str
    tempo_gasto_segundos: int
    data_inicio: datetime
    comentario: Optional[str] = None
    criado_em: datetime
    atualizado_em: datetime


class WorklogEnriquecido(BaseModel):
    worklog: Worklog
    nome_colaborador: str
    email_colaborador: str
    projeto_key: str
    projeto_nome: str
    issue_summary: str
    issue_key: str
    issue_type: Optional[str] = None
    horas_decimais: float
    organizacao: Optional[str] = None


class Projeto(BaseModel):
    id: str
    key: str
    nome: str
    cliente_associado: Optional[str] = None


class Usuario(BaseModel):
    account_id: str
    display_name: str
    email_address: Optional[str] = None
    ativo: bool = True


class Issue(BaseModel):
    id: str
    key: str
    summary: str
    project_id: str
    organizacao: Optional[str] = None
    issue_type: Optional[str] = None


class DetalheAtividade(BaseModel):
    issue_key: str
    issue_summary: str
    issue_type: Optional[str] = None
    data_registro: date
    horas: float
    comentario: Optional[str] = None


class DetalheProjeto(BaseModel):
    projeto_key: str
    projeto_nome: str
    cliente_associado: Optional[str] = None
    total_horas: float
    percentual_alocacao: float
    atividades: list[DetalheAtividade]


class DetalheCliente(BaseModel):
    cliente: str
    total_horas: float
    projetos: list[str]


class RelatorioColaborador(BaseModel):
    nome_colaborador: str
    email_colaborador: str
    total_horas: float
    detalhes_por_projeto: list[DetalheProjeto]
    detalhes_por_cliente: list[DetalheCliente] = []


class HorasPorTipo(BaseModel):
    issue_type: str
    total_horas: float


class ResumoColaborador(BaseModel):
    nome_colaborador: str
    total_horas: float
    percentual_contribuicao: float
    por_tipo: list[HorasPorTipo] = []


class RelatorioProjeto(BaseModel):
    projeto_key: str
    projeto_nome: str
    cliente_associado: Optional[str] = None
    total_horas: float
    colaboradores: list[ResumoColaborador]
    horas_por_tipo: list[HorasPorTipo] = []


class ColaboradorCliente(BaseModel):
    nome_colaborador: str
    total_horas: float
    projetos: list[str]


class RelatorioCliente(BaseModel):
    cliente: str
    total_horas: float
    colaboradores: list[ColaboradorCliente] = []


class ResumoGeral(BaseModel):
    periodo_inicio: date
    periodo_fim: date
    total_horas_geral: float
    total_colaboradores: int
    total_projetos: int
    media_horas_por_colaborador: float