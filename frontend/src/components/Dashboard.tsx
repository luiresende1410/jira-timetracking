import { useState, useMemo, useEffect, useCallback } from 'react';
import MultiFilter from './MultiFilter';
import { getRelatorioCompleto, type CapacityVsReal } from '../api';
import { exportCSV, exportExcel } from '../export';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import type {
  RelatorioColaborador,
  RelatorioProjeto,
  RelatorioCliente,
  ResumoGeral,
  ResumoBillable,
} from '../types';

import AppLayout from "@cloudscape-design/components/app-layout";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Container from "@cloudscape-design/components/container";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Button from "@cloudscape-design/components/button";
import Table from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import DatePicker from "@cloudscape-design/components/date-picker";
import Alert from "@cloudscape-design/components/alert";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import FormField from "@cloudscape-design/components/form-field";
import Capacity from './Capacity';
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

const COLORS = ['#FF6B00','#FF8C38','#FFB070','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F'];
const tt: React.CSSProperties = {background:'#16213e',border:'1px solid #333',borderRadius:6};

type PI = { name: string; value: number };
function topN<T extends { total_horas: number }>(items: T[], n: number, nk: keyof T): PI[] {
  const s = [...items].sort((a, b) => b.total_horas - a.total_horas);
  const r: PI[] = s.slice(0, n).map(i => ({ name: String(i[nk]), value: i.total_horas }));
  const rest = s.slice(n);
  if (rest.length > 0) r.push({ name: 'Outros', value: rest.reduce((a, i) => a + i.total_horas, 0) });
  return r;
}
const pieLabel = ({ name, percent }: { name?: string; percent?: number }) => `${(name ?? '').substring(0, 15)} ${((percent ?? 0) * 100).toFixed(0)}%`;

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
  const [billable, setBillable] = useState<ResumoBillable | null>(null);
  const [exclProjetos, setExclProjetos] = useState<Set<string>>(new Set());
  const [exclClientes, setExclClientes] = useState<Set<string>>(new Set());
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null);
  const [expandedProjeto, setExpandedProjeto] = useState<string | null>(null);
  const [capacityVsReal, setCapacityVsReal] = useState<CapacityVsReal[]>([]);
  const [diasUteis, setDiasUteis] = useState(0);

  const projetosFiltrados = useMemo(() =>
    exclProjetos.size === 0 ? projetos : projetos.filter(p => !exclProjetos.has(p.projeto_key)),
    [projetos, exclProjetos]);
  const clientesFiltrados = useMemo(() =>
    exclClientes.size === 0 ? clientes : clientes.filter(c => !exclClientes.has(c.cliente)),
    [clientes, exclClientes]);

  const ps = useSortable(projetosFiltrados, 'total_horas');
  const cls = useSortable(clientesFiltrados, 'total_horas');

  const buscar = useCallback(async () => {
    if (!dataInicio || !dataFim) return;
    setLoading(true); setErro('');
    try {
      const d = await getRelatorioCompleto(dataInicio, dataFim);
      setResumo(d.resumo); setColaboradores(d.colaboradores); setProjetos(d.projetos); setClientes(d.clientes); setBillable(d.billable); setCapacityVsReal(d.capacity_vs_real || []); setDiasUteis(d.dias_uteis || 0);
      setExclProjetos(new Set()); setExclClientes(new Set());
      setExpandedCliente(null); setExpandedProjeto(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro';
      if (msg.includes('Conecte ao Jira primeiro')) { onDesconectado(); return; }
      setErro(msg);
    } finally { setLoading(false); }
  }, [dataInicio, dataFim, onDesconectado]);

  useEffect(() => { buscar(); }, []);

  const tabId = tab as 'resumo' | 'colaboradores' | 'projetos' | 'clientes';

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

        {projetos.length > 0 && (
          <ColumnLayout columns={2}>
            <Container header={<Header variant="h3">Distribuição por Projeto</Header>}>
              <ResponsiveContainer width="100%" height={300}><PieChart>
                <Pie data={topN(projetos,8,'projeto_key')} cx="50%" cy="50%" outerRadius={95} dataKey="value" label={pieLabel}>
                  {topN(projetos,8,'projeto_key').map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie><Tooltip contentStyle={tt} />
              </PieChart></ResponsiveContainer>
            </Container>
            <Container header={<Header variant="h3">Distribuição por Cliente</Header>}>
              <ResponsiveContainer width="100%" height={300}><PieChart>
                <Pie data={topN(clientes,8,'cliente')} cx="50%" cy="50%" outerRadius={95} dataKey="value" label={pieLabel}>
                  {topN(clientes,8,'cliente').map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie><Tooltip contentStyle={tt} />
              </PieChart></ResponsiveContainer>
            </Container>
          </ColumnLayout>
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
                    const barColor = pct >= 90 ? "#037f0c" : pct >= 70 ? "#f89256" : "#d13212";
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
                    <td style={{ padding: "10px 16px", fontSize: 13, textAlign: "right", fontWeight: 700, color: totalProv > 0 && (totalReal/totalProv*100) >= 90 ? "#037f0c" : "#d13212" }}>
                      {totalProv > 0 ? (totalReal / totalProv * 100).toFixed(0) : 0}%
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ background: "#e9ebed", borderRadius: 4, height: 12, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(totalProv > 0 ? (totalReal/totalProv*100) : 0, 100)}%`, background: totalProv > 0 && (totalReal/totalProv*100) >= 90 ? "#037f0c" : "#d13212", height: "100%", borderRadius: 4 }} />
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
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Colaborador</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Time</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Perfil</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Provisionado</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Realizado</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Diferença</th>
                  <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>%</th>
                  <th style={{ textAlign: "center", padding: "10px 12px", fontSize: 13, color: "#545b64", fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {capacityVsReal.sort((a, b) => a.time.localeCompare(b.time) || a.nome.localeCompare(b.nome)).map(c => (
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
    type ProjRow = {
      _key: string;
      _type: 'parent' | 'child-colab' | 'child-tipo';
      col1: string; col2: string; col3: string; col4: string;
      parentKey?: string;
    };
    const rows: ProjRow[] = [];
    for (const p of ps.sorted) {
      rows.push({
        _key: p.projeto_key,
        _type: 'parent',
        col1: p.projeto_nome,
        col2: p.projeto_key,
        col3: p.horas_por_tipo?.map(t => `${t.issue_type}: ${t.total_horas.toFixed(1)}h`).join(' | ') || '',
        col4: `${p.total_horas.toFixed(1)}h`,
        parentKey: p.projeto_key,
      });
      if (expandedProjeto === p.projeto_key) {
        // Section: Colaboradores
        rows.push({
          _key: `${p.projeto_key}-header-colab`,
          _type: 'child-tipo',
          col1: 'Colaboradores', col2: '', col3: '', col4: '',
          parentKey: p.projeto_key,
        });
        for (const c of [...p.colaboradores].sort((a, b) => b.total_horas - a.total_horas)) {
          rows.push({
            _key: `${p.projeto_key}-colab-${c.nome_colaborador}`,
            _type: 'child-colab',
            col1: c.nome_colaborador,
            col2: `${c.percentual_contribuicao.toFixed(0)}%`,
            col3: c.por_tipo?.map(t => `${t.issue_type}: ${t.total_horas.toFixed(1)}h`).join(' | ') || '',
            col4: `${c.total_horas.toFixed(1)}h`,
            parentKey: p.projeto_key,
          });
        }
        // Section: Por Tipo
        if (p.horas_por_tipo?.length > 0) {
          rows.push({
            _key: `${p.projeto_key}-header-tipo`,
            _type: 'child-tipo',
            col1: 'Por Tipo de Issue', col2: '', col3: '', col4: '',
            parentKey: p.projeto_key,
          });
          for (const t of p.horas_por_tipo) {
            rows.push({
              _key: `${p.projeto_key}-tipo-${t.issue_type}`,
              _type: 'child-colab',
              col1: t.issue_type,
              col2: p.total_horas > 0 ? `${(t.total_horas / p.total_horas * 100).toFixed(0)}%` : '0%',
              col3: '',
              col4: `${t.total_horas.toFixed(1)}h`,
              parentKey: p.projeto_key,
            });
          }
        }
      }
    }

    return (
    <SpaceBetween size="l">
      {projetos.length > 0 && (
        <SpaceBetween size="s" direction="horizontal" alignItems="center">
          <MultiFilter label="Filtrar Projetos" options={projetos.map(p => p.projeto_key)} excluded={exclProjetos} onChange={setExclProjetos} />
          {exclProjetos.size > 0 && <Box color="text-status-inactive" fontSize="body-s">{projetosFiltrados.reduce((s, p) => s + p.total_horas, 0).toFixed(1)}h total filtrado</Box>}
        </SpaceBetween>
      )}

      {projetos.length > 0 && (
        <Container>
          <ResponsiveContainer width="100%" height={Math.max(200, ps.sorted.length * 30)}>
            <BarChart data={ps.sorted.map(p=>({nome:p.projeto_key,horas:p.total_horas}))} layout="vertical">
              <XAxis type="number" tick={{fill:'#aaa',fontSize:11}} /><YAxis type="category" dataKey="nome" tick={{fill:'#aaa',fontSize:11}} width={80} />
              <Tooltip contentStyle={tt} /><Bar dataKey="horas" fill="#4ECDC4" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Container>
      )}

      <Container>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e9ebed" }}>
              <th style={{ width: 40, padding: "12px 8px" }} />
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Projeto</th>
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Key / %</th>
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Tipos de Issue</th>
              <th style={{ textAlign: "right", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Total Horas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isSectionHeader = row._type === 'child-tipo' && (row.col1 === 'Colaboradores' || row.col1 === 'Por Tipo de Issue');
              return (
                <tr
                  key={row._key}
                  style={{
                    borderBottom: "1px solid #e9ebed",
                    backgroundColor: row._type === 'parent' ? 'transparent' : isSectionHeader ? '#e9ebed' : '#f8f9fa',
                    cursor: row._type === 'parent' ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (row._type === 'parent') {
                      setExpandedProjeto(prev => prev === row.parentKey ? null : row.parentKey!);
                    }
                  }}
                >
                  <td style={{ padding: "10px 8px", textAlign: "center", color: "#879596", fontSize: 14 }}>
                    {row._type === 'parent' ? (expandedProjeto === row.parentKey ? '▼' : '▶') : ''}
                  </td>
                  <td style={{
                    padding: row._type === 'parent' ? "10px 16px" : isSectionHeader ? "6px 16px 6px 32px" : "8px 16px 8px 48px",
                    fontWeight: row._type === 'parent' ? 700 : isSectionHeader ? 600 : 400,
                    color: row._type === 'parent' ? "#16191f" : isSectionHeader ? "#545b64" : "#0073bb",
                    fontSize: row._type === 'parent' ? 14 : 13,
                    textTransform: isSectionHeader ? 'uppercase' : 'none',
                    letterSpacing: isSectionHeader ? 1 : 0,
                  }}>
                    {row.col1}
                  </td>
                  <td style={{ padding: "8px 16px", fontSize: 12, color: "#5f6b7a" }}>{row.col2}</td>
                  <td style={{ padding: "8px 16px", fontSize: 12, color: "#5f6b7a" }}>{row.col3}</td>
                  <td style={{ padding: "8px 16px", fontSize: 13, textAlign: "right", fontWeight: row._type === 'parent' ? 600 : 400, color: row._type === 'parent' ? "#16191f" : "#d45b07" }}>
                    {row.col4}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Container>
    </SpaceBetween>
  );
  };

  const renderClientes = () => {
    type CliRow = { _key: string; _type: 'parent' | 'child'; cliente: string; horas: string; tipoOuProjetos: string | React.ReactNode; parentCliente?: string };
    const rows: CliRow[] = [];
    for (const c of cls.sorted) {
      const isBillable = c.cliente !== 'Projetos Internos' && !c.cliente.toLowerCase().startsWith('clouddog');
      rows.push({
        _key: c.cliente,
        _type: 'parent',
        cliente: c.cliente,
        horas: `${c.total_horas.toFixed(1)}h`,
        tipoOuProjetos: isBillable ? 'Billable' : 'Non-Billable',
        parentCliente: c.cliente,
      });
      if (expandedCliente === c.cliente) {
        for (const [idx, d] of (c.colaboradores || []).entries()) {
          rows.push({
            _key: `${c.cliente}-child-${idx}`,
            _type: 'child',
            cliente: d.nome_colaborador,
            horas: `${d.total_horas.toFixed(1)}h`,
            tipoOuProjetos: d.projetos.join(', '),
            parentCliente: c.cliente,
          });
        }
      }
    }

    return (
    <SpaceBetween size="l">
      {clientes.length > 0 && (
        <SpaceBetween size="s" direction="horizontal" alignItems="center">
          <MultiFilter label="Filtrar Clientes" options={clientes.map(c => c.cliente)} excluded={exclClientes} onChange={setExclClientes} />
          {exclClientes.size > 0 && <Box color="text-status-inactive" fontSize="body-s">{clientesFiltrados.reduce((s, c) => s + c.total_horas, 0).toFixed(1)}h total filtrado</Box>}
        </SpaceBetween>
      )}

      {billable && (
        <ColumnLayout columns={3}>
          <Container>
            <Box variant="awsui-key-label">Billable</Box>
            <Box variant="awsui-value-large">
              <StatusIndicator type="success">{billable.billable.toFixed(1)}h</StatusIndicator>
            </Box>
          </Container>
          <Container>
            <Box variant="awsui-key-label">Non-Billable</Box>
            <Box variant="awsui-value-large">
              <StatusIndicator type="error">{billable.non_billable.toFixed(1)}h</StatusIndicator>
            </Box>
          </Container>
          <Container>
            <Box variant="awsui-key-label">% Billable</Box>
            <Box variant="awsui-value-large">
              <StatusIndicator type="info">{billable.percentual_billable.toFixed(1)}%</StatusIndicator>
            </Box>
          </Container>
        </ColumnLayout>
      )}

      {clientes.length > 0 && (
        <Container header={<Header variant="h3">Distribuição por Cliente</Header>}>
          <ResponsiveContainer width="100%" height={300}><PieChart>
            <Pie data={topN(clientesFiltrados,8,'cliente')} cx="50%" cy="50%" outerRadius={110} dataKey="value" label={pieLabel}>
              {topN(clientesFiltrados,8,'cliente').map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
            </Pie><Tooltip contentStyle={tt} /><Legend />
          </PieChart></ResponsiveContainer>
        </Container>
      )}

      <Table
        columnDefinitions={[
          {
            id: 'expand',
            header: '',
            cell: (item: CliRow) => {
              if (item._type === 'child') return '';
              const isExp = expandedCliente === item.parentCliente;
              return <Button variant="inline-icon" iconName={isExp ? 'treeview-collapse' : 'treeview-expand'} onClick={() => setExpandedCliente(isExp ? null : item.parentCliente!)} />;
            },
            width: 50,
          },
          {
            id: 'cliente',
            header: 'Cliente',
            cell: (item: CliRow) => item._type === 'child'
              ? <Box color="text-status-info" fontSize="body-s" padding={{ left: 'l' }}>{item.cliente}</Box>
              : <Box fontWeight="bold">{item.cliente}</Box>,
          },
          {
            id: 'horas',
            header: 'Total Horas',
            cell: (item: CliRow) => item._type === 'child'
              ? <Box fontSize="body-s" color="text-status-warning">{item.horas}</Box>
              : item.horas,
          },
          {
            id: 'tipo',
            header: 'Tipo / Projetos',
            cell: (item: CliRow) => {
              if (item._type === 'child') return <Box fontSize="body-s" color="text-status-inactive">{item.tipoOuProjetos}</Box>;
              const isBillable = item.tipoOuProjetos === 'Billable';
              return isBillable
                ? <StatusIndicator type="success">Billable</StatusIndicator>
                : <StatusIndicator type="error">Non-Billable</StatusIndicator>;
            },
          },
        ]}
        items={rows}
        trackBy="_key"
        variant="container"
        empty={<Box textAlign="center" color="text-status-inactive">Nenhum cliente encontrado</Box>}
      />
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
                <Button variant="primary" onClick={buscar} loading={loading}>
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
                {(['resumo','projetos','clientes','capacity'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '10px 20px', background: 'none', border: 'none',
                    color: tab === t ? '#0073bb' : '#545b64',
                    borderBottom: tab === t ? '3px solid #0073bb' : '3px solid transparent',
                    fontWeight: tab === t ? 700 : 400, cursor: 'pointer', fontSize: 14, textTransform: 'capitalize',
                  }}>{t}</button>
                ))}
              </div>
              {tab === 'resumo' && renderResumo()}
              {tab === 'projetos' && renderProjetos()}
              {tab === 'clientes' && renderClientes()}
              {tab === 'capacity' && <Capacity dataInicio={dataInicio} dataFim={dataFim} />}
            </>
            )}
          </SpaceBetween>
        </ContentLayout>
      }
    />
  );
}
