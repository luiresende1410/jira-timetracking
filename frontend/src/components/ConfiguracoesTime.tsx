import { useState, useMemo, useEffect } from 'react';
import {
  getColaboradores,
  updateColaborador,
  deleteColaborador,
  getPerfis,
  getPerfisCapacity,
  updatePerfilCapacity,
  createPerfilCapacity,
  deletePerfilCapacity,
  type ColaboradorConfig,
} from '../api';

import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Spinner from '@cloudscape-design/components/spinner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ColaboradorFormState {
  nome: string;
  perfil: string;
  time: string;
  ausencias: string[];
}

interface ColaboradorFormErrors {
  nome?: string;
  time?: string;
}

interface PerfilCapacityFormState {
  [categoria: string]: string;
}

interface PerfilCapacityFormErrors {
  [categoria: string]: string | undefined;
}

// ─── Styles (same as ConfiguracoesMSP.tsx) ────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const modalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 8,
  padding: '28px 32px',
  minWidth: 380,
  maxWidth: 480,
  width: '100%',
  boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
};

const fieldStyle: React.CSSProperties = {
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#16191f',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  fontSize: 13,
  border: '1px solid #aab7b8',
  borderRadius: 4,
  outline: 'none',
  background: '#fff',
  color: '#16191f',
  boxSizing: 'border-box',
};

const errorMsgStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#d13212',
  marginTop: 3,
};

const modalActionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 24,
};

const FORM_COLAB_VAZIO: ColaboradorFormState = { nome: '', perfil: 'Efetivo', time: '', ausencias: [] };

// ─── Component ────────────────────────────────────────────────────────────────


// ─── AusenciasField ───────────────────────────────────────────────────────────

function validarEntrada(val: string): string | null {
  const single = /^\d{4}-\d{2}-\d{2}$/;
  const range  = /^\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}$/;
  if (!single.test(val) && !range.test(val)) return 'Use YYYY-MM-DD ou YYYY-MM-DD/YYYY-MM-DD';
  return null;
}

function AusenciasField({ ausencias, onChange }: { ausencias: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  const [erro, setErro] = useState('');

  function adicionar() {
    const val = input.trim();
    if (!val) return;
    const err = validarEntrada(val);
    if (err) { setErro(err); return; }
    if (ausencias.includes(val)) { setErro('Ja adicionado'); return; }
    onChange([...ausencias, val]);
    setInput(''); setErro('');
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#16191f', marginBottom: 4 }}>Ausencias</label>
      <div style={{ fontSize: 12, color: '#879596', marginBottom: 8 }}>
        Data unica: <code>2026-05-05</code> &nbsp;|&nbsp; Range: <code>2026-05-05/2026-05-09</code>
      </div>
      {ausencias.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {ausencias.map((a, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#e8f4fd', color: '#0073bb', padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
              {a}
              <button onClick={() => onChange(ausencias.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0073bb', fontSize: 14, lineHeight: 1, padding: 0 }} title="Remover">x</button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setErro(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
          placeholder="2026-05-05 ou 2026-05-05/2026-05-09"
          style={{ flex: 1, padding: '6px 10px', fontSize: 13, border: `1px solid ${erro ? '#d13212' : '#aab7b8'}`, borderRadius: 4, outline: 'none', background: '#fff', color: '#16191f' }}
        />
        <button onClick={adicionar} style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #0073bb', background: '#0073bb', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>+</button>
      </div>
      {erro && <div style={{ fontSize: 12, color: '#d13212', marginTop: 3 }}>{erro}</div>}
    </div>
  );
}
export default function ConfiguracoesTime({ secao }: { secao?: 'colaboradores' | 'perfis' } = {}) {
  // Colaboradores
  const [colaboradores, setColaboradores] = useState<Record<string, ColaboradorConfig>>({});
  const [perfisDisponiveis, setPerfisDisponiveis] = useState<string[]>([]);
  const [loadingColab, setLoadingColab] = useState(false);
  const [erroColab, setErroColab] = useState('');

  // Perfis Capacity
  const [perfis, setPerfis] = useState<Record<string, Record<string, number>>>({});
  const [loadingPerfis, setLoadingPerfis] = useState(false);
  const [erroPerfis, setErroPerfis] = useState('');

  // Modais colaboradores
  const [modalAddColab, setModalAddColab] = useState(false);
  const [modalEditColab, setModalEditColab] = useState<string | null>(null);
  const [modalRemoveColab, setModalRemoveColab] = useState<string | null>(null);

  // Modal perfil capacity
  const [modalEditPerfil, setModalEditPerfil] = useState<string | null>(null);
  const [modalNovoPerfil, setModalNovoPerfil] = useState(false);
  const [modalRemovePerfil, setModalRemovePerfil] = useState<string | null>(null);
  const [formNovoPerfil, setFormNovoPerfil] = useState({ nome: '', categorias: [{ nome: '', horas: '' }] });
  const [errosNovoPerfil, setErrosNovoPerfil] = useState<{ nome?: string; categorias?: string[] }>({});

  // Notificacao global
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Salvando
  const [salvando, setSalvando] = useState(false);

  // Filtro colaboradores
  const [filtroNome, setFiltroNome] = useState('');

  // Form states
  const [formAddColab, setFormAddColab] = useState<ColaboradorFormState>(FORM_COLAB_VAZIO);
  const [errosAddColab, setErrosAddColab] = useState<ColaboradorFormErrors>({});
  const [formEditColab, setFormEditColab] = useState<ColaboradorFormState>(FORM_COLAB_VAZIO);
  const [errosEditColab, setErrosEditColab] = useState<ColaboradorFormErrors>({});
  const [formEditPerfil, setFormEditPerfil] = useState<PerfilCapacityFormState>({});
  const [errosEditPerfil, setErrosEditPerfil] = useState<PerfilCapacityFormErrors>({});

  // ── Load on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
    setLoadingColab(true);
    Promise.all([getColaboradores(), getPerfis()])
      .then(([colabs, perfisData]) => {
        setColaboradores(colabs);
        setPerfisDisponiveis(Object.keys(perfisData));
      })
      .catch(err => setErroColab(err instanceof Error ? err.message : 'Erro ao carregar colaboradores'))
      .finally(() => setLoadingColab(false));

    setLoadingPerfis(true);
    getPerfisCapacity()
      .then(data => setPerfis(data))
      .catch(err => setErroPerfis(err instanceof Error ? err.message : 'Erro ao carregar perfis'))
      .finally(() => setLoadingPerfis(false));
  }, []);

  // ── Derived list ───────────────────────────────────────────────────────────

  const colaboradoresFiltrados = useMemo(() => {
    return Object.entries(colaboradores)
      .map(([nome, dados]) => ({ nome, ...dados }))
      .filter(c => c.nome.toLowerCase().includes(filtroNome.toLowerCase()))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores, filtroNome]);

  // ── Add colaborador ────────────────────────────────────────────────────────

  function abrirAddColab() {
    setFormAddColab({ ...FORM_COLAB_VAZIO, perfil: perfisDisponiveis[0] || 'Efetivo' });
    setErrosAddColab({});
    setModalAddColab(true);
  }

  function fecharAddColab() {
    setModalAddColab(false);
    setErrosAddColab({});
  }

  async function salvarAddColab() {
    const erros: ColaboradorFormErrors = {};
    if (!formAddColab.nome.trim()) erros.nome = 'Campo obrigatorio';
    else if (colaboradores[formAddColab.nome.trim()] !== undefined) erros.nome = 'Ja existe um colaborador com este nome';
    if (!formAddColab.time.trim()) erros.time = 'Campo obrigatorio';
    if (Object.keys(erros).length > 0) { setErrosAddColab(erros); return; }

    setSalvando(true);
    const nomeTrimmed = formAddColab.nome.trim();
    try {
      await updateColaborador(nomeTrimmed, formAddColab.perfil, formAddColab.time.trim(), formAddColab.ausencias);
      setColaboradores(prev => ({ ...prev, [nomeTrimmed]: { perfil: formAddColab.perfil, time: formAddColab.time.trim(), ausencias: formAddColab.ausencias } }));
      setNotification({ type: 'success', message: `Colaborador "${nomeTrimmed}" adicionado com sucesso.` });
      fecharAddColab();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao adicionar' });
    } finally {
      setSalvando(false);
    }
  }

  // ── Edit colaborador ───────────────────────────────────────────────────────

  function abrirEditColab(nome: string) {
    const c = colaboradores[nome];
    if (!c) return;
    setFormEditColab({ nome, perfil: c.perfil, time: c.time, ausencias: c.ausencias ?? [] });
    setErrosEditColab({});
    setModalEditColab(nome);
  }

  function fecharEditColab() {
    setModalEditColab(null);
    setErrosEditColab({});
  }

  async function salvarEditColab() {
    const erros: ColaboradorFormErrors = {};
    if (!formEditColab.time.trim()) erros.time = 'Campo obrigatorio';
    if (Object.keys(erros).length > 0) { setErrosEditColab(erros); return; }

    setSalvando(true);
    const nome = modalEditColab!;
    try {
      await updateColaborador(nome, formEditColab.perfil, formEditColab.time.trim(), formEditColab.ausencias);
      setColaboradores(prev => ({ ...prev, [nome]: { perfil: formEditColab.perfil, time: formEditColab.time.trim(), ausencias: formEditColab.ausencias } }));
      setNotification({ type: 'success', message: `Colaborador "${nome}" atualizado com sucesso.` });
      fecharEditColab();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao salvar' });
    } finally {
      setSalvando(false);
    }
  }

  // ── Remove colaborador ─────────────────────────────────────────────────────

  function abrirRemoveColab(nome: string) {
    setModalRemoveColab(nome);
  }

  function fecharRemoveColab() {
    setModalRemoveColab(null);
  }

  async function confirmarRemoveColab() {
    if (!modalRemoveColab) return;
    setSalvando(true);
    const nome = modalRemoveColab;
    try {
      await deleteColaborador(nome);
      setColaboradores(prev => {
        const next = { ...prev };
        delete next[nome];
        return next;
      });
      setNotification({ type: 'success', message: `Colaborador "${nome}" removido com sucesso.` });
      fecharRemoveColab();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao remover' });
      fecharRemoveColab();
    } finally {
      setSalvando(false);
    }
  }

  // ── Edit perfil capacity ───────────────────────────────────────────────────

  function abrirEditPerfil(perfil: string) {
    const categorias = perfis[perfil];
    if (!categorias) return;
    const form: PerfilCapacityFormState = {};
    for (const [cat, val] of Object.entries(categorias)) {
      form[cat] = String(val);
    }
    setFormEditPerfil(form);
    setErrosEditPerfil({});
    setModalEditPerfil(perfil);
  }

  function fecharEditPerfil() {
    setModalEditPerfil(null);
    setErrosEditPerfil({});
  }

  async function salvarEditPerfil() {
    const erros: PerfilCapacityFormErrors = {};
    for (const [cat, val] of Object.entries(formEditPerfil)) {
      const n = Number(val);
      if (val.trim() === '' || isNaN(n)) erros[cat] = 'Valor invalido';
      else if (n < 0) erros[cat] = 'Valor deve ser maior ou igual a zero';
    }
    if (Object.keys(erros).length > 0) { setErrosEditPerfil(erros); return; }

    setSalvando(true);
    const perfil = modalEditPerfil!;
    const categorias: Record<string, number> = {};
    for (const [cat, val] of Object.entries(formEditPerfil)) {
      categorias[cat] = Number(val);
    }
    try {
      const resultado = await updatePerfilCapacity(perfil, categorias);
      setPerfis(prev => ({ ...prev, [perfil]: resultado }));
      setNotification({ type: 'success', message: `Perfil "${perfil}" atualizado com sucesso.` });
      fecharEditPerfil();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao salvar' });
    } finally {
      setSalvando(false);
    }
  }

  // ── Novo perfil ───────────────────────────────────────────────────────────

  function abrirNovoPerfil() {
    setFormNovoPerfil({ nome: '', categorias: [{ nome: '', horas: '' }] });
    setErrosNovoPerfil({});
    setModalNovoPerfil(true);
  }

  function fecharNovoPerfil() {
    setModalNovoPerfil(false);
    setErrosNovoPerfil({});
  }

  async function salvarNovoPerfil() {
    const erros: { nome?: string; categorias?: string[] } = {};
    if (!formNovoPerfil.nome.trim()) erros.nome = 'Campo obrigatório';
    else if (perfis[formNovoPerfil.nome.trim()]) erros.nome = 'Já existe um perfil com este nome';
    const errosCats: string[] = formNovoPerfil.categorias.map(c => {
      if (!c.nome.trim()) return 'Nome obrigatório';
      const n = Number(c.horas);
      if (c.horas.trim() === '' || isNaN(n)) return 'Valor inválido';
      if (n < 0) return 'Deve ser ≥ 0';
      return '';
    });
    if (errosCats.some(e => e)) erros.categorias = errosCats;
    if (Object.keys(erros).length > 0) { setErrosNovoPerfil(erros); return; }

    setSalvando(true);
    const nomePerfil = formNovoPerfil.nome.trim();
    const categorias: Record<string, number> = {};
    for (const c of formNovoPerfil.categorias) {
      categorias[c.nome.trim()] = Number(c.horas);
    }
    try {
      const resultado = await createPerfilCapacity(nomePerfil, categorias);
      setPerfis(prev => ({ ...prev, [nomePerfil]: resultado }));
      setPerfisDisponiveis(prev => [...prev, nomePerfil].sort());
      setNotification({ type: 'success', message: `Perfil "${nomePerfil}" criado com sucesso.` });
      fecharNovoPerfil();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao criar perfil' });
    } finally {
      setSalvando(false);
    }
  }

  // ── Excluir perfil ─────────────────────────────────────────────────────────

  async function confirmarRemovePerfil() {
    if (!modalRemovePerfil) return;
    setSalvando(true);
    const perfil = modalRemovePerfil;
    try {
      await deletePerfilCapacity(perfil);
      setPerfis(prev => { const next = { ...prev }; delete next[perfil]; return next; });
      setPerfisDisponiveis(prev => prev.filter(p => p !== perfil));
      setNotification({ type: 'success', message: `Perfil "${perfil}" excluído com sucesso.` });
      setModalRemovePerfil(null);
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao excluir' });
      setModalRemovePerfil(null);
    } finally {
      setSalvando(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SpaceBetween size="l">
      {/* secao prop controls which section to show; undefined = show both */}
      {/* Notification */}
      {notification && (
        <Alert
          type={notification.type}
          dismissible
          onDismiss={() => setNotification(null)}
        >
          {notification.message}
        </Alert>
      )}

      {/* ── Secao 1: Gerenciar Colaboradores ── */}
      {(!secao || secao === 'colaboradores') && <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button variant="primary" onClick={abrirAddColab} disabled={loadingColab}>
                Adicionar Colaborador
              </Button>
            }
          >
            Gerenciar Colaboradores
          </Header>
        }
      >
        {loadingColab ? (
          <Box textAlign="center" padding="l">
            <Spinner size="large" />
          </Box>
        ) : erroColab ? (
          <Alert type="error">{erroColab}</Alert>
        ) : (
          <SpaceBetween size="m">
            {/* Filtro */}
            <div style={{ maxWidth: 320 }}>
              <label style={labelStyle}>Buscar por nome</label>
              <input
                type="text"
                value={filtroNome}
                onChange={e => setFiltroNome(e.target.value)}
                placeholder="Buscar por nome..."
                style={inputStyle}
              />
            </div>

            {/* Tabela */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e9ebed', background: '#f2f3f3' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Nome</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Perfil</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Time</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Dias Ausentes</th>
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {colaboradoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px 16px', textAlign: 'center', color: '#879596', fontSize: 13 }}>
                      Nenhum colaborador encontrado.
                    </td>
                  </tr>
                ) : (
                  colaboradoresFiltrados.map(row => (
                    <tr key={row.nome} style={{ borderBottom: '1px solid #e9ebed' }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{row.nome}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#5f6b7a' }}>{row.perfil}</td>
                      <td style={{ padding: '10px 12px', fontSize: 13, color: '#5f6b7a' }}>{row.time}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {(row.ausencias ?? []).length > 0 ? (
                          <span style={{ background: '#e8f4fd', color: '#0073bb', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                            {(row.ausencias ?? []).length} entrada{(row.ausencias ?? []).length !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span style={{ color: '#879596', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <Button variant="inline-link" onClick={() => abrirEditColab(row.nome)}>
                            Editar
                          </Button>
                          <Button variant="inline-link" onClick={() => abrirRemoveColab(row.nome)}>
                            Remover
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SpaceBetween>
        )}
      </Container>}

      {/* ── Secao 2: Gerenciar Horas por Perfil ── */}
      {(!secao || secao === 'perfis') && <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button variant="primary" onClick={abrirNovoPerfil} disabled={loadingPerfis}>
                Novo Perfil
              </Button>
            }
          >
            Gerenciar Horas por Perfil
          </Header>
        }
      >
        {loadingPerfis ? (
          <Box textAlign="center" padding="l">
            <Spinner size="large" />
          </Box>
        ) : erroPerfis ? (
          <Alert type="error">{erroPerfis}</Alert>
        ) : (
          <SpaceBetween size="m">
            {Object.entries(perfis).map(([nomePerfil, categorias]) => {
              const total = Object.values(categorias).reduce((s, v) => s + v, 0);
              return (
                <div
                  key={nomePerfil}
                  style={{
                    border: '1px solid #e9ebed',
                    borderRadius: 6,
                    padding: '16px 20px',
                    background: '#fafafa',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#16191f' }}>{nomePerfil}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: 13, color: '#545b64' }}>
                        Total: <strong>{total.toFixed(1)}h/dia</strong>
                      </span>
                      <Button variant="inline-link" onClick={() => abrirEditPerfil(nomePerfil)}>
                        Editar
                      </Button>
                      <Button variant="inline-link" onClick={() => setModalRemovePerfil(nomePerfil)}>
                        <span style={{ color: '#d13212' }}>Excluir</span>
                      </Button>
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e9ebed' }}>
                        <th style={{ textAlign: 'left', padding: '6px 0', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Categoria</th>
                        <th style={{ textAlign: 'right', padding: '6px 0', fontSize: 12, color: '#545b64', fontWeight: 600 }}>Horas/dia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(categorias).map(([cat, horas]) => (
                        <tr key={cat} style={{ borderBottom: '1px solid #f2f3f3' }}>
                          <td style={{ padding: '5px 0', fontSize: 13, color: '#16191f' }}>{cat}</td>
                          <td style={{ padding: '5px 0', fontSize: 13, textAlign: 'right', color: '#0073bb', fontWeight: 600 }}>{horas.toFixed(1)}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </SpaceBetween>
        )}
      </Container>}

      {/* ── Modal: Adicionar Colaborador ── */}
      {modalAddColab && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Adicionar Colaborador
            </h3>

            <div style={fieldStyle}>
              <label style={labelStyle}>Nome</label>
              <input
                type="text"
                value={formAddColab.nome}
                onChange={e => setFormAddColab(f => ({ ...f, nome: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosAddColab.nome ? '#d13212' : '#aab7b8' }}
                placeholder="Nome do colaborador"
              />
              {errosAddColab.nome && <div style={errorMsgStyle}>{errosAddColab.nome}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Perfil</label>
              <select
                value={formAddColab.perfil}
                onChange={e => setFormAddColab(f => ({ ...f, perfil: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {perfisDisponiveis.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Time</label>
              <input
                type="text"
                value={formAddColab.time}
                onChange={e => setFormAddColab(f => ({ ...f, time: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosAddColab.time ? '#d13212' : '#aab7b8' }}
                placeholder="Nome do time"
              />
              {errosAddColab.time && <div style={errorMsgStyle}>{errosAddColab.time}</div>}
            </div>

            <AusenciasField
              ausencias={formAddColab.ausencias}
              onChange={ausencias => setFormAddColab(f => ({ ...f, ausencias }))}
            />

            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharAddColab} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={salvarAddColab} loading={salvando}>
                Adicionar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar Colaborador ── */}
      {modalEditColab !== null && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Editar Colaborador
            </h3>

            <div style={fieldStyle}>
              <label style={labelStyle}>Nome</label>
              <div style={{ ...inputStyle, background: '#f2f3f3', color: '#545b64', cursor: 'default' }}>
                {modalEditColab}
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Perfil</label>
              <select
                value={formEditColab.perfil}
                onChange={e => setFormEditColab(f => ({ ...f, perfil: e.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {perfisDisponiveis.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Time</label>
              <input
                type="text"
                value={formEditColab.time}
                onChange={e => setFormEditColab(f => ({ ...f, time: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosEditColab.time ? '#d13212' : '#aab7b8' }}
              />
              {errosEditColab.time && <div style={errorMsgStyle}>{errosEditColab.time}</div>}
            </div>

            <AusenciasField
              ausencias={formEditColab.ausencias}
              onChange={ausencias => setFormEditColab(f => ({ ...f, ausencias }))}
            />

            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharEditColab} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={salvarEditColab} loading={salvando}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar Remocao ── */}
      {modalRemoveColab !== null && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Confirmar Remocao
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#16191f' }}>
              Tem certeza que deseja remover o colaborador:
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: '#d13212' }}>
              {modalRemoveColab}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: '#879596' }}>
              Esta acao nao pode ser desfeita.
            </p>
            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharRemoveColab} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarRemoveColab} loading={salvando}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Editar Perfil Capacity ── */}
      {modalEditPerfil !== null && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Editar Perfil: {modalEditPerfil}
            </h3>

            {Object.keys(formEditPerfil).map(cat => (
              <div key={cat} style={fieldStyle}>
                <label style={labelStyle}>{cat} (horas/dia)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={formEditPerfil[cat]}
                  onChange={e => setFormEditPerfil(f => ({ ...f, [cat]: e.target.value }))}
                  style={{ ...inputStyle, borderColor: errosEditPerfil[cat] ? '#d13212' : '#aab7b8' }}
                />
                {errosEditPerfil[cat] && <div style={errorMsgStyle}>{errosEditPerfil[cat]}</div>}
              </div>
            ))}

            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharEditPerfil} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={salvarEditPerfil} loading={salvando}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Novo Perfil ── */}
      {modalNovoPerfil && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 520 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Novo Perfil
            </h3>

            <div style={fieldStyle}>
              <label style={labelStyle}>Nome do Perfil</label>
              <input
                type="text"
                value={formNovoPerfil.nome}
                onChange={e => setFormNovoPerfil(f => ({ ...f, nome: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosNovoPerfil.nome ? '#d13212' : '#aab7b8' }}
                placeholder="Ex: Sênior, Júnior, Consultor..."
              />
              {errosNovoPerfil.nome && <div style={errorMsgStyle}>{errosNovoPerfil.nome}</div>}
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Categorias de Horas</label>
              {formNovoPerfil.categorias.map((cat, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 2 }}>
                    <input
                      type="text"
                      value={cat.nome}
                      onChange={e => setFormNovoPerfil(f => {
                        const cats = [...f.categorias];
                        cats[idx] = { ...cats[idx], nome: e.target.value };
                        return { ...f, categorias: cats };
                      })}
                      placeholder="Nome da categoria"
                      style={{ ...inputStyle, borderColor: errosNovoPerfil.categorias?.[idx] ? '#d13212' : '#aab7b8' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={cat.horas}
                      onChange={e => setFormNovoPerfil(f => {
                        const cats = [...f.categorias];
                        cats[idx] = { ...cats[idx], horas: e.target.value };
                        return { ...f, categorias: cats };
                      })}
                      placeholder="h/dia"
                      style={{ ...inputStyle, borderColor: errosNovoPerfil.categorias?.[idx] ? '#d13212' : '#aab7b8' }}
                    />
                  </div>
                  <button
                    onClick={() => setFormNovoPerfil(f => ({ ...f, categorias: f.categorias.filter((_, i) => i !== idx) }))}
                    disabled={formNovoPerfil.categorias.length <= 1}
                    style={{ padding: '7px 10px', border: '1px solid #aab7b8', borderRadius: 4, background: '#f2f3f3', cursor: 'pointer', color: '#d13212', fontSize: 14, lineHeight: 1 }}
                  >
                    ✕
                  </button>
                  {errosNovoPerfil.categorias?.[idx] && (
                    <div style={{ ...errorMsgStyle, alignSelf: 'center' }}>{errosNovoPerfil.categorias[idx]}</div>
                  )}
                </div>
              ))}
              <button
                onClick={() => setFormNovoPerfil(f => ({ ...f, categorias: [...f.categorias, { nome: '', horas: '' }] }))}
                style={{ fontSize: 12, color: '#0073bb', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}
              >
                + Adicionar categoria
              </button>
            </div>

            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharNovoPerfil} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={salvarNovoPerfil} loading={salvando}>
                Criar Perfil
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar Exclusão de Perfil ── */}
      {modalRemovePerfil !== null && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Excluir Perfil
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#16191f' }}>
              Tem certeza que deseja excluir o perfil:
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#d13212' }}>
              {modalRemovePerfil}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: '#879596' }}>
              Esta ação não pode ser desfeita. Colaboradores com este perfil não serão afetados.
            </p>
            <div style={modalActionsStyle}>
              <Button variant="link" onClick={() => setModalRemovePerfil(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarRemovePerfil} loading={salvando}>
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}    </SpaceBetween>
  );
}






