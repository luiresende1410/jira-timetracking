import { useState, useMemo, useEffect } from 'react';
import {
  getColaboradores,
  updateColaborador,
  deleteColaborador,
  getPerfis,
  getPerfisCapacity,
  updatePerfilCapacity,
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

const FORM_COLAB_VAZIO: ColaboradorFormState = { nome: '', perfil: 'Efetivo', time: '' };

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfiguracoesTime() {
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
      await updateColaborador(nomeTrimmed, formAddColab.perfil, formAddColab.time.trim());
      setColaboradores(prev => ({ ...prev, [nomeTrimmed]: { perfil: formAddColab.perfil, time: formAddColab.time.trim() } }));
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
    setFormEditColab({ nome, perfil: c.perfil, time: c.time });
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
      await updateColaborador(nome, formEditColab.perfil, formEditColab.time.trim());
      setColaboradores(prev => ({ ...prev, [nome]: { perfil: formEditColab.perfil, time: formEditColab.time.trim() } }));
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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SpaceBetween size="l">
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
      <Container
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
                  <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {colaboradoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '24px 16px', textAlign: 'center', color: '#879596', fontSize: 13 }}>
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
      </Container>

      {/* ── Secao 2: Gerenciar Horas por Perfil ── */}
      <Container
        header={
          <Header variant="h2">
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
      </Container>

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
    </SpaceBetween>
  );
}
