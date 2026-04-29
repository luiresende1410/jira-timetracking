import { useState, useMemo, useEffect, useCallback } from 'react';
import MultiFilter from './MultiFilter';
import { getRelatorioCompleto, getTicketsAWS, getClientesMSP, type CapacityVsReal, type OrgTickets, type TicketAWS, type ClienteMSP } from '../api';
import { exportCSV, exportExcel } from '../export';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type {
  RelatorioColaborador,
  RelatorioProjeto,
  RelatorioCliente,
  ResumoGeral,
} from '../types';

import AppLayout from "@cloudscape-design/components/app-layout";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";

import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import DatePicker from "@cloudscape-design/components/date-picker";
import Alert from "@cloudscape-design/components/alert";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import FormField from "@cloudscape-design/components/form-field";
import Capacity from './Capacity';
import ConfiguracoesMSP from './ConfiguracoesMSP';
import ConfiguracoesTime from './ConfiguracoesTime';
import Spinner from "@cloudscape-design/components/spinner";

interface DashboardProps { onDesconectado: () => void; }
type SortDir = 'asc' | 'desc';

function useSortable<T>(items: T[], defaultKey: keyof T, defaultDir: SortDir = 'desc') {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);
  const sorted = useMemo(() => [...items].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
    return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
  }), [items, sortKey, sortDir]);
  const toggle = (key: keyof T) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };
  return { sorted, toggle, sortKey, sortDir };
}

const tt: React.CSSProperties = {background:'#16213e',border:'1px solid #333',borderRadius:6};


function getMesCorrente(): { inicio: string; fim: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fim = new Date(y, m + 1, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    inicio: `${y}-${pad(m + 1)}-01`,
    fim: `${y}-${pad(m + 1)}-${pad(fim.getDate())}`,
  };
}

export default function Dashboard({ onDesconectado }: DashboardProps) {
  const mesCorrente = getMesCorrente();
  const [dataInicio, setDataInicio] = useState(mesCorrente.inicio);
  const [dataFim, setDataFim] = useState(mesCorrente.fim);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [tab, setTab] = useState('resumo');
  const [resumo, setResumo] = useState<ResumoGeral | null>(null);
  const [colaboradores, setColaboradores] = useState<RelatorioColaborador[]>([]);
  const [projetos, setProjetos] = useState<RelatorioProjeto[]>([]);
  const [clientes, setClientes] = useState<RelatorioCliente[]>([]);

  const [exclProjetos, setExclProjetos] = useState<Set<string>>(new Set());
  const [exclClientes, setExclClientes] = useState<Set<string>>(new Set());
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null);
  const [expandedProjeto, setExpandedProjeto] = useState<string | null>(null);
  const [capacityVsReal, setCapacityVsReal] = useState<CapacityVsReal[]>([]);
  const [diasUteis, setDiasUteis] = useState(0);
  const [ticketsAWS, setTicketsAWS] = useState<OrgTickets[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [filtroOrg, setFiltroOrg] = useState('');
  const [filtroMSP, setFiltroMSP] = useState('');
  const [filtroStatusMSP, setFiltroStatusMSP] = useState<Set<string>>(new Set());
  const [filtroStatusTickets, setFiltroStatusTickets] = useState<Set<string>>(new Set());
  const [evolucaoProjetos, setEvolucaoProjetos] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('evolucao_projetos') || '{}'); } catch { return {}; }
  });
  const setEvolucao = (key: string, val: number) => {
    setEvolucaoProjetos(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem('evolucao_projetos', JSON.stringify(next));
      return next;
    });
  };
  const [dadosFinanceiros, setDadosFinanceiros] = useState<Record<string, { horasVendidas: number; valorHora: number }>>(() => {
    try { return JSON.parse(localStorage.getItem('dados_financeiros_projetos') || '{}'); } catch { return {}; }
  });
  const setFinanceiro = (key: string, campo: 'horasVendidas' | 'valorHora', val: number) => {
    setDadosFinanceiros(prev => {
      const next = { ...prev, [key]: { ...(prev[key] ?? { horasVendidas: 0, valorHora: 0 }), [campo]: val } };
      localStorage.setItem('dados_financeiros_projetos', JSON.stringify(next));
      return next;
    });
  };
  const [mspCapacity, setMspCapacity] = useState<Record<string, ClienteMSP>>({});
  const [capacitySort, setCapacitySort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'time', dir: 'asc' });
  const [mspSort, setMspSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'horasTrabalhadas', dir: 'desc' });

  const MSP_PROJETO = 'CloudDog - Suporte SRE';
  const projetosFiltrados = useMemo(() => {
    const semMSP = projetos.filter(p => p.projeto_nome !== MSP_PROJETO);
    return exclProjetos.size === 0 ? semMSP : semMSP.filter(p => !exclProjetos.has(p.projeto_key));
  }, [projetos, exclProjetos]);
  const MSP_KEY = 'AWS';

  const clientesMSP = useMemo(() =>
    clientes.filter(c => c.colaboradores?.some(col => col.projetos.includes(MSP_KEY)) && c.cliente !== 'Projetos Internos'),
    [clientes]);
  const clientesFiltrados = useMemo(() =>
    exclClientes.size === 0 ? clientesMSP : clientesMSP.filter(c => !exclClientes.has(c.cliente)),
    [clientesMSP, exclClientes]);

  const ps = useSortable(projetosFiltrados, 'total_horas');


  const buscarMspCapacity = useCallback(async () => {
    try {
      const d = await getClientesMSP();
      setMspCapacity(d);
    } catch {
      // silencioso
    }
  }, []);

  const buscarTickets = useCallback(async () => {
    if (!dataInicio || !dataFim) return;
    setLoadingTickets(true);
    try {
      const d = await getTicketsAWS(dataInicio, dataFim);
      setTicketsAWS(d.por_organization);
    } catch {
      // silencioso - tickets podem nao estar disponiveis
    } finally {
      setLoadingTickets(false);
    }
  }, [dataInicio, dataFim]);

  const buscar = useCallback(async () => {
    if (!dataInicio || !dataFim) return;
    setLoading(true); setErro('');
    try {
      const d = await getRelatorioCompleto(dataInicio, dataFim);
      setResumo(d.resumo); setColaboradores(d.colaboradores); setProjetos(d.projetos); setClientes(d.clientes); setCapacityVsReal(d.capacity_vs_real || []); setDiasUteis(d.dias_uteis || 0);
      setExclProjetos(new Set()); setExclClientes(new Set());
      setExpandedCliente(null); setExpandedProjeto(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro';
      if (msg.includes('Conecte ao Jira primeiro')) { onDesconectado(); return; }
      setErro(msg);
    } finally { setLoading(false); }
  }, [dataInicio, dataFim, onDesconectado]);

  useEffect(() => { buscar(); buscarTickets(); buscarMspCapacity(); }, []);

  const tabId = tab;

  const renderResumo = () => {
    if (!resumo) return <Box textAlign="center" color="text-status-inactive">Nenhum dado carregado</Box>;
    return (
      <SpaceBetween size="l">
        <ColumnLayout columns={4} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Total Horas</Box>
            <Box variant="awsui-value-large">{resumo.total_horas_geral.toFixed(1)}h</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Colaboradores</Box>
            <Box variant="awsui-value-large">{String(resumo.total_colaboradores)}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Projetos</Box>
            <Box variant="awsui-value-large">{String(resumo.total_projetos)}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Média/Colaborador</Box>
            <Box variant="awsui-value-large">{resumo.media_horas_por_colaborador.toFixed(1)}h</Box>
          </div>
        </ColumnLayout>

        {colaboradores.length > 0 && (
          <Container header={<Header variant="h3">Horas por Colaborador (Top 10)</Header>}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={colaboradores.slice().sort((a,b)=>b.total_horas-a.total_horas).slice(0,10).map(c=>({nome:c.nome_colaborador.split(' ')[0],horas:c.total_horas}))}>
                <XAxis dataKey="nome" tick={{fill:'#aaa',fontSize:12}} /><YAxis tick={{fill:'#aaa',fontSize:12}} />
                <Tooltip contentStyle={tt} /><Bar dataKey="horas" fill="#FF6B00" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Container>
        )}


        {capacityVsReal.length > 0 && (() => {
          // Agrupar por time
          const porTime = new Map<string, { provisionado: number; realizado: number; membros: number }>();
          for (const c of capacityVsReal) {
            const t = c.time || 'Sem Time';
            if (!porTime.has(t)) porTime.set(t, { provisionado: 0, realizado: 0, membros: 0 });
            const entry = porTime.get(t)!;
            entry.provisionado += c.horas_provisionadas;
            entry.realizado += c.horas_reais;
            entry.membros += 1;
          }
          const times = Array.from(porTime.entries()).sort((a, b) => a[0].localeCompare(b[0]));
          const totalProv = times.reduce((s, [, v]) => s + v.provisionado, 0);
          const totalReal = times.reduce((s, [, v]) => s + v.realizado, 0);

          return (
            <Container header={<Header variant="h3">Capacity por Time</Header>}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e9ebed" }}>
                    <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Time</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Membros</th>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Provisionado</th>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Realizado</th>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Diferença</th>
                    <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>% Utilização</th>
                    <th style={{ padding: "10px 12px", width: 180 }}>
                      <div style={{ fontSize: 11, color: "#545b64", fontWeight: 600, marginBottom: 2 }}>Realizado / Provisionado</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {times.map(([time, v]) => {
                    const diff = v.realizado - v.provisionado;
                    const pct = v.provisionado > 0 ? (v.realizado / v.provisionado) * 100 : 0;
                    const barColor = pct >= 80 ? "#037f0c" : pct >= 70 ? "#f89256" : "#d13212";
                    const barWidth = Math.min(pct, 100);
                    return (
                      <tr key={time} style={{ borderBottom: "1px solid #e9ebed" }}>
                        <td style={{ padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>{time}</td>
                        <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "center", color: "#5f6b7a" }}>{v.membros}</td>
                        <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right" }}>{v.provisionado.toFixed(1)}h</td>
                        <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>{v.realizado.toFixed(1)}h</td>
                        <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", color: diff >= 0 ? "#037f0c" : "#d13212", fontWeight: 600 }}>
                          {diff > 0 ? "+" : ""}{diff.toFixed(1)}h
                        </td>
                        <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", fontWeight: 700, color: barColor }}>
                          {pct.toFixed(0)}%
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ background: "#e9ebed", borderRadius: 4, height: 12, overflow: "hidden" }}>
                            <div style={{ width: `${barWidth}%`, background: barColor, height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid #e9ebed", background: "#f2f3f3" }}>
                    <td style={{ padding: "10px 16px", fontSize: 14, fontWeight: 700 }}>Total Geral</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, textAlign: "center", color: "#5f6b7a", fontWeight: 600 }}>{capacityVsReal.length}</td>
                    <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>{totalProv.toFixed(1)}h</td>
                    <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", fontWeight: 700 }}>{totalReal.toFixed(1)}h</td>
                    <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", fontWeight: 700, color: (totalReal - totalProv) >= 0 ? "#037f0c" : "#d13212" }}>
                      {(totalReal - totalProv) > 0 ? "+" : ""}{(totalReal - totalProv).toFixed(1)}h
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", fontWeight: 700, color: totalProv > 0 && (totalReal/totalProv*100) >= 80 ? "#037f0c" : "#d13212" }}>
                      {totalProv > 0 ? (totalReal / totalProv * 100).toFixed(0) : 0}%
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ background: "#e9ebed", borderRadius: 4, height: 12, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(totalProv > 0 ? (totalReal/totalProv*100) : 0, 100)}%`, background: totalProv > 0 && (totalReal/totalProv*100) >= 80 ? "#037f0c" : "#d13212", height: "100%", borderRadius: 4 }} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Container>
          );
        })()}

                {capacityVsReal.length > 0 && (
          <Container header={<Header variant="h3" description={`${diasUteis} dias úteis no período`}>Capacity vs Horas Reais</Header>}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e9ebed" }}>
                  {[
                    { key: 'nome', label: 'Colaborador', align: 'left' },
                    { key: 'time', label: 'Time', align: 'left' },
                    { key: 'perfil', label: 'Perfil', align: 'left' },
                    { key: 'horas_provisionadas', label: 'Provisionado', align: 'right' },
                    { key: 'horas_reais', label: 'Realizado', align: 'right' },
                    { key: 'diferenca', label: 'Diferença', align: 'right' },
                    { key: 'percentual_utilizacao', label: '%', align: 'right' },
                    { key: 'status', label: 'Status', align: 'center' },
                  ].map(col => (
                    <th
                      key={col.key}
                      onClick={() => setCapacitySort(prev => ({ key: col.key, dir: prev.key === col.key && prev.dir === 'asc' ? 'desc' : 'asc' }))}
                      style={{ textAlign: col.align as 'left' | 'right' | 'center', padding: '10px 12px', fontSize: 13, color: '#0073bb', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    >
                      {col.label}
                      {capacitySort.key === col.key ? (capacitySort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...capacityVsReal].sort((a, b) => { const k = capacitySort.key as keyof typeof a; const va = a[k], vb = b[k]; const cmp = typeof va === 'number' && typeof vb === 'number' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb)); return capacitySort.dir === 'asc' ? cmp : -cmp; }).map(c => (
                  <tr key={c.nome} style={{ borderBottom: "1px solid #e9ebed" }}>
                    <td style={{ padding: "8px 12px", fontSize: 13 }}>{c.nome}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "#5f6b7a" }}>{c.time}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "#5f6b7a" }}>{c.perfil}</td>
                    <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right" }}>{c.horas_provisionadas.toFixed(1)}h</td>
                    <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>{c.horas_reais.toFixed(1)}h</td>
                    <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", color: c.diferenca >= 0 ? "#037f0c" : "#d13212" }}>{c.diferenca > 0 ? "+" : ""}{c.diferenca.toFixed(1)}h</td>
                    <td style={{ padding: "8px 12px", fontSize: 13, textAlign: "right", fontWeight: 600 }}>{c.percentual_utilizacao.toFixed(0)}%</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <StatusIndicator type={c.status === "ok" ? "success" : c.status === "atencao" ? "warning" : "error"}>
                        {c.status === "ok" ? "OK" : c.status === "atencao" ? "Atenção" : "Crítico"}
                      </StatusIndicator>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Container>
        )}
      </SpaceBetween>
    );
  };

  const renderProjetos = () => {
    return (
    <SpaceBetween size="l">
      {projetos.length > 0 && (
        <SpaceBetween size="s" direction="horizontal" alignItems="center">
          <MultiFilter label="Filtrar Projetos" options={projetos.map(p => p.projeto_key)} excluded={exclProjetos} onChange={setExclProjetos} />
          {exclProjetos.size > 0 && <Box color="text-status-inactive" fontSize="body-s">{projetosFiltrados.reduce((s, p) => s + p.total_horas, 0).toFixed(1)}h total filtrado</Box>}
        </SpaceBetween>
      )}

      <Container>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e9ebed" }}>
              <th style={{ width: 40, padding: "12px 8px" }} />
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Projeto</th>
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Key / %</th>
              <th style={{ textAlign: 'center', padding: '12px 12px', fontSize: 13, color: '#545b64', width: 200 }}>Horas Vendidas / Valor hora</th>
              <th style={{ textAlign: "right", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Horas Trabalhadas</th>
              <th style={{ textAlign: 'center', padding: '12px 12px', fontSize: 13, color: '#545b64', width: 200 }}>Evolução</th>
              <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 13, color: '#545b64', width: 160 }}>Valor Agregado</th>
            </tr>
          </thead>
          <tbody>
            {ps.sorted.map(p => {
              const isExpanded = expandedProjeto === p.projeto_key;
              // Buscar atividades de cada colaborador neste projeto
              const colabsComAtividades = colaboradores
                .map(col => {
                  const det = col.detalhes_por_projeto.find(d => d.projeto_key === p.projeto_key);
                  if (!det) return null;
                  return { nome: col.nome_colaborador, horas: det.total_horas, atividades: det.atividades };
                })
                .filter((x): x is { nome: string; horas: number; atividades: import('../types').DetalheAtividade[] } => x !== null)
                .sort((a, b) => b.horas - a.horas);
              return (
                <>
                  <tr
                    key={p.projeto_key}
                    style={{ borderBottom: isExpanded ? 'none' : '1px solid #e9ebed', cursor: 'pointer' }}
                    onClick={() => setExpandedProjeto(prev => prev === p.projeto_key ? null : p.projeto_key)}
                  >
                    <td style={{ padding: "10px 8px", textAlign: "center", color: "#879596", fontSize: 14 }}>
                      {isExpanded ? '▼' : '▶'}
                    </td>
                    <td style={{ padding: "10px 16px", fontWeight: 700, fontSize: 14, color: "#16191f" }}>
                      {p.projeto_nome}
                    </td>
                    <td style={{ padding: "8px 16px", fontSize: 12, color: "#5f6b7a" }}>{p.projeto_key}</td>
                    {/* Horas Vendidas / Valor hora */}
                    <td style={{ padding: '8px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" min={0}
                            value={dadosFinanceiros[p.projeto_key]?.horasVendidas ?? ''}
                            onChange={e => setFinanceiro(p.projeto_key, 'horasVendidas', Math.max(0, Number(e.target.value)))}
                            placeholder="Horas"
                            style={{ width: 70, padding: '3px 6px', fontSize: 12, textAlign: 'right', border: '1px solid #aab7b8', borderRadius: 4, outline: 'none', background: '#fff', color: '#16191f' }}
                          />
                          <span style={{ fontSize: 11, color: '#879596' }}>h</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: '#879596' }}>R$</span>
                          <input type="number" min={0}
                            value={dadosFinanceiros[p.projeto_key]?.valorHora ?? ''}
                            onChange={e => setFinanceiro(p.projeto_key, 'valorHora', Math.max(0, Number(e.target.value)))}
                            placeholder="Valor/h"
                            style={{ width: 70, padding: '3px 6px', fontSize: 12, textAlign: 'right', border: '1px solid #aab7b8', borderRadius: 4, outline: 'none', background: '#fff', color: '#16191f' }}
                          />
                        </div>
                      </div>
                    </td>
                    {/* Horas Trabalhadas */}
                    <td style={{ padding: '8px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#16191f' }}>
                      {p.total_horas.toFixed(1)}h
                    </td>
                    {/* Evolução */}
                    <td style={{ padding: '8px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" min={0} max={100}
                          value={evolucaoProjetos[p.projeto_key] ?? ''}
                          onChange={e => setEvolucao(p.projeto_key, Math.min(100, Math.max(0, Number(e.target.value))))}
                          placeholder="0"
                          style={{ width: 48, padding: '4px 6px', fontSize: 13, textAlign: 'right', border: '1px solid #aab7b8', borderRadius: 4, outline: 'none', background: '#fff', color: '#16191f' }}
                        />
                        <span style={{ fontSize: 12, color: '#5f6b7a' }}>%</span>
                        <div style={{ flex: 1, background: '#e9ebed', borderRadius: 4, height: 8, overflow: 'hidden', minWidth: 50 }}>
                          <div style={{
                            width: `${evolucaoProjetos[p.projeto_key] ?? 0}%`,
                            height: '100%', borderRadius: 4, transition: 'width 0.3s',
                            background: (evolucaoProjetos[p.projeto_key] ?? 0) >= 100 ? '#037f0c' : (evolucaoProjetos[p.projeto_key] ?? 0) >= 70 ? '#0073bb' : (evolucaoProjetos[p.projeto_key] ?? 0) >= 40 ? '#f0ab00' : '#d13212',
                          }} />
                        </div>
                      </div>
                    </td>
                    {/* Valor Agregado */}
                    <td style={{ padding: '8px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      {(() => {
                        const ev = evolucaoProjetos[p.projeto_key] ?? 0;
                        const hv = dadosFinanceiros[p.projeto_key]?.horasVendidas ?? 0;
                        const vh = dadosFinanceiros[p.projeto_key]?.valorHora ?? 0;
                        if (!hv || !vh) return <span style={{ fontSize: 12, color: '#879596' }}>—</span>;
                        const va = (ev / 100) * hv * vh;
                        const total = hv * vh;
                        return (
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#037f0c' }}>
                              {va.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                            <div style={{ fontSize: 11, color: '#879596', marginTop: 2 }}>
                              de {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                  {/* Painel expandido: atividades por colaborador */}
                  {isExpanded && (
                    <tr key={`${p.projeto_key}-expand`} style={{ borderBottom: '2px solid #e9ebed' }}>
                      <td colSpan={7} style={{ padding: 0, background: '#f8f9fa' }}>
                        <div style={{ padding: '16px 24px 20px 48px' }}>
                          {colabsComAtividades.length === 0 ? (
                            <Box color="text-status-inactive" fontSize="body-s">Nenhuma atividade encontrada para este projeto.</Box>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              {colabsComAtividades.map(colab => (
                                <div key={colab.nome}>
                                  {/* Cabeçalho do colaborador */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#16191f' }}>{colab.nome}</span>
                                    <span style={{ fontSize: 12, color: '#879596', background: '#e9ebed', padding: '2px 8px', borderRadius: 10 }}>
                                      {colab.horas.toFixed(1)}h
                                    </span>
                                    <span style={{ fontSize: 11, color: '#879596' }}>
                                      {colab.atividades.length} atividade{colab.atividades.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  {/* Tabela de atividades */}
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: '#e9ebed' }}>
                                        <th style={{ textAlign: 'left', padding: '5px 10px', color: '#545b64', fontWeight: 600, width: 100 }}>Issue</th>
                                        <th style={{ textAlign: 'left', padding: '5px 10px', color: '#545b64', fontWeight: 600 }}>Atividade</th>
                                        <th style={{ textAlign: 'left', padding: '5px 10px', color: '#545b64', fontWeight: 600, width: 120 }}>Tipo</th>
                                         <th style={{ textAlign: 'left', padding: '5px 10px', color: '#545b64', fontWeight: 600, width: 130 }}>Status</th>
                                        <th style={{ textAlign: 'left', padding: '5px 10px', color: '#545b64', fontWeight: 600, width: 100 }}>Data</th>
                                        <th style={{ textAlign: 'right', padding: '5px 10px', color: '#545b64', fontWeight: 600, width: 80 }}>Horas</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {[...colab.atividades]
                                        .sort((a, b) => new Date(b.data_registro).getTime() - new Date(a.data_registro).getTime())
                                        .map((at, i) => (
                                          <tr key={i} style={{ borderBottom: '1px solid #e9ebed', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                             <td style={{ padding: '5px 10px', whiteSpace: 'nowrap' }}><a href={`https://clouddog.atlassian.net/browse/`} target="_blank" rel="noopener noreferrer" style={{ color: '#0073bb', fontWeight: 600, textDecoration: 'none' }} onMouseOver={e => (e.currentTarget.style.textDecoration='underline')} onMouseOut={e => (e.currentTarget.style.textDecoration='none')}>{at.issue_key}</a></td>
                                            <td style={{ padding: '5px 10px', color: '#16191f', maxWidth: 500 }}>
                                              <div>{at.issue_summary}</div>
                                              {at.comentario && <div style={{ color: '#879596', fontSize: 11, marginTop: 2 }}>{at.comentario}</div>}
                                            </td>
                                            <td style={{ padding: '5px 10px', color: '#5f6b7a' }}>{at.issue_type || '—'}</td>
                                             <td style={{ padding: '5px 10px' }}>
                                               {at.issue_status ? (() => {
                                                 const s = at.issue_status.toLowerCase();
                                                 const color = s.includes('done') || s.includes('closed') || s.includes('resolved') ? '#037f0c'
                                                   : s.includes('progress') || s.includes('doing') ? '#0073bb'
                                                   : s.includes('cancel') || s.includes('won') ? '#879596' : '#545b64';
                                                 return <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '18', padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>{at.issue_status}</span>;
                                               })() : <span style={{ color: '#879596', fontSize: 11 }}>—</span>}
                                             </td>
                                            <td style={{ padding: '5px 10px', color: '#879596', whiteSpace: 'nowrap' }}>
                                              {at.data_registro ? new Date(at.data_registro).toLocaleDateString('pt-BR') : '—'}
                                            </td>
                                            <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 600, color: '#d45b07' }}>{at.horas.toFixed(1)}h</td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </Container>
    </SpaceBetween>
  );
  };

  const renderClientes = () => {
    // Calcular fator proporcional: quantos dias do período vs dias do mês completo
    const dtInicio = new Date(dataInicio + 'T00:00:00');
    const dtFim = new Date(dataFim + 'T00:00:00');
    const diasPeriodo = Math.round((dtFim.getTime() - dtInicio.getTime()) / 86400000) + 1;
    const diasNoMes = new Date(dtInicio.getFullYear(), dtInicio.getMonth() + 1, 0).getDate();
    const fatorMes = diasPeriodo / diasNoMes;

    // Montar lista unificada: clientes do capacity plan + clientes com horas no período
    const horasPorCliente: Record<string, number> = {};
    for (const c of clientesFiltrados) horasPorCliente[c.cliente] = c.total_horas;

    // Todos os clientes do capacity plan + clientes com horas mas sem entry no plan
    const todosClientes = new Set([
      ...Object.keys(mspCapacity),
      ...clientesFiltrados.map(c => c.cliente),
    ]);

    type MspRow = {
      cliente: string;
      equipe: string;
      statusContrato: 'Ativo' | 'Suspenso' | 'Sem contrato';
      horasContratadas: number;
      horasContratadas_periodo: number;
      horasTrabalhadas: number;
      pct: number;
      colaboradores: { nome: string; horas: number; projetos: string[] }[];
    };

    const rows: MspRow[] = Array.from(todosClientes).map(nome => {
      const plan = mspCapacity[nome];
      const horasTrab = horasPorCliente[nome] ?? 0;
      const horasContr = plan ? plan.horas * fatorMes : 0;
      const pct = horasContr > 0 ? (horasTrab / horasContr) * 100 : horasTrab > 0 ? 999 : 0;
      const clienteData = clientesFiltrados.find(c => c.cliente === nome);
      return {
        cliente: nome,
        equipe: plan?.equipe ?? '—',
        statusContrato: plan?.status ?? 'Sem contrato',
        horasContratadas: plan?.horas ?? 0,
        horasContratadas_periodo: horasContr,
        horasTrabalhadas: horasTrab,
        pct,
        colaboradores: (clienteData?.colaboradores ?? []).map(c => ({ nome: c.nome_colaborador, horas: c.total_horas, projetos: c.projetos })),
      };
    }).sort((a, b) => a.cliente.localeCompare(b.cliente));

    // Filtrar rows pelo texto digitado e por status
    const rowsFiltrados = rows.filter(r => {
      const textoOk = !filtroMSP.trim() || r.cliente.toLowerCase().includes(filtroMSP.trim().toLowerCase());
      const statusOk = filtroStatusMSP.size === 0 || !filtroStatusMSP.has(r.statusContrato);
      return textoOk && statusOk;
    });
    const rowsOrdenados = [...rowsFiltrados].sort((a, b) => { const va = (a as Record<string,unknown>)[mspSort.key]; const vb = (b as Record<string,unknown>)[mspSort.key]; const cmp = typeof va === 'number' && typeof vb === 'number' ? (va as number) - (vb as number) : String(va).localeCompare(String(vb)); return mspSort.dir === 'asc' ? cmp : -cmp; });

    // Totais por equipe
    const getStatusColor = (pct: number, status: string) => {
      if (status === 'Suspenso') return '#879596';
      if (pct === 0) return '#879596';
      if (pct > 110) return '#d13212';   // acima do contrato
      if (pct >= 80) return '#037f0c';   // dentro do esperado
      return '#f89256';                  // abaixo do esperado
    };

    const getStatusLabel = (pct: number, status: string, horasTrab: number) => {
      if (status === 'Suspenso') return { type: 'stopped' as const, label: 'Suspenso' };
      if (horasTrab === 0) return { type: 'pending' as const, label: 'Sem horas' };
      if (pct > 110) return { type: 'error' as const, label: 'Acima' };
      if (pct >= 80) return { type: 'success' as const, label: 'OK' };
      return { type: 'warning' as const, label: 'Abaixo' };
    };

    return (
      <SpaceBetween size="l">
        {/* Filtros MSP */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          {/* Filtro por status */}
          <div style={{ minWidth: 220 }}>
            <MultiFilter
              label="Status do contrato"
              options={['Ativo', 'Suspenso', 'Sem contrato']}
              excluded={filtroStatusMSP}
              onChange={excl => { setFiltroStatusMSP(excl); setExpandedCliente(null); }}
            />
          </div>
          {/* Filtro por nome */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                type="text"
                value={filtroMSP}
                onChange={e => { setFiltroMSP(e.target.value); setExpandedCliente(null); }}
                placeholder="Digite o nome do cliente..."
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  fontSize: 13,
                  border: '1px solid #aab7b8',
                  borderRadius: 4,
                  outline: 'none',
                  background: '#fff',
                  color: '#16191f',
                }}
              />
              {filtroMSP && (
                <button
                  onClick={() => { setFiltroMSP(''); setExpandedCliente(null); }}
                  style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #aab7b8', borderRadius: 4, background: '#f2f3f3', cursor: 'pointer', color: '#545b64' }}
                >
                  Limpar
                </button>
              )}
            </div>
            {filtroMSP && (
              <Box color="text-status-inactive" fontSize="body-s">
                {rowsFiltrados.length} cliente{rowsFiltrados.length !== 1 ? 's' : ''} encontrado{rowsFiltrados.length !== 1 ? 's' : ''}
              </Box>
            )}
          </div>
        </div>

        {/* Tabela detalhada */}
        <Container header={<Header variant="h3">Horas Contratadas vs Trabalhadas por Cliente</Header>}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e9ebed', background: '#f2f3f3' }}>
                {[
                  { key: 'cliente', label: 'Cliente', align: 'left' },
                  { key: 'equipe', label: 'Equipe', align: 'left' },
                  { key: 'statusContrato', label: 'Contrato', align: 'center' },
                  { key: 'horasContratadas', label: 'Contratado/mês', align: 'right' },
                  { key: 'horasContratadas_periodo', label: 'Previsto período', align: 'right' },
                  { key: 'horasTrabalhadas', label: 'Trabalhado', align: 'right' },
                  { key: 'pct', label: '%', align: 'right' },
                  { key: '_progresso', label: 'Progresso', align: 'left', noSort: true },
                  { key: '_status', label: 'Status', align: 'center', noSort: true },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => !col.noSort && setMspSort(prev => ({ key: col.key, dir: prev.key === col.key && prev.dir === 'asc' ? 'desc' : 'asc' }))}
                    style={{ textAlign: col.align as 'left'|'right'|'center', padding: col.key === 'cliente' ? '10px 16px' : '10px 12px', fontSize: 13, color: col.noSort ? '#545b64' : '#0073bb', fontWeight: 600, cursor: col.noSort ? 'default' : 'pointer', userSelect: 'none', whiteSpace: 'nowrap', width: col.key === '_progresso' ? 140 : undefined }}
                  >
                    {col.label}{!col.noSort && (mspSort.key === col.key ? (mspSort.dir === 'asc' ? ' ▲' : ' ▼') : ' ⇅')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowsOrdenados.map(row => {
                const cor = getStatusColor(row.pct, row.statusContrato);
                const { type: stType, label: stLabel } = getStatusLabel(row.pct, row.statusContrato, row.horasTrabalhadas);
                const isSusp = row.statusContrato === 'Suspenso';
                const barW = Math.min(row.pct === 999 ? 100 : row.pct, 100);
                return (
                  <>
                    <tr
                      key={row.cliente}
                      style={{ borderBottom: '1px solid #e9ebed', opacity: isSusp ? 0.55 : 1, cursor: row.colaboradores.length > 0 ? 'pointer' : 'default', background: expandedCliente === row.cliente ? '#f8f9fa' : 'transparent' }}
                      onClick={() => row.colaboradores.length > 0 && setExpandedCliente(prev => prev === row.cliente ? null : row.cliente)}
                    >
                      <td style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600 }}>
                        {row.colaboradores.length > 0 && <span style={{ marginRight: 6, color: '#879596', fontSize: 11 }}>{expandedCliente === row.cliente ? '▼' : '▶'}</span>}
                        {row.cliente}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 12, color: '#5f6b7a' }}>{row.equipe}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <StatusIndicator type={row.statusContrato === 'Ativo' ? 'success' : row.statusContrato === 'Suspenso' ? 'stopped' : 'pending'}>
                          {row.statusContrato}
                        </StatusIndicator>
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'right', color: '#5f6b7a' }}>
                        {row.horasContratadas > 0 ? `${row.horasContratadas.toFixed(0)}h` : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'right', color: '#5f6b7a' }}>
                        {row.horasContratadas_periodo > 0 ? `${row.horasContratadas_periodo.toFixed(1)}h` : '—'}
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: cor }}>
                        {row.horasTrabalhadas.toFixed(1)}h
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 13, textAlign: 'right', fontWeight: 700, color: cor }}>
                        {row.horasContratadas_periodo > 0 ? `${row.pct.toFixed(0)}%` : '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        {row.horasContratadas_periodo > 0 && (
                          <div style={{ background: '#e9ebed', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                            <div style={{ width: `${barW}%`, background: cor, height: '100%', borderRadius: 4, transition: 'width 0.3s' }} />
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <StatusIndicator type={stType}>{stLabel}</StatusIndicator>
                      </td>
                    </tr>
                    {expandedCliente === row.cliente && row.colaboradores.map((col, i) => (
                      <tr key={`${row.cliente}-col-${i}`} style={{ borderBottom: '1px solid #f2f3f3', background: '#f8f9fa' }}>
                        <td style={{ padding: '6px 16px 6px 36px', fontSize: 12, color: '#0073bb' }}>{col.nome}</td>
                        <td style={{ padding: '6px 12px', fontSize: 11, color: '#879596' }} colSpan={2}>{col.projetos.join(', ')}</td>
                        <td colSpan={4} />
                        <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', color: '#d45b07', fontWeight: 600 }}>{col.horas.toFixed(1)}h</td>
                        <td />
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </Container>
      </SpaceBetween>
    );
  };


  const renderTickets = () => {
    if (loadingTickets) return (
      <Box textAlign="center" padding="l"><Spinner size="large" /></Box>
    );
    if (ticketsAWS.length === 0) return (
      <Box textAlign="center" color="text-status-inactive">Nenhum ticket encontrado para o projeto AWS.</Box>
    );

    // Coletar todos os status únicos dos tickets
    const todosStatusTickets = Array.from(new Set(
      ticketsAWS.flatMap(o => o.tickets.map((t: TicketAWS) => t.status)).filter(Boolean)
    )).sort();

    // filtroStatusTickets = set de status EXCLUÍDOS (semântica MultiFilter)
    const statusAtivos = (s: string) => filtroStatusTickets.size === 0 || !filtroStatusTickets.has(s);

    const orgsFiltradas = ticketsAWS
      .map(o => ({
        ...o,
        tickets: o.tickets.filter((t: TicketAWS) => statusAtivos(t.status)),
      }))
      .filter(o => {
        const orgOk = !filtroOrg.trim() || o.organization.toLowerCase().includes(filtroOrg.trim().toLowerCase());
        return orgOk && o.tickets.length > 0;
      });


    const totalTickets = ticketsAWS.reduce((s, o) => s + o.total, 0);
    const totalFiltrado = orgsFiltradas.reduce((s, o) => s + o.tickets.length, 0);

    const getPriorityColor = (priority: string) => {
      switch (priority?.toLowerCase()) {
        case 'highest': case 'critical': return '#d13212';
        case 'high': return '#f89256';
        case 'medium': return '#f0ab00';
        case 'low': return '#037f0c';
        default: return '#879596';
      }
    };

    const getStatusType = (status: string): 'success' | 'pending' | 'in-progress' | 'stopped' | 'info' => {
      const s = status?.toLowerCase() || '';
      if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'success';
      if (s.includes('progress') || s.includes('doing')) return 'in-progress';
      if (s.includes('open') || s.includes('todo') || s.includes('to do')) return 'pending';
      if (s.includes('cancel') || s.includes('won')) return 'stopped';
      return 'info';
    };

    return (
      <SpaceBetween size="l">
        {/* Cabeçalho com totais e filtro */}
        <Container>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <Box variant="awsui-key-label">Total de Tickets</Box>
              <Box variant="awsui-value-large">{totalTickets}</Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Organizations</Box>
              <Box variant="awsui-value-large">{ticketsAWS.length}</Box>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <Box variant="awsui-key-label">Filtrar por Organization</Box>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="text"
                  value={filtroOrg}
                  onChange={e => {
                    setFiltroOrg(e.target.value);
                    setExpandedOrg(null);
                  }}
                  placeholder="Digite o nome da organization..."
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    fontSize: 13,
                    border: '1px solid #aab7b8',
                    borderRadius: 4,
                    outline: 'none',
                    background: '#fff',
                    color: '#16191f',
                  }}
                />
                {filtroOrg && (
                  <button
                    onClick={() => { setFiltroOrg(''); setExpandedOrg(null); }}
                    style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #aab7b8', borderRadius: 4, background: '#f2f3f3', cursor: 'pointer', color: '#545b64' }}
                  >
                    Limpar
                  </button>
                )}
              </div>
              {filtroOrg && (
                <Box color="text-status-inactive" fontSize="body-s">
                  {orgsFiltradas.length} organization{orgsFiltradas.length !== 1 ? 's' : ''} · {totalFiltrado} ticket{totalFiltrado !== 1 ? 's' : ''}
                </Box>
              )}
            </div>
            {/* Filtro por status */}
            <div style={{ minWidth: 260 }}>
              <MultiFilter
                label="Status"
                options={todosStatusTickets}
                excluded={filtroStatusTickets}
                onChange={excl => { setFiltroStatusTickets(excl); setExpandedOrg(null); }}
              />
            </div>
          </div>
        </Container>

        {orgsFiltradas.length === 0 && (
          <Box textAlign="center" color="text-status-inactive">
            Nenhuma organization encontrada para "{filtroOrg}".
          </Box>
        )}

        {orgsFiltradas.map(orgData => (
          <Container
            key={orgData.organization}
            header={
              <Header
                variant="h3"
                counter={`(${orgData.total})`}
                actions={
                  <Button
                    variant="link"
                    onClick={() => setExpandedOrg(prev => prev === orgData.organization ? null : orgData.organization)}
                  >
                    {expandedOrg === orgData.organization ? 'Recolher' : 'Expandir'}
                  </Button>
                }
              >
                {orgData.organization}
              </Header>
            }
          >
            {expandedOrg === orgData.organization && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e9ebed', background: '#f2f3f3' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Key</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Resumo</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Tipo</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Prioridade</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Responsável</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {orgData.tickets.map((ticket: TicketAWS) => (
                    <tr key={ticket.key} style={{ borderBottom: '1px solid #e9ebed' }}>
                      <td style={{ padding: '7px 12px', fontSize: 12, whiteSpace: 'nowrap' }}><a href={`https://clouddog.atlassian.net/browse/`} target="_blank" rel="noopener noreferrer" style={{ color: '#0073bb', fontWeight: 600, textDecoration: 'none' }} onMouseOver={e => (e.currentTarget.style.textDecoration='underline')} onMouseOut={e => (e.currentTarget.style.textDecoration='none')}>{ticket.key}</a></td>
                      <td style={{ padding: '7px 12px', fontSize: 12, maxWidth: 400 }}>{ticket.summary}</td>
                      <td style={{ padding: '7px 12px', fontSize: 11, color: '#5f6b7a' }}>{ticket.issue_type}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12 }}>
                        <StatusIndicator type={getStatusType(ticket.status)}>{ticket.status}</StatusIndicator>
                      </td>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: getPriorityColor(ticket.priority), fontWeight: 600 }}>{ticket.priority || '—'}</td>
                      <td style={{ padding: '7px 12px', fontSize: 12, color: '#5f6b7a' }}>{ticket.assignee}</td>
                      <td style={{ padding: '7px 12px', fontSize: 11, color: '#879596', whiteSpace: 'nowrap' }}>
                        {ticket.created ? new Date(ticket.created).toLocaleDateString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {expandedOrg !== orgData.organization && (
              <Box color="text-status-inactive" fontSize="body-s">
                {orgData.total} ticket{orgData.total !== 1 ? 's' : ''} — clique em Expandir para ver detalhes
              </Box>
            )}
          </Container>
        ))}
      </SpaceBetween>
    );
  };
  return (
    <AppLayout
      toolsHide={true}
      navigationHide={true}
      content={
        <ContentLayout
          header={
            <Header
              variant="h1"
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  {(resumo || colaboradores.length > 0) && (
                    <>
                      <Button onClick={() => exportCSV(tabId, resumo, colaboradores, projetos, clientes)} iconName="download">
                        Exportar CSV
                      </Button>
                      <Button onClick={() => exportExcel(resumo, colaboradores, projetos, clientes)} iconName="download">
                        Exportar Excel
                      </Button>
                    </>
                  )}
                </SpaceBetween>
              }
            >
              Timetracking
            </Header>
          }
        >
          <SpaceBetween size="l">
            {erro && <Alert type="error" dismissible onDismiss={() => setErro('')}>{erro}</Alert>}

            <Container>
              <SpaceBetween size="l" direction="horizontal" alignItems="end">
                <FormField label="Início">
                  <DatePicker
                    value={dataInicio}
                    onChange={({ detail }) => setDataInicio(detail.value)}
                    placeholder="YYYY-MM-DD"
                  />
                </FormField>
                <FormField label="Fim">
                  <DatePicker
                    value={dataFim}
                    onChange={({ detail }) => setDataFim(detail.value)}
                    placeholder="YYYY-MM-DD"
                  />
                </FormField>
                <Button variant="primary" onClick={() => { buscar(); buscarTickets(); }} loading={loading}>
                  Buscar
                </Button>
              </SpaceBetween>
            </Container>

            {loading && (
              <Box textAlign="center" padding="l">
                <Spinner size="large" />
              </Box>
            )}

            {!loading && (<>
              <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e9ebed', marginBottom: 16 }}>
                {(['resumo','projetos','clientes','tickets','capacity','configuracoes'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '10px 20px', background: 'none', border: 'none',
                    color: tab === t ? '#0073bb' : '#545b64',
                    borderBottom: tab === t ? '3px solid #0073bb' : '3px solid transparent',
                    fontWeight: tab === t ? 700 : 400, cursor: 'pointer', fontSize: 14, textTransform: 'capitalize',
                  }}>{t === 'clientes' ? 'MSP' : t === 'tickets' ? 'Tickets' : t === 'configuracoes' ? 'Configurações' : t}</button>
                ))}
              </div>
              {tab === 'resumo' && renderResumo()}
              {tab === 'projetos' && renderProjetos()}
              {tab === 'clientes' && renderClientes()}
              {tab === 'tickets' && renderTickets()}
              {tab === 'capacity' && <Capacity dataInicio={dataInicio} dataFim={dataFim} />}
              {tab === 'configuracoes' && (
                <SpaceBetween size="l">
                  <ConfiguracoesMSP />
                  <ConfiguracoesTime />
                </SpaceBetween>
              )}
            </>
            )}
          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}






