import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
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
  const toggle = (key: keyof T) => { if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc'); } };
  const indicator = (key: keyof T) => key === sortKey ? (sortDir === 'asc' ? ' \u25b2' : ' \u25bc') : '';
  return { sorted, toggle, indicator };
}

const COLORS = ['#FF6B00','#FF8C38','#FFB070','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#98D8C8','#F7DC6F'];
const O = '#FF6B00';
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
  const [tab, setTab] = useState<'resumo'|'colaboradores'|'projetos'|'clientes'>('resumo');
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

  // Busca automatica ao montar (mes corrente)
  useEffect(() => { buscar(); }, []);
  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e' }}>
      <div style={{ background: '#16213e', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: `2px solid ${O}` }}>
        <img src="/logo-clouddog.svg" alt="CloudDog" style={{ height: 44 }} />
        <span style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>Timetracking</span>
      </div>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 24, flexWrap: 'wrap' }}>
          <div>
            <label htmlFor="di" style={lbl}>{'\u0049\u004e\u00cd\u0043\u0049\u004f'}</label>
            <input id="di" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={inp} />
          </div>
          <div>
            <label htmlFor="df" style={lbl}>FIM</label>
            <input id="df" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} style={inp} />
          </div>
          <button onClick={buscar} disabled={loading} style={{ padding: '10px 28px', background: loading ? '#555' : O, color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', fontFamily: 'Montserrat' }}>
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
        {erro && <p style={{ color: '#ff6b6b', marginBottom: 16 }}>{erro}</p>}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid #2a2a4a' }}>
          {(['resumo','colaboradores','projetos','clientes'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 20px', background: 'none', border: 'none', color: tab === t ? O : '#888', borderBottom: tab === t ? `3px solid ${O}` : '3px solid transparent', fontWeight: tab === t ? 700 : 400, cursor: 'pointer', fontFamily: 'Montserrat', fontSize: 14, textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>

        {(resumo || colaboradores.length > 0) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => exportCSV(tab, resumo, colaboradores, projetos, clientes)}
              style={{ padding: '6px 16px', background: '#2a2a4a', color: '#ccc', border: '1px solid #3a3a5a', borderRadius: 6, cursor: 'pointer', fontFamily: 'Montserrat', fontSize: 12 }}>
              Exportar CSV
            </button>
            <button onClick={() => exportExcel(resumo, colaboradores, projetos, clientes)}
              style={{ padding: '6px 16px', background: '#2a2a4a', color: '#ccc', border: '1px solid #3a3a5a', borderRadius: 6, cursor: 'pointer', fontFamily: 'Montserrat', fontSize: 12 }}>
              Exportar Excel (completo)
            </button>
          </div>
        )}
        {tab === 'resumo' && resumo && (<div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
            <Card label="Total Horas" value={resumo.total_horas_geral.toFixed(1)+'h'} />
            <Card label="Colaboradores" value={String(resumo.total_colaboradores)} />
            <Card label="Projetos" value={String(resumo.total_projetos)} />
            <Card label={'\u004d\u00e9\u0064\u0069\u0061/Colaborador'} value={resumo.media_horas_por_colaborador.toFixed(1)+'h'} />
          </div>
          {colaboradores.length > 0 && <div style={cb}><h3 style={ct}>Horas por Colaborador (Top 10)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={colaboradores.slice().sort((a,b)=>b.total_horas-a.total_horas).slice(0,10).map(c=>({nome:c.nome_colaborador.split(' ')[0],horas:c.total_horas}))}>
                <XAxis dataKey="nome" tick={{fill:'#aaa',fontSize:12}} /><YAxis tick={{fill:'#aaa',fontSize:12}} />
                <Tooltip contentStyle={tt} /><Bar dataKey="horas" fill={O} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer></div>}
          {projetos.length > 0 && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}>
            <div style={cb}><h3 style={ct}>{'\u0044\u0069\u0073\u0074\u0072\u0069\u0062\u0075\u0069\u00e7\u00e3\u006f por Projeto'}</h3>
              <ResponsiveContainer width="100%" height={300}><PieChart>
                <Pie data={topN(projetos,8,'projeto_key')} cx="50%" cy="50%" outerRadius={95} dataKey="value" label={pieLabel}>
                  {topN(projetos,8,'projeto_key').map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie><Tooltip contentStyle={tt} />
              </PieChart></ResponsiveContainer></div>
            <div style={cb}><h3 style={ct}>{'\u0044\u0069\u0073\u0074\u0072\u0069\u0062\u0075\u0069\u00e7\u00e3\u006f por Cliente'}</h3>
              <ResponsiveContainer width="100%" height={300}><PieChart>
                <Pie data={topN(clientes,8,'cliente')} cx="50%" cy="50%" outerRadius={95} dataKey="value" label={pieLabel}>
                  {topN(clientes,8,'cliente').map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie><Tooltip contentStyle={tt} />
              </PieChart></ResponsiveContainer></div>
          </div>}
        </div>)}
        {tab === 'colaboradores' && <div>
          {colaboradores.length > 0 && <div style={{ marginBottom: 12 }}>
            <MultiFilter label="Filtrar Colaboradores" options={colaboradores.map(c => c.nome_colaborador)} excluded={exclColabs} onChange={setExclColabs} />
            {exclColabs.size > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>{colabsFiltrados.reduce((s, c) => s + c.total_horas, 0).toFixed(1)}h total filtrado</span>}
          </div>}
          {colaboradores.length > 0 && <div style={{...cb,marginBottom:16}}>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={cs.sorted.slice(0,15).map(c=>({nome:c.nome_colaborador.split(' ')[0],horas:c.total_horas}))}>
                <XAxis dataKey="nome" tick={{fill:'#aaa',fontSize:11}} /><YAxis tick={{fill:'#aaa',fontSize:11}} />
                <Tooltip contentStyle={tt} /><Bar dataKey="horas" fill={O} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer></div>}
          <table style={tb}><thead><tr>
            <th style={th_} />
            <SortTh label="Colaborador" onClick={()=>cs.toggle('nome_colaborador')} indicator={cs.indicator('nome_colaborador')} />
            <th style={th_}>Cliente</th>
            <SortTh label="Total Horas" onClick={()=>cs.toggle('total_horas')} indicator={cs.indicator('total_horas')} />
          </tr></thead><tbody>
            {cs.sorted.map(c => {
              const isExpanded = expandedColab === c.nome_colaborador;
              return (<Fragment key={c.email_colaborador}>
                <tr style={{borderBottom:'1px solid #2a2a4a', cursor:'pointer'}} onClick={() => setExpandedColab(isExpanded ? null : c.nome_colaborador)}>
                  <td style={{...td, width: 30, textAlign: 'center', color: '#888'}}>{isExpanded ? '\u25bc' : '\u25b6'}</td>
                  <td style={td}>{c.nome_colaborador}</td><td style={{...td, fontSize: 12, color: '#aaa'}}>{c.detalhes_por_cliente.map(dc => dc.cliente).join(', ')}</td><td style={td}>{c.total_horas.toFixed(1)}h</td>
                </tr>
                {isExpanded && c.detalhes_por_cliente.map(dc => (
                  <tr key={c.email_colaborador + '-' + dc.cliente} style={{borderBottom:'1px solid #1a1a3a', background: '#0f1a2e'}}>
                    <td style={td} />
                    <td style={{...td, paddingLeft: 32, color: '#4ECDC4', fontSize: 13}}>
                      {dc.cliente}
                    </td>
                    <td style={{...td, fontSize: 12, color: '#888'}}>{dc.projetos.join(', ')}</td>
                    <td style={{...td, color: '#FFB070'}}>{dc.total_horas.toFixed(1)}h</td>
                  </tr>
                ))}
              </Fragment>);
            })}
          </tbody></table>
        </div>}
        {tab === 'projetos' && <div>
          {projetos.length > 0 && <div style={{ marginBottom: 12 }}>
            <MultiFilter label="Filtrar Projetos" options={projetos.map(p => p.projeto_key)} excluded={exclProjetos} onChange={setExclProjetos} />
            {exclProjetos.size > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>{projetosFiltrados.reduce((s, p) => s + p.total_horas, 0).toFixed(1)}h total filtrado</span>}
          </div>}
          {projetos.length > 0 && <div style={{...cb,marginBottom:16}}>
            <ResponsiveContainer width="100%" height={Math.max(200,ps.sorted.length*30)}>
              <BarChart data={ps.sorted.map(p=>({nome:p.projeto_key,horas:p.total_horas}))} layout="vertical">
                <XAxis type="number" tick={{fill:'#aaa',fontSize:11}} /><YAxis type="category" dataKey="nome" tick={{fill:'#aaa',fontSize:11}} width={80} />
                <Tooltip contentStyle={tt} /><Bar dataKey="horas" fill="#4ECDC4" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer></div>}
          <table style={tb}><thead><tr>
            <SortTh label="Projeto" onClick={()=>ps.toggle('projeto_nome')} indicator={ps.indicator('projeto_nome')} />
            <SortTh label="Key" onClick={()=>ps.toggle('projeto_key')} indicator={ps.indicator('projeto_key')} />
            <SortTh label="Total Horas" onClick={()=>ps.toggle('total_horas')} indicator={ps.indicator('total_horas')} />
          </tr></thead><tbody>
            {ps.sorted.map(p=><tr key={p.projeto_key} style={{borderBottom:'1px solid #2a2a4a'}}>
              <td style={td}>{p.projeto_nome}</td><td style={td}>{p.projeto_key}</td><td style={td}>{p.total_horas.toFixed(1)}h</td>
            </tr>)}
          </tbody></table>
        </div>}
        {tab === 'clientes' && <div>
          {clientes.length > 0 && <div style={{ marginBottom: 12 }}>
            <MultiFilter label="Filtrar Clientes" options={clientes.map(c => c.cliente)} excluded={exclClientes} onChange={setExclClientes} />
            {exclClientes.size > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: '#888' }}>{clientesFiltrados.reduce((s, c) => s + c.total_horas, 0).toFixed(1)}h total filtrado</span>}
          </div>}
          {billable && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
              <div style={{ padding: 20, background: '#16213e', borderRadius: 10, textAlign: 'center', border: '1px solid #2a2a4a' }}>
                <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Billable</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#4ECDC4', marginTop: 8 }}>{billable.billable.toFixed(1)}h</div>
              </div>
              <div style={{ padding: 20, background: '#16213e', borderRadius: 10, textAlign: 'center', border: '1px solid #2a2a4a' }}>
                <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Non-Billable</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#FF6B6B', marginTop: 8 }}>{billable.non_billable.toFixed(1)}h</div>
              </div>
              <div style={{ padding: 20, background: '#16213e', borderRadius: 10, textAlign: 'center', border: '1px solid #2a2a4a' }}>
                <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>% Billable</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#FF6B00', marginTop: 8 }}>{billable.percentual_billable.toFixed(1)}%</div>
              </div>
            </div>
          )}
          {clientes.length > 0 && <div style={{...cb,marginBottom:16}}>
            <ResponsiveContainer width="100%" height={300}><PieChart>
              <Pie data={topN(clientesFiltrados,8,'cliente')} cx="50%" cy="50%" outerRadius={110} dataKey="value" label={pieLabel}>
                {topN(clientesFiltrados,8,'cliente').map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
              </Pie><Tooltip contentStyle={tt} /><Legend />
            </PieChart></ResponsiveContainer></div>}
          <table style={tb}><thead><tr>
            <th style={th_} />
            <SortTh label="Cliente" onClick={()=>cls.toggle('cliente')} indicator={cls.indicator('cliente')} />
            <SortTh label="Total Horas" onClick={()=>cls.toggle('total_horas')} indicator={cls.indicator('total_horas')} />
            <th style={th_}>Tipo</th>
          </tr></thead><tbody>
            {cls.sorted.map(c => {
              const isExpanded = expandedCliente === c.cliente;
              const isBillable = c.cliente !== 'Projetos Internos' && !c.cliente.toLowerCase().startsWith('clouddog');
              const detalhes = c.colaboradores || [];
              return (<Fragment key={c.cliente}>
                <tr style={{borderBottom:'1px solid #2a2a4a', cursor:'pointer'}} onClick={() => setExpandedCliente(isExpanded ? null : c.cliente)}>
                  <td style={{...td, width: 30, textAlign: 'center', color: '#888'}}>{isExpanded ? '\u25bc' : '\u25b6'}</td>
                  <td style={td}>{c.cliente}</td><td style={td}>{c.total_horas.toFixed(1)}h</td>
                  <td style={td}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: isBillable ? '#1c3a2a' : '#3a1c1c', color: isBillable ? '#4ECDC4' : '#FF6B6B' }}>{isBillable ? 'Billable' : 'Non-Billable'}</span></td>
                </tr>
                {isExpanded && detalhes.map(d => (
                  <tr key={c.cliente + '-' + d.nome_colaborador} style={{borderBottom:'1px solid #1a1a3a', background: '#0f1a2e'}}>
                    <td style={td} />
                    <td style={{...td, paddingLeft: 32, color: '#4ECDC4', fontSize: 13}}>{d.nome_colaborador}</td>
                    <td style={{...td, color: '#FFB070'}}>{d.total_horas.toFixed(1)}h</td>
                    <td style={{...td, fontSize: 12, color: '#888'}}>{d.projetos.join(', ')}</td>
                  </tr>
                ))}
              </Fragment>);
            })}
          </tbody></table>
        </div>}      </div>
    </div>
  );
}

function SortTh({label,onClick,indicator}:{label:string;onClick:()=>void;indicator:string}) {
  return <th style={{...th_,cursor:'pointer',userSelect:'none'}} onClick={onClick}>{label}{indicator}</th>;
}
function Card({label,value}:{label:string;value:string}) {
  return (<div style={{padding:20,background:'#16213e',borderRadius:10,textAlign:'center',border:'1px solid #2a2a4a'}}>
    <div style={{fontSize:12,color:'#888',textTransform:'uppercase',letterSpacing:1}}>{label}</div>
    <div style={{fontSize:32,fontWeight:700,color:'#FF6B00',marginTop:8}}>{value}</div>
  </div>);
}

const lbl: React.CSSProperties = {fontSize:12,color:'#aaa',display:'block',marginBottom:4,textTransform:'uppercase',letterSpacing:1};
const inp: React.CSSProperties = {padding:'10px 12px',background:'#16213e',border:'1px solid #2a2a4a',borderRadius:6,color:'#e0e0e0',fontFamily:'Montserrat',fontSize:14};
const tb: React.CSSProperties = {width:'100%',borderCollapse:'collapse',background:'#16213e',borderRadius:10,overflow:'hidden'};
const th_: React.CSSProperties = {textAlign:'left',padding:'12px 16px',color:'#FF6B00',fontSize:12,textTransform:'uppercase',letterSpacing:1,borderBottom:'2px solid #2a2a4a'};
const td: React.CSSProperties = {padding:'10px 16px',color:'#ccc',fontSize:14};
const cb: React.CSSProperties = {background:'#16213e',borderRadius:10,padding:20,border:'1px solid #2a2a4a'};
const ct: React.CSSProperties = {color:'#fff',fontSize:14,fontWeight:600,marginBottom:16};
const tt: React.CSSProperties = {background:'#16213e',border:'1px solid #333',borderRadius:6};
