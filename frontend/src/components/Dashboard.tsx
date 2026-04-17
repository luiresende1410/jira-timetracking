import { useState, useMemo, useEffect, useCallback } from 'react';
import MultiFilter from './MultiFilter';
import { getRelatorioCompleto } from '../api';
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
  const [exclColabs, setExclColabs] = useState<Set<string>>(new Set());
  const [exclProjetos, setExclProjetos] = useState<Set<string>>(new Set());
  const [exclClientes, setExclClientes] = useState<Set<string>>(new Set());
  const [expandedColab, setExpandedColab] = useState<string | null>(null);
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null);

  const colabsFiltrados = useMemo(() =>
    exclColabs.size === 0 ? colaboradores : colaboradores.filter(c => !exclColabs.has(c.nome_colaborador)),
    [colaboradores, exclColabs]);
  const projetosFiltrados = useMemo(() =>
    exclProjetos.size === 0 ? projetos : projetos.filter(p => !exclProjetos.has(p.projeto_key)),
    [projetos, exclProjetos]);
  const clientesFiltrados = useMemo(() =>
    exclClientes.size === 0 ? clientes : clientes.filter(c => !exclClientes.has(c.cliente)),
    [clientes, exclClientes]);

  const cs = useSortable(colabsFiltrados, 'total_horas');
  const ps = useSortable(projetosFiltrados, 'total_horas');
  const cls = useSortable(clientesFiltrados, 'total_horas');

  const buscar = useCallback(async () => {
    if (!dataInicio || !dataFim) return;
    setLoading(true); setErro('');
    try {
      const d = await getRelatorioCompleto(dataInicio, dataFim);
      setResumo(d.resumo); setColaboradores(d.colaboradores); setProjetos(d.projetos); setClientes(d.clientes); setBillable(d.billable);
      setExclColabs(new Set()); setExclProjetos(new Set()); setExclClientes(new Set());
      setExpandedColab(null); setExpandedCliente(null);
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
      </SpaceBetween>
    );
  };

  const renderColaboradores = () => {
    type ColabRow = { _key: string; _type: "parent" | "child"; col1: string; col2: string; col3: string; parentName?: string };
    const rows: ColabRow[] = [];
    for (const c of cs.sorted) {
      rows.push({
        _key: c.email_colaborador,
        _type: "parent",
        col1: c.nome_colaborador,
        col2: "",
        col3: `${c.total_horas.toFixed(1)}h`,
        parentName: c.nome_colaborador,
      });
      if (expandedColab === c.nome_colaborador) {
        for (const [idx, dc] of c.detalhes_por_cliente.entries()) {
          rows.push({
            _key: `${c.email_colaborador}-child-${idx}`,
            _type: "child",
            col1: dc.cliente,
            col2: dc.projetos.join(", "),
            col3: `${dc.total_horas.toFixed(1)}h`,
            parentName: c.nome_colaborador,
          });
        }
      }
    }

    return (
    <SpaceBetween size="l">
      {colaboradores.length > 0 && (
        <SpaceBetween size="s" direction="horizontal" alignItems="center">
          <MultiFilter label="Filtrar Colaboradores" options={colaboradores.map(c => c.nome_colaborador)} excluded={exclColabs} onChange={setExclColabs} />
          {exclColabs.size > 0 && <Box color="text-status-inactive" fontSize="body-s">{colabsFiltrados.reduce((s, c) => s + c.total_horas, 0).toFixed(1)}h total filtrado</Box>}
        </SpaceBetween>
      )}

      {colaboradores.length > 0 && (
        <Container>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={cs.sorted.slice(0,15).map(c=>({nome:c.nome_colaborador.split(" ")[0],horas:c.total_horas}))}>
              <XAxis dataKey="nome" tick={{fill:"#aaa",fontSize:11}} /><YAxis tick={{fill:"#aaa",fontSize:11}} />
              <Tooltip contentStyle={tt} /><Bar dataKey="horas" fill="#FF6B00" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Container>
      )}

      <Container>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e9ebed" }}>
              <th style={{ width: 40, padding: "12px 8px" }} />
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Colaborador</th>
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Projetos</th>
              <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 14, color: "#545b64" }}>Total Horas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row._key}
                style={{
                  borderBottom: "1px solid #e9ebed",
                  backgroundColor: row._type === "child" ? "#f2f3f3" : "transparent",
                  cursor: row._type === "parent" ? "pointer" : "default",
                }}
                onClick={() => {
                  if (row._type === "parent") {
                    setExpandedColab(prev => prev === row.parentName ? null : row.parentName!);
                  }
                }}
              >
                <td style={{ padding: "10px 8px", textAlign: "center", color: "#879596", fontSize: 14 }}>
                  {row._type === "parent" ? (expandedColab === row.parentName ? "▼" : "▶") : ""}
                </td>
                <td style={{
                  padding: row._type === "child" ? "8px 16px 8px 40px" : "10px 16px",
                  fontWeight: row._type === "parent" ? 700 : 400,
                  color: row._type === "child" ? "#0073bb" : "#16191f",
                  fontSize: 14,
                }}>
                  {row.col1}
                </td>
                <td style={{ padding: "10px 16px", fontSize: 13, color: "#5f6b7a" }}>
                  {row.col2}
                </td>
                <td style={{
                  padding: "10px 16px",
                  fontWeight: row._type === "parent" ? 600 : 400,
                  color: row._type === "child" ? "#d45b07" : "#16191f",
                  fontSize: 14,
                }}>
                  {row.col3}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Container>
    </SpaceBetween>
  );
  };

  const renderProjetos = () => (
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

      <Table
        columnDefinitions={[
          {
            id: 'nome',
            header: 'Projeto',
            cell: (item: RelatorioProjeto) => item.projeto_nome,
            sortingField: 'projeto_nome',
          },
          {
            id: 'key',
            header: 'Key',
            cell: (item: RelatorioProjeto) => item.projeto_key,
            sortingField: 'projeto_key',
          },
          {
            id: 'horas',
            header: 'Total Horas',
            cell: (item: RelatorioProjeto) => `${item.total_horas.toFixed(1)}h`,
            sortingField: 'total_horas',
          },
        ]}
        items={ps.sorted}
        sortingColumn={
          ps.sortKey === 'projeto_nome'
            ? { sortingField: 'projeto_nome' }
            : ps.sortKey === 'projeto_key'
            ? { sortingField: 'projeto_key' }
            : { sortingField: 'total_horas' }
        }
        sortingDescending={ps.sortDir === 'desc'}
        onSortingChange={({ detail }) => {
          const field = detail.sortingColumn.sortingField;
          if (field === 'projeto_nome') ps.toggle('projeto_nome');
          else if (field === 'projeto_key') ps.toggle('projeto_key');
          else if (field === 'total_horas') ps.toggle('total_horas');
        }}
        trackBy="projeto_key"
        variant="container"
        empty={<Box textAlign="center" color="text-status-inactive">Nenhum projeto encontrado</Box>}
      />
    </SpaceBetween>
  );

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
                {(['resumo','colaboradores','projetos','clientes','capacity'] as const).map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '10px 20px', background: 'none', border: 'none',
                    color: tab === t ? '#0073bb' : '#545b64',
                    borderBottom: tab === t ? '3px solid #0073bb' : '3px solid transparent',
                    fontWeight: tab === t ? 700 : 400, cursor: 'pointer', fontSize: 14, textTransform: 'capitalize',
                  }}>{t}</button>
                ))}
              </div>
              {tab === 'resumo' && renderResumo()}
              {tab === 'colaboradores' && renderColaboradores()}
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
