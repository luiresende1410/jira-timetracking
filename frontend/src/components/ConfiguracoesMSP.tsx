import { useState, useMemo, useEffect } from 'react';
import { getClientesMSP, putClienteMSP, deleteClienteMSP, type ClienteMSP } from '../api';

import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Spinner from '@cloudscape-design/components/spinner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClienteRow {
  nome: string;
  horas: number;
  equipe: string;
  status: 'Ativo' | 'Suspenso';
  categoria?: string;
}

function getCategoria(horas: number): string {
  if (horas >= 20) return 'ENTERPRISE';
  if (horas >= 10) return 'BUSINESS';
  return 'BASICO';
}

function CategoriaBadge({ horas }: { horas: number }) {
  const cat = getCategoria(horas);
  const style: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
    background: cat === 'ENTERPRISE' ? '#0d2d5e' : cat === 'BUSINESS' ? '#1a4731' : '#4a3000',
    color: cat === 'ENTERPRISE' ? '#89bdff' : cat === 'BUSINESS' ? '#6ee7b7' : '#fbbf24',
    display: 'inline-block',
  };
  return <span style={style}>{cat}</span>;
}

interface FormState {
  nome: string;
  horas: string;
  equipe: string;
  status: 'Ativo' | 'Suspenso';
}

interface FormErrors {
  nome?: string;
  horas?: string;
  equipe?: string;
}

const FORM_VAZIO: FormState = { nome: '', horas: '0', equipe: '', status: 'Ativo' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateHoras(value: string): string | undefined {
  if (value.trim() === '') return 'Campo obrigatório';
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || isNaN(n)) return 'Deve ser um número inteiro maior ou igual a zero';
  return undefined;
}

function validateEquipe(value: string): string | undefined {
  if (value.trim() === '') return 'Campo obrigatório';
  return undefined;
}

function validateNome(value: string, clientes: Record<string, ClienteMSP>): string | undefined {
  if (value.trim() === '') return 'Campo obrigatório';
  if (clientes[value.trim()] !== undefined) return 'Já existe um cliente com este nome';
  return undefined;
}

// ─── Modal overlay style ──────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConfiguracoesMSP() {
  const [clientes, setClientes] = useState<Record<string, ClienteMSP>>({});
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [filtroNome, setFiltroNome] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'Todos' | 'Ativo' | 'Suspenso'>('Todos');

  const [modalEdicao, setModalEdicao] = useState<string | null>(null);
  const [modalAdicao, setModalAdicao] = useState(false);
  const [modalRemocao, setModalRemocao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [formEdicao, setFormEdicao] = useState<FormState>(FORM_VAZIO);
  const [formAdicao, setFormAdicao] = useState<FormState>(FORM_VAZIO);
  const [errosEdicao, setErrosEdicao] = useState<FormErrors>({});
  const [errosAdicao, setErrosAdicao] = useState<FormErrors>({});

  // ── Load on mount ──────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    getClientesMSP()
      .then(data => setClientes(data))
      .catch(err => setErro(err instanceof Error ? err.message : 'Erro ao carregar clientes'))
      .finally(() => setLoading(false));
  }, []);

  // ── Derived list ───────────────────────────────────────────────────────────

  const clientesFiltrados = useMemo((): ClienteRow[] => {
    return Object.entries(clientes)
      .map(([nome, dados]) => ({ nome, ...dados }))
      .filter(c => {
        const matchNome = c.nome.toLowerCase().includes(filtroNome.toLowerCase());
        const matchStatus = filtroStatus === 'Todos' || c.status === filtroStatus;
        return matchNome && matchStatus;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [clientes, filtroNome, filtroStatus]);

  // ── Edit modal ─────────────────────────────────────────────────────────────

  function abrirEdicao(nome: string) {
    const c = clientes[nome];
    if (!c) return;
    setFormEdicao({ nome, horas: String(c.horas), equipe: c.equipe, status: c.status });
    setErrosEdicao({});
    setModalEdicao(nome);
  }

  function fecharEdicao() {
    setModalEdicao(null);
    setErrosEdicao({});
  }

  async function salvarEdicao() {
    const erros: FormErrors = {};
    const horasErr = validateHoras(formEdicao.horas);
    const equipeErr = validateEquipe(formEdicao.equipe);
    if (horasErr) erros.horas = horasErr;
    if (equipeErr) erros.equipe = equipeErr;
    if (Object.keys(erros).length > 0) { setErrosEdicao(erros); return; }

    setSalvando(true);
    try {
      const dados: ClienteMSP = {
        horas: Number(formEdicao.horas),
        equipe: formEdicao.equipe.trim(),
        status: formEdicao.status,
      };
      await putClienteMSP(modalEdicao!, dados);
      setClientes(prev => ({ ...prev, [modalEdicao!]: dados }));
      setNotification({ type: 'success', message: `Cliente "${modalEdicao}" atualizado com sucesso.` });
      fecharEdicao();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao salvar' });
    } finally {
      setSalvando(false);
    }
  }

  // ── Add modal ──────────────────────────────────────────────────────────────

  function abrirAdicao() {
    setFormAdicao(FORM_VAZIO);
    setErrosAdicao({});
    setModalAdicao(true);
  }

  function fecharAdicao() {
    setModalAdicao(false);
    setErrosAdicao({});
  }

  async function salvarAdicao() {
    const erros: FormErrors = {};
    const nomeErr = validateNome(formAdicao.nome, clientes);
    const horasErr = validateHoras(formAdicao.horas);
    const equipeErr = validateEquipe(formAdicao.equipe);
    if (nomeErr) erros.nome = nomeErr;
    if (horasErr) erros.horas = horasErr;
    if (equipeErr) erros.equipe = equipeErr;
    if (Object.keys(erros).length > 0) { setErrosAdicao(erros); return; }

    setSalvando(true);
    const nomeTrimmed = formAdicao.nome.trim();
    try {
      const dados: ClienteMSP = {
        horas: Number(formAdicao.horas),
        equipe: formAdicao.equipe.trim(),
        status: formAdicao.status,
      };
      await putClienteMSP(nomeTrimmed, dados);
      setClientes(prev => ({ ...prev, [nomeTrimmed]: dados }));
      setNotification({ type: 'success', message: `Cliente "${nomeTrimmed}" adicionado com sucesso.` });
      fecharAdicao();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao adicionar' });
    } finally {
      setSalvando(false);
    }
  }

  // ── Delete modal ───────────────────────────────────────────────────────────

  function abrirRemocao(nome: string) {
    setModalRemocao(nome);
  }

  function fecharRemocao() {
    setModalRemocao(null);
  }

  async function confirmarRemocao() {
    if (!modalRemocao) return;
    setSalvando(true);
    const nome = modalRemocao;
    try {
      await deleteClienteMSP(nome);
      setClientes(prev => {
        const next = { ...prev };
        delete next[nome];
        return next;
      });
      setNotification({ type: 'success', message: `Cliente "${nome}" removido com sucesso.` });
      fecharRemocao();
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : 'Erro ao remover' });
      fecharRemocao();
    } finally {
      setSalvando(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box textAlign="center" padding="l">
        <Spinner size="large" />
      </Box>
    );
  }

  if (erro) {
    return <Alert type="error">{erro}</Alert>;
  }

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

      {/* Main container */}
      <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button variant="primary" onClick={abrirAdicao}>
                Adicionar Cliente
              </Button>
            }
          >
            Clientes MSP
          </Header>
        }
      >
        <SpaceBetween size="m">
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={labelStyle}>Buscar por nome</label>
              <input
                type="text"
                value={filtroNome}
                onChange={e => setFiltroNome(e.target.value)}
                placeholder="Buscar por nome..."
                style={inputStyle}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={labelStyle}>Status</label>
              <select
                value={filtroStatus}
                onChange={e => setFiltroStatus(e.target.value as 'Todos' | 'Ativo' | 'Suspenso')}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="Todos">Todos</option>
                <option value="Ativo">Ativo</option>
                <option value="Suspenso">Suspenso</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e9ebed', background: '#f2f3f3' }}>
                <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Nome</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Equipe</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Horas Contratadas</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Categoria</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Status</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 13, color: '#545b64', fontWeight: 600 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '24px 16px', textAlign: 'center', color: '#879596', fontSize: 13 }}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                clientesFiltrados.map(row => (
                  <tr key={row.nome} style={{ borderBottom: '1px solid #e9ebed' }}>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{row.nome}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: '#5f6b7a' }}>{row.equipe}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, textAlign: 'right' }}>{row.horas}h</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <CategoriaBadge horas={row.horas} />
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <StatusIndicator type={row.status === 'Ativo' ? 'success' : 'stopped'}>
                        {row.status}
                      </StatusIndicator>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <Button variant="inline-link" onClick={() => abrirEdicao(row.nome)}>
                          Editar
                        </Button>
                        <Button variant="inline-link" onClick={() => abrirRemocao(row.nome)}>
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
      </Container>

      {/* Edit Modal */}
      {modalEdicao !== null && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Editar Cliente: {modalEdicao}
            </h3>

            <div style={fieldStyle}>
              <label style={labelStyle}>Horas Contratadas</label>
              <input
                type="number"
                min="0"
                step="1"
                value={formEdicao.horas}
                onChange={e => setFormEdicao(f => ({ ...f, horas: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosEdicao.horas ? '#d13212' : '#aab7b8' }}
              />
              {errosEdicao.horas && <div style={errorMsgStyle}>{errosEdicao.horas}</div>}
              {formEdicao.horas && !errosEdicao.horas && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#545b64' }}>Categoria:</span>
                  <CategoriaBadge horas={Number(formEdicao.horas)} />
                </div>
              )}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Equipe</label>
              <input
                type="text"
                value={formEdicao.equipe}
                onChange={e => setFormEdicao(f => ({ ...f, equipe: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosEdicao.equipe ? '#d13212' : '#aab7b8' }}
              />
              {errosEdicao.equipe && <div style={errorMsgStyle}>{errosEdicao.equipe}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Status</label>
              <select
                value={formEdicao.status}
                onChange={e => setFormEdicao(f => ({ ...f, status: e.target.value as 'Ativo' | 'Suspenso' }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="Ativo">Ativo</option>
                <option value="Suspenso">Suspenso</option>
              </select>
            </div>

            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharEdicao} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={salvarEdicao} loading={salvando}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {modalAdicao && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Adicionar Cliente
            </h3>

            <div style={fieldStyle}>
              <label style={labelStyle}>Nome</label>
              <input
                type="text"
                value={formAdicao.nome}
                onChange={e => setFormAdicao(f => ({ ...f, nome: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosAdicao.nome ? '#d13212' : '#aab7b8' }}
                placeholder="Nome do cliente"
              />
              {errosAdicao.nome && <div style={errorMsgStyle}>{errosAdicao.nome}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Horas Contratadas</label>
              <input
                type="number"
                min="0"
                step="1"
                value={formAdicao.horas}
                onChange={e => setFormAdicao(f => ({ ...f, horas: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosAdicao.horas ? '#d13212' : '#aab7b8' }}
              />
              {errosAdicao.horas && <div style={errorMsgStyle}>{errosAdicao.horas}</div>}
              {formAdicao.horas && !errosAdicao.horas && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: '#545b64' }}>Categoria:</span>
                  <CategoriaBadge horas={Number(formAdicao.horas)} />
                </div>
              )}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Equipe</label>
              <input
                type="text"
                value={formAdicao.equipe}
                onChange={e => setFormAdicao(f => ({ ...f, equipe: e.target.value }))}
                style={{ ...inputStyle, borderColor: errosAdicao.equipe ? '#d13212' : '#aab7b8' }}
                placeholder="Nome da equipe"
              />
              {errosAdicao.equipe && <div style={errorMsgStyle}>{errosAdicao.equipe}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Status</label>
              <select
                value={formAdicao.status}
                onChange={e => setFormAdicao(f => ({ ...f, status: e.target.value as 'Ativo' | 'Suspenso' }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="Ativo">Ativo</option>
                <option value="Suspenso">Suspenso</option>
              </select>
            </div>

            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharAdicao} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={salvarAdicao} loading={salvando}>
                Adicionar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {modalRemocao !== null && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: '#16191f' }}>
              Confirmar Remoção
            </h3>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#16191f' }}>
              Tem certeza que deseja remover o cliente:
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 14, fontWeight: 700, color: '#d13212' }}>
              {modalRemocao}
            </p>
            <p style={{ margin: '0 0 20px', fontSize: 12, color: '#879596' }}>
              Esta ação não pode ser desfeita.
            </p>
            <div style={modalActionsStyle}>
              <Button variant="link" onClick={fecharRemocao} disabled={salvando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={confirmarRemocao} loading={salvando}>
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}
    </SpaceBetween>
  );
}
