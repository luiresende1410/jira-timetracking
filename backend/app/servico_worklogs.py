import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from .cliente_api_jira import ClienteApiJira
from .models import (
    Worklog,
    WorklogEnriquecido,
    Projeto,
    Usuario,
    Issue,
)

logger = logging.getLogger(__name__)

# Semaforo para limitar chamadas concorrentes a API do Jira
_API_CONCURRENCY = 10


class ServicoWorklogs:
    def __init__(self, cliente: ClienteApiJira):
        self.cliente = cliente
        self._cache_usuarios: dict[str, Usuario] = {}
        self._cache_issues: dict[str, Issue] = {}
        self._cache_projetos: dict[str, Projeto] = {}
        self._sem = asyncio.Semaphore(_API_CONCURRENCY)

    async def _carregar_projetos(self) -> None:
        if not self._cache_projetos:
            projetos = await self.cliente.buscar_projetos()
            for p in projetos:
                self._cache_projetos[p.id] = p

    async def _obter_usuario(self, account_id: str) -> Optional[Usuario]:
        if account_id in self._cache_usuarios:
            return self._cache_usuarios[account_id]
        async with self._sem:
            # Double-check apos adquirir semaforo
            if account_id in self._cache_usuarios:
                return self._cache_usuarios[account_id]
            usuario = await self.cliente.buscar_usuario(account_id)
            if usuario:
                self._cache_usuarios[account_id] = usuario
            return usuario

    async def _obter_issue(self, issue_id: str) -> Optional[Issue]:
        if issue_id in self._cache_issues:
            return self._cache_issues[issue_id]
        async with self._sem:
            if issue_id in self._cache_issues:
                return self._cache_issues[issue_id]
            issue = await self.cliente.buscar_issue(issue_id)
            if issue:
                self._cache_issues[issue_id] = issue
            return issue

    async def _enriquecer_worklog(self, w: Worklog) -> Optional[WorklogEnriquecido]:
        try:
            usuario, issue = await asyncio.gather(
                self._obter_usuario(w.author_account_id),
                self._obter_issue(w.issue_id),
            )
            if not usuario or not issue:
                logger.warning(
                    f"Dados incompletos para worklog {w.id}: "
                    f"usuario={usuario is not None}, issue={issue is not None}"
                )
                return None

            projeto = self._cache_projetos.get(issue.project_id)
            return WorklogEnriquecido(
                worklog=w,
                nome_colaborador=usuario.display_name,
                email_colaborador=usuario.email_address or "",
                projeto_key=projeto.key if projeto else "",
                projeto_nome=projeto.nome if projeto else "",
                issue_summary=issue.summary,
                issue_key=issue.key,
                issue_type=issue.issue_type,
                issue_status=issue.issue_status,
                horas_decimais=round(w.tempo_gasto_segundos / 3600, 2),
                organizacao=issue.organizacao,
            )
        except Exception as e:
            logger.error(f"Erro ao enriquecer worklog {w.id}: {e}")
            return None

    async def coletar_worklogs(
        self, data_inicio: datetime, data_fim: datetime
    ) -> list[WorklogEnriquecido]:
        await self._carregar_projetos()

        ids = await self.cliente.buscar_worklogs_atualizados(data_inicio)
        worklogs_brutos = await self.cliente.buscar_detalhes_worklogs(ids)

        if data_inicio.tzinfo is None:
            data_inicio = data_inicio.replace(tzinfo=timezone.utc)
        if data_fim.tzinfo is None:
            data_fim = data_fim.replace(tzinfo=timezone.utc)

        worklogs_periodo = [
            w for w in worklogs_brutos
            if data_inicio <= w.data_inicio <= data_fim
        ]

        logger.info(
            f"Enriquecendo {len(worklogs_periodo)} worklogs "
            f"({len(self._cache_usuarios)} usuarios em cache, "
            f"{len(self._cache_issues)} issues em cache)"
        )

        # Buscar todos em paralelo com semaforo limitando concorrencia
        resultados = await asyncio.gather(
            *[self._enriquecer_worklog(w) for w in worklogs_periodo]
        )

        return [r for r in resultados if r is not None]

    def filtrar_por_colaborador(
        self, worklogs: list[WorklogEnriquecido], account_id: str
    ) -> list[WorklogEnriquecido]:
        return [
            w for w in worklogs if w.worklog.author_account_id == account_id
        ]

    def filtrar_por_projeto(
        self, worklogs: list[WorklogEnriquecido], projeto_key: str
    ) -> list[WorklogEnriquecido]:
        return [w for w in worklogs if w.projeto_key == projeto_key]
