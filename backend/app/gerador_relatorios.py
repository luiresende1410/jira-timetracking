from collections import defaultdict
from datetime import date
from typing import Optional

from .models import (
    WorklogEnriquecido,
    RelatorioColaborador,
    DetalheProjeto,
    DetalheAtividade,
    DetalheCliente,
    RelatorioProjeto,
    ResumoColaborador,
    HorasPorTipo,
    RelatorioCliente,
    ColaboradorCliente,
    ResumoGeral,
)


class GeradorRelatorios:

    def relatorio_por_colaborador(
        self, worklogs: list[WorklogEnriquecido]
    ) -> list[RelatorioColaborador]:
        por_colab: dict[str, list[WorklogEnriquecido]] = defaultdict(list)
        for w in worklogs:
            por_colab[w.worklog.author_account_id].append(w)

        resultado: list[RelatorioColaborador] = []
        for _, wlogs in por_colab.items():
            total_horas = sum(w.horas_decimais for w in wlogs)
            por_proj: dict[str, list[WorklogEnriquecido]] = defaultdict(list)
            for w in wlogs:
                por_proj[w.projeto_key].append(w)

            detalhes: list[DetalheProjeto] = []
            for pkey, pwlogs in por_proj.items():
                horas_proj = sum(w.horas_decimais for w in pwlogs)
                # Coletar todas as organizacoes unicas dos worklogs deste projeto
                orgs = {w.organizacao for w in pwlogs if w.organizacao}
                cliente = ", ".join(sorted(orgs)) if orgs else None
                atividades = [
                    DetalheAtividade(
                        issue_key=w.issue_key,
                        issue_summary=w.issue_summary,
                        issue_type=w.issue_type,
                        issue_status=w.issue_status,
                        data_registro=w.worklog.data_inicio.date(),
                        horas=w.horas_decimais,
                        comentario=w.worklog.comentario,
                    )
                    for w in pwlogs
                ]
                detalhes.append(
                    DetalheProjeto(
                        projeto_key=pkey,
                        projeto_nome=pwlogs[0].projeto_nome,
                        cliente_associado=cliente,
                        total_horas=round(horas_proj, 2),
                        percentual_alocacao=round(
                            (horas_proj / total_horas * 100) if total_horas else 0, 2
                        ),
                        atividades=atividades,
                    )
                )

            # Agrupar por cliente (organizacao) para visao detalhada
            por_cliente: dict[str, dict] = defaultdict(lambda: {"horas": 0.0, "projetos": set()})
            for w in wlogs:
                cli = w.organizacao or "Sem Cliente"
                por_cliente[cli]["horas"] += w.horas_decimais
                por_cliente[cli]["projetos"].add(w.projeto_key)

            detalhes_cliente = [
                DetalheCliente(
                    cliente=cli,
                    total_horas=round(dados["horas"], 2),
                    projetos=sorted(dados["projetos"]),
                )
                for cli, dados in sorted(por_cliente.items(), key=lambda x: -x[1]["horas"])
            ]

            primeiro = wlogs[0]
            resultado.append(
                RelatorioColaborador(
                    nome_colaborador=primeiro.nome_colaborador,
                    email_colaborador=primeiro.email_colaborador,
                    total_horas=round(total_horas, 2),
                    detalhes_por_projeto=detalhes,
                    detalhes_por_cliente=detalhes_cliente,
                )
            )
        return resultado

    def relatorio_por_projeto(
        self, worklogs: list[WorklogEnriquecido]
    ) -> list[RelatorioProjeto]:
        por_proj: dict[str, list[WorklogEnriquecido]] = defaultdict(list)
        for w in worklogs:
            por_proj[w.projeto_key].append(w)

        resultado: list[RelatorioProjeto] = []
        for pkey, wlogs in por_proj.items():
            total_horas = sum(w.horas_decimais for w in wlogs)
            por_colab: dict[str, list[WorklogEnriquecido]] = defaultdict(list)
            for w in wlogs:
                por_colab[w.nome_colaborador].append(w)

            colaboradores = []
            for nome, cwlogs in por_colab.items():
                horas_colab = sum(w.horas_decimais for w in cwlogs)
                # Breakdown por issue_type para este colaborador
                por_tipo_colab: dict[str, float] = defaultdict(float)
                for w in cwlogs:
                    tipo = w.issue_type or "Sem Tipo"
                    por_tipo_colab[tipo] += w.horas_decimais
                colaboradores.append(
                    ResumoColaborador(
                        nome_colaborador=nome,
                        total_horas=round(horas_colab, 2),
                        percentual_contribuicao=round(
                            (horas_colab / total_horas * 100) if total_horas else 0, 2
                        ),
                        por_tipo=[
                            HorasPorTipo(issue_type=t, total_horas=round(h, 2))
                            for t, h in sorted(por_tipo_colab.items(), key=lambda x: -x[1])
                        ],
                    )
                )

            # Breakdown por issue_type para o projeto inteiro
            por_tipo_proj: dict[str, float] = defaultdict(float)
            for w in wlogs:
                tipo = w.issue_type or "Sem Tipo"
                por_tipo_proj[tipo] += w.horas_decimais

            resultado.append(
                RelatorioProjeto(
                    projeto_key=pkey,
                    projeto_nome=wlogs[0].projeto_nome,
                    total_horas=round(total_horas, 2),
                    colaboradores=colaboradores,
                    horas_por_tipo=[
                        HorasPorTipo(issue_type=t, total_horas=round(h, 2))
                        for t, h in sorted(por_tipo_proj.items(), key=lambda x: -x[1])
                    ],
                )
            )
        return resultado

    def relatorio_por_cliente(
        self,
        worklogs: list[WorklogEnriquecido],
        mapeamento_clientes: dict[str, str] | None = None,
    ) -> list[RelatorioCliente]:
        por_cliente: dict[str, float] = defaultdict(float)
        # Agrupar colaboradores por cliente: cliente -> colaborador -> {horas, projetos}
        colab_por_cliente: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"horas": 0.0, "projetos": set()}))
        for w in worklogs:
            cliente = w.organizacao or (mapeamento_clientes or {}).get(w.projeto_key) or "Sem Cliente"
            por_cliente[cliente] += w.horas_decimais
            colab_por_cliente[cliente][w.nome_colaborador]["horas"] += w.horas_decimais
            colab_por_cliente[cliente][w.nome_colaborador]["projetos"].add(w.projeto_key)

        resultado = []
        for c, h in por_cliente.items():
            colabs = [
                ColaboradorCliente(
                    nome_colaborador=nome,
                    total_horas=round(dados["horas"], 2),
                    projetos=sorted(dados["projetos"]),
                )
                for nome, dados in sorted(colab_por_cliente[c].items(), key=lambda x: -x[1]["horas"])
            ]
            resultado.append(RelatorioCliente(cliente=c, total_horas=round(h, 2), colaboradores=colabs))
        return resultado

    def resumo_geral(
        self, worklogs: list[WorklogEnriquecido], periodo_inicio: date, periodo_fim: date
    ) -> ResumoGeral:
        total_horas = sum(w.horas_decimais for w in worklogs)
        colaboradores = {w.worklog.author_account_id for w in worklogs}
        projetos = {w.projeto_key for w in worklogs}
        n_colabs = len(colaboradores)

        return ResumoGeral(
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            total_horas_geral=round(total_horas, 2),
            total_colaboradores=n_colabs,
            total_projetos=len(projetos),
            media_horas_por_colaborador=round(
                total_horas / n_colabs if n_colabs else 0, 2
            ),
        )
