import { useState } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';

interface ProjetoFinanceiro {
  horasVendidas: number;
  valorHora: number;
  pm?: string;
}

interface Props {
  projetos: { projeto_key: string; projeto_nome: string }[];
  dados: Record<string, ProjetoFinanceiro>;
  evolucao: Record<string, number>;
  onChange: (key: string, campo: 'horasVendidas' | 'valorHora', val: number) => void;
  onChangePm: (key: string, pm: string) => void;
}

const thStyle = (align: 'left' | 'center' | 'right' = 'center'): React.CSSProperties => ({
  textAlign: align,
  padding: '10px 12px',
  fontSize: 13,
  color: '#545b64',
  fontWeight: 600,
});

const tdStyle = (align: 'left' | 'center' | 'right' = 'center'): React.CSSProperties => ({
  padding: '10px 12px',
  textAlign: align,
  fontSize: 13,
  verticalAlign: 'middle',
});

const inputStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontSize: 13,
  border: '1px solid #aab7b8',
  borderRadius: 4,
  outline: 'none',
  background: '#fff',
  color: '#16191f',
  textAlign: 'right',
  width: 90,
};

export default function ConfiguracoesProjetos({ projetos, dados, evolucao, onChange, onChangePm }: Props) {
  const [filtro, setFiltro] = useState('');

  // Filter then sort descending by evolucao
  const projetosFiltrados = projetos
    .filter(p =>
      p.projeto_nome.toLowerCase().includes(filtro.toLowerCase()) ||
      p.projeto_key.toLowerCase().includes(filtro.toLowerCase())
    )
    .sort((a, b) => (evolucao[b.projeto_key] ?? 0) - (evolucao[a.projeto_key] ?? 0));

  if (projetos.length === 0) {
    return (
      <Box textAlign="center" color="text-status-inactive" padding="l">
        Nenhum projeto carregado. Faca uma busca primeiro.
      </Box>
    );
  }

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Configure horas vendidas e valor por hora para cada projeto. Ordenado por evolucao decrescente."
        >
          Dados Financeiros dos Projetos
        </Header>
      }
    >
      <SpaceBetween size="m">
        <div style={{ maxWidth: 320 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#16191f', marginBottom: 4 }}>
            Buscar projeto
          </label>
          <input
            type="text"
            value={filtro}
            onChange={e => setFiltro(e.target.value)}
            placeholder="Nome ou key..."
            style={{ ...inputStyle, width: '100%', textAlign: 'left' }}
          />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e9ebed', background: '#f2f3f3' }}>
              <th style={thStyle('left')}>Projeto</th>
              <th style={thStyle()}>Key</th>
              <th style={thStyle()}>Project Manager</th>
              <th style={thStyle()}>Evolucao</th>
              <th style={thStyle()}>Horas Vendidas</th>
              <th style={thStyle()}>Valor / Hora (R$)</th>
              <th style={thStyle()}>Valor Total</th>
            </tr>
          </thead>
          <tbody>
            {projetosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '24px 16px', textAlign: 'center', color: '#879596', fontSize: 13 }}>
                  Nenhum projeto encontrado.
                </td>
              </tr>
            ) : (
              projetosFiltrados.map(p => {
                const hv = dados[p.projeto_key]?.horasVendidas ?? 0;
                const vh = dados[p.projeto_key]?.valorHora ?? 0;
                const total = hv * vh;
                const ev = evolucao[p.projeto_key] ?? 0;
                const evColor = ev >= 100 ? '#037f0c' : ev >= 70 ? '#0073bb' : ev >= 40 ? '#f0ab00' : '#d13212';
                return (
                  <tr key={p.projeto_key} style={{ borderBottom: '1px solid #e9ebed' }}>
                    <td style={{ ...tdStyle('left'), fontWeight: 600, color: '#16191f' }}>
                      {p.projeto_nome}
                    </td>
                    <td style={{ ...tdStyle(), color: '#5f6b7a', fontSize: 12 }}>
                      {p.projeto_key}
                    </td>
                    <td style={tdStyle()}>
                      <input
                        type="text"
                        value={dados[p.projeto_key]?.pm ?? ''}
                        onChange={e => onChangePm(p.projeto_key, e.target.value)}
                        placeholder="Nome do PM"
                        style={{ ...inputStyle, width: '100%', textAlign: 'center', minWidth: 140 }}
                      />
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: evColor, minWidth: 32, textAlign: 'right' }}>
                          {ev}%
                        </span>
                        <div style={{ width: 60, background: '#e9ebed', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(ev, 100)}%`, height: '100%', borderRadius: 4, background: evColor }} />
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <input
                          type="number"
                          min={0}
                          value={dados[p.projeto_key]?.horasVendidas ?? ''}
                          onChange={e => onChange(p.projeto_key, 'horasVendidas', Math.max(0, Number(e.target.value)))}
                          placeholder="0"
                          style={inputStyle}
                        />
                        <span style={{ fontSize: 12, color: '#879596' }}>h</span>
                      </div>
                    </td>
                    <td style={tdStyle()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <span style={{ fontSize: 12, color: '#879596' }}>R$</span>
                        <input
                          type="number"
                          min={0}
                          value={dados[p.projeto_key]?.valorHora ?? ''}
                          onChange={e => onChange(p.projeto_key, 'valorHora', Math.max(0, Number(e.target.value)))}
                          placeholder="0,00"
                          style={inputStyle}
                        />
                      </div>
                    </td>
                    <td style={{ ...tdStyle(), fontWeight: 600, color: total > 0 ? '#037f0c' : '#879596' }}>
                      {total > 0
                        ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '--'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </SpaceBetween>
    </Container>
  );
}