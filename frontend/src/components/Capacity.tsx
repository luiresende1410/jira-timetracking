import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { getCapacity, updateColaborador, type CapacityResponse, type CapacityColaborador } from '../api';

import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Select from "@cloudscape-design/components/select";
import Input from "@cloudscape-design/components/input";
import Spinner from "@cloudscape-design/components/spinner";
import Alert from "@cloudscape-design/components/alert";

interface CapacityProps {
  dataInicio: string;
  dataFim: string;
}

const ALL_CATEGORIES = [
  'Horas Administrativas',
  'Horas de Apoio',
  'Horas de Estudo',
  'Horas Efetivas',
];

const PERFIL_OPTIONS = [
  { label: 'Tech Leader', value: 'Tech Leader' },
  { label: 'Efetivo', value: 'Efetivo' },
  { label: 'Estagiario', value: 'Estagiario' },
];

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 13,
  color: '#545b64',
  fontWeight: 600,
  borderBottom: '2px solid #e9ebed',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderBottom: '1px solid #e9ebed',
};

const teamHeaderStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 700,
  backgroundColor: '#f2f3f3',
  borderBottom: '1px solid #e9ebed',
  color: '#16191f',
};

const totalRowStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  fontWeight: 600,
  backgroundColor: '#fafafa',
  borderBottom: '2px solid #e9ebed',
  color: '#0073bb',
};

export default function Capacity({ dataInicio, dataFim }: CapacityProps) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [data, setData] = useState<CapacityResponse | null>(null);

  const fetchData = useCallback(async () => {
    if (!dataInicio || !dataFim) return;
    setLoading(true);
    setErro('');
    try {
      const resp = await getCapacity(dataInicio, dataFim);
      setData(resp);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao buscar capacity');
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const grouped = useMemo(() => {
    if (!data) return new Map<string, CapacityColaborador[]>();
    const map = new Map<string, CapacityColaborador[]>();
    for (const c of data.colaboradores) {
      const team = c.time || 'Sem Time';
      if (!map.has(team)) map.set(team, []);
      map.get(team)!.push(c);
    }
    return map;
  }, [data]);

  const handlePerfilChange = async (nome: string, newPerfil: string, currentTime: string) => {
    try {
      await updateColaborador(nome, newPerfil, currentTime);
      await fetchData();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao atualizar perfil');
    }
  };

  const handleTimeChange = async (nome: string, currentPerfil: string, newTime: string) => {
    try {
      await updateColaborador(nome, currentPerfil, newTime);
      await fetchData();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao atualizar time');
    }
  };

  if (loading) {
    return (
      <Box textAlign="center" padding="l">
        <Spinner size="large" />
      </Box>
    );
  }

  return (
    <SpaceBetween size="l">
      {erro && (
        <Alert type="error" dismissible onDismiss={() => setErro('')}>
          {erro}
        </Alert>
      )}

      {data && (
        <Container
          header={
            <Header
              variant="h2"
              description={
                `Período: ${data.periodo_inicio} a ${data.periodo_fim} | Dias úteis: ${data.dias_uteis}`
              }
            >
              Capacity Planning
            </Header>
          }
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Colaborador</th>
                <th style={thStyle}>Perfil</th>
                <th style={thStyle}>Time</th>
                {ALL_CATEGORIES.map(cat => (
                  <th key={cat} style={{ ...thStyle, textAlign: 'right' }}>{cat}</th>
                ))}
                <th style={{ ...thStyle, textAlign: 'right' }}>Total Provisionado</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped.entries()).map(([team, members]) => {
                const teamTotals: Record<string, number> = {};
                let teamTotal = 0;
                for (const m of members) {
                  for (const cat of ALL_CATEGORIES) {
                    const val = m.capacity[cat] ?? 0;
                    teamTotals[cat] = (teamTotals[cat] ?? 0) + val;
                  }
                  teamTotal += m.total_provisionado;
                }

                return (
                  <Fragment key={team}>
                    <tr>
                      <td colSpan={3 + ALL_CATEGORIES.length + 1} style={teamHeaderStyle}>
                        {team}
                      </td>
                    </tr>
                    {members.map(m => (
                      <tr key={m.nome}>
                        <td style={tdStyle}>{m.nome}</td>
                        <td style={tdStyle}>
                          <Select
                            selectedOption={{ label: m.perfil, value: m.perfil }}
                            options={PERFIL_OPTIONS}
                            onChange={({ detail }) => handlePerfilChange(m.nome, detail.selectedOption.value!, m.time)}
                          />
                        </td>
                        <td style={tdStyle}>
                          <Input
                            value={m.time}
                            onChange={({ detail }) => handleTimeChange(m.nome, m.perfil, detail.value)}
                          />
                        </td>
                        {ALL_CATEGORIES.map(cat => (
                          <td key={cat} style={{ ...tdStyle, textAlign: 'right' }}>
                            {m.capacity[cat] != null ? `${m.capacity[cat].toFixed(1)}h` : '-'}
                          </td>
                        ))}
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                          {m.total_provisionado.toFixed(1)}h
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} style={totalRowStyle}>
                        Total {team}
                      </td>
                      {ALL_CATEGORIES.map(cat => (
                        <td key={cat} style={{ ...totalRowStyle, textAlign: 'right' }}>
                          {teamTotals[cat] ? `${teamTotals[cat].toFixed(1)}h` : '-'}
                        </td>
                      ))}
                      <td style={{ ...totalRowStyle, textAlign: 'right' }}>
                        {teamTotal.toFixed(1)}h
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Container>
      )}

      {!data && !loading && !erro && (
        <Box textAlign="center" color="text-status-inactive" padding="l">
          Nenhum dado de capacity disponível
        </Box>
      )}
    </SpaceBetween>
  );
}
