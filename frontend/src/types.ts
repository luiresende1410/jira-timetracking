export interface ConfiguracaoJira {
  base_url: string;
  email: string;
  api_token: string;
  max_resultados_por_pagina?: number;
  timeout_segundos?: number;
}

export interface Worklog {
  id: string;
  issue_id: string;
  author_account_id: string;
  tempo_gasto_segundos: number;
  data_inicio: string;
  comentario?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface WorklogEnriquecido {
  worklog: Worklog;
  nome_colaborador: string;
  email_colaborador: string;
  projeto_key: string;
  projeto_nome: string;
  issue_summary: string;
  issue_key: string;
  horas_decimais: number;
}

export interface DetalheAtividade {
  issue_key: string;
  issue_summary: string;
  issue_type?: string;
  issue_status?: string;
  data_registro: string;
  horas: number;
  comentario?: string;
}

export interface DetalheProjeto {
  projeto_key: string;
  projeto_nome: string;
  cliente_associado?: string;
  total_horas: number;
  percentual_alocacao: number;
  atividades: DetalheAtividade[];
}

export interface DetalheCliente {
  cliente: string;
  total_horas: number;
  projetos: string[];
}

export interface RelatorioColaborador {
  nome_colaborador: string;
  email_colaborador: string;
  total_horas: number;
  detalhes_por_projeto: DetalheProjeto[];
  detalhes_por_cliente: DetalheCliente[];
}

export interface HorasPorTipo {
  issue_type: string;
  total_horas: number;
}

export interface ResumoColaborador {
  nome_colaborador: string;
  total_horas: number;
  percentual_contribuicao: number;
  por_tipo: HorasPorTipo[];
}

export interface RelatorioProjeto {
  projeto_key: string;
  projeto_nome: string;
  cliente_associado?: string;
  total_horas: number;
  colaboradores: ResumoColaborador[];
  horas_por_tipo: HorasPorTipo[];
}

export interface ColaboradorCliente {
  nome_colaborador: string;
  total_horas: number;
  projetos: string[];
}

export interface RelatorioCliente {
  cliente: string;
  total_horas: number;
  colaboradores: ColaboradorCliente[];
}

export interface ResumoGeral {
  periodo_inicio: string;
  periodo_fim: string;
  total_horas_geral: number;
  total_colaboradores: number;
  total_projetos: number;
  media_horas_por_colaborador: number;
}

export interface ResumoBillable {
  billable: number;
  non_billable: number;
  total: number;
  percentual_billable: number;
}
