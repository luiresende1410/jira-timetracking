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

export interface CapacityVsReal {
  nome: string;
  perfil: string;
  time: string;
  horas_provisionadas: number;
  horas_reais: number;
  diferenca: number;
  percentual_utilizacao: number;
  status: 'ok' | 'atencao' | 'critico';
}

export interface RelatorioCompleto {
  resumo: ResumoGeral;
  colaboradores: RelatorioColaborador[];
  projetos: RelatorioProjeto[];
  clientes: RelatorioCliente[];
  billable: ResumoBillable;
  capacity_vs_real: CapacityVsReal[];
  dias_uteis: number;
}

export async function getRelatorioCompleto(dataInicio: string, dataFim: string) {
  return request<RelatorioCompleto>(
    API + '/relatorio/completo?' + qs({ data_inicio: dataInicio, data_fim: dataFim })
  );
}

// ===== Colaboradores e Capacity =====

export interface ColaboradorConfig {
  perfil: string;
  time: string;
  ausencias?: string[];
  dias_ausentes?: number; // legado
}

export interface CapacityColaborador {
  nome: string;
  perfil: string;
  time: string;
  capacity: Record<string, number>;
  total_provisionado: number;
}

export interface CapacityResponse {
  dias_uteis: number;
  periodo_inicio: string;
  periodo_fim: string;
  perfis: Record<string, Record<string, number>>;
  colaboradores: CapacityColaborador[];
}

export async function getColaboradores() {
  return request<Record<string, ColaboradorConfig>>(API + '/colaboradores');
}

export async function updateColaborador(nome: string, perfil: string, time: string, ausencias: string[] = []) {
  return request<ColaboradorConfig>(
    API + '/colaboradores/' + encodeURIComponent(nome),
    { method: 'PUT', body: JSON.stringify({ perfil, time, ausencias }) }
  );
}

export async function deleteColaborador(nome: string) {
  return request<{ status: string }>(
    API + '/colaboradores/' + encodeURIComponent(nome),
    { method: 'DELETE' }
  );
}

export async function getPerfis() {
  return request<Record<string, Record<string, number>>>(API + '/perfis');
}

export async function getCapacity(dataInicio: string, dataFim: string) {
  return request<CapacityResponse>(
    API + '/capacity?' + qs({ data_inicio: dataInicio, data_fim: dataFim })
  );
}

// ===== Tickets AWS =====

export interface TicketAWS {
  key: string;
  summary: string;
  status: string;
  issue_type: string;
  organization: string;
  assignee: string;
  priority: string;
  created: string;
  updated: string;
}

export interface OrgTickets {
  organization: string;
  tickets: TicketAWS[];
  total: number;
}

export interface TicketsAWSResponse {
  total: number;
  por_organization: OrgTickets[];
}

export async function getTicketsAWS(dataInicio: string, dataFim: string) {
  return request<TicketsAWSResponse>(
    API + '/tickets/aws?' + qs({ data_inicio: dataInicio, data_fim: dataFim })
  );
}

// ===== Clientes MSP =====

export interface ClienteMSP {
  horas: number;
  equipe: string;
  status: 'Ativo' | 'Suspenso';
  categoria?: 'ENTERPRISE' | 'BUSINESS' | 'BASICO';
}

export async function getClientesMSP() {
  return request<Record<string, ClienteMSP>>(API + '/clientes-msp');
}

export async function putClienteMSP(nome: string, dados: ClienteMSP) {
  return request<ClienteMSP>(
    API + '/clientes-msp/' + encodeURIComponent(nome),
    { method: 'PUT', body: JSON.stringify(dados) }
  );
}

export async function deleteClienteMSP(nome: string) {
  return request<{ status: string }>(
    API + '/clientes-msp/' + encodeURIComponent(nome),
    { method: 'DELETE' }
  );
}
export async function getPerfisCapacity() {
  return request<Record<string, Record<string, number>>>(API + '/perfis-capacity');
}

export async function updatePerfilCapacity(
  perfil: string,
  categorias: Record<string, number>
) {
  return request<Record<string, number>>(
    API + '/perfis-capacity/' + encodeURIComponent(perfil),
    { method: 'PUT', body: JSON.stringify({ categorias }) }
  );
}

export async function createPerfilCapacity(
  perfil: string,
  categorias: Record<string, number>
) {
  return request<Record<string, number>>(
    API + '/perfis-capacity/' + encodeURIComponent(perfil),
    { method: 'POST', body: JSON.stringify({ categorias }) }
  );
}

export async function deletePerfilCapacity(perfil: string) {
  return request<{ status: string }>(
    API + '/perfis-capacity/' + encodeURIComponent(perfil),
    { method: 'DELETE' }
  );
}


// ===== Saldo MSP =====

export interface SaldoMSPDetalhado {
  [cliente: string]: Array<{ mes: string; horas: number; motivo?: string }>;
}

export async function getSaldoMSP() {
  return request<Record<string, number>>(API + '/msp/saldo');
}

export async function getSaldoMSPDetalhado() {
  return request<SaldoMSPDetalhado>(API + '/msp/saldo/detalhado');
}

export async function fecharMesMSP(mes: string, horasTrabalhadas: Record<string, number>) {
  return request<Record<string, unknown>>(
    API + '/msp/fechar-mes',
    { method: 'POST', body: JSON.stringify({ mes, horas_trabalhadas: horasTrabalhadas }) }
  );
}

export async function ajustarSaldoMSP(nome: string, horas: number, mes: string, motivo = '') {
  return request<{ cliente: string; saldo_total: number; entradas: unknown[] }>(
    API + '/msp/saldo/' + encodeURIComponent(nome) + '/ajuste',
    { method: 'POST', body: JSON.stringify({ horas, mes, motivo }) }
  );
}

export async function zerarSaldoMSP(nome: string) {
  return request<{ cliente: string; saldo_total: number }>(
    API + '/msp/saldo/' + encodeURIComponent(nome),
    { method: 'DELETE' }
  );
}