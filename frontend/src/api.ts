import type {
  ConfiguracaoJira,
  RelatorioColaborador,
  RelatorioProjeto,
  RelatorioCliente,
  ResumoGeral,
  ResumoBillable,
} from './types';

const API = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Erro na requisicao');
  }
  return res.json();
}

function qs(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

export async function checkStatus() {
  return request<{ conectado: boolean }>(API + '/status');
}

export async function conectar(config: ConfiguracaoJira) {
  return request<{ status: string; usuario: Record<string, unknown> }>(
    API + '/conectar',
    { method: 'POST', body: JSON.stringify(config) }
  );
}

export interface RelatorioCompleto {
  resumo: ResumoGeral;
  colaboradores: RelatorioColaborador[];
  projetos: RelatorioProjeto[];
  clientes: RelatorioCliente[];
  billable: ResumoBillable;
}

export async function getRelatorioCompleto(dataInicio: string, dataFim: string) {
  return request<RelatorioCompleto>(
    API + '/relatorio/completo?' + qs({ data_inicio: dataInicio, data_fim: dataFim })
  );
}