import { useState } from 'react';
import { conectar } from '../api';
import type { ConfiguracaoJira } from '../types';

interface Props {
  onConectado: () => void;
}

export default function Conexao({ onConectado }: Props) {
  const [form, setForm] = useState<ConfiguracaoJira>({
    base_url: '',
    email: '',
    api_token: '',
  });
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      await conectar(form);
      onConectado();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao conectar');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', background: '#0f3460', border: '1px solid #2a2a4a',
    borderRadius: 6, color: '#e0e0e0', fontFamily: 'Montserrat', fontSize: 14, marginTop: 6,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 420, padding: 40, background: '#16213e', borderRadius: 16, border: '1px solid #2a2a4a' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo-clouddog.png" alt="CloudDog" style={{ height: 50, marginBottom: 12 }} />
          <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 600 }}>Conectar ao Jira</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="base_url" style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>URL do Jira</label>
            <input id="base_url" type="url" placeholder="https://empresa.atlassian.net" value={form.base_url}
              onChange={e => setForm({ ...form, base_url: e.target.value })} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Email</label>
            <input id="email" type="email" value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label htmlFor="api_token" style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>API Token</label>
            <input id="api_token" type="password" value={form.api_token}
              onChange={e => setForm({ ...form, api_token: e.target.value })} required style={inputStyle} />
          </div>
          {erro && <p style={{ color: '#ff6b6b', marginBottom: 16, fontSize: 14 }}>{erro}</p>}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: '12px', background: loading ? '#555' : '#FF6B00', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 16, cursor: loading ? 'wait' : 'pointer', fontFamily: 'Montserrat' }}>
            {loading ? 'Conectando...' : 'Conectar'}
          </button>
        </form>
      </div>
    </div>
  );
}