import { useState } from 'react';
import { conectar } from '../api';
import type { ConfiguracaoJira } from '../types';
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Button from "@cloudscape-design/components/button";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Form from "@cloudscape-design/components/form";

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 460 }}>
        <Container
          header={
            <Header variant="h2" description="Insira suas credenciais para conectar">
              <Box textAlign="center">
                <img src="/logo-clouddog.png" alt="CloudDog" style={{ height: 50, marginBottom: 8 }} />
                <div>Conectar ao Jira</div>
              </Box>
            </Header>
          }
        >
          <form onSubmit={handleSubmit}>
            <Form
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="primary" formAction="submit" loading={loading}>
                    {loading ? 'Conectando...' : 'Conectar'}
                  </Button>
                </SpaceBetween>
              }
            >
              <SpaceBetween size="l">
                {erro && <Alert type="error">{erro}</Alert>}
                <FormField label="URL do Jira">
                  <Input
                    type="url"
                    placeholder="https://empresa.atlassian.net"
                    value={form.base_url}
                    onChange={({ detail }) => setForm({ ...form, base_url: detail.value })}
                  />
                </FormField>
                <FormField label="Email">
                  <Input
                    type="email"
                    value={form.email}
                    onChange={({ detail }) => setForm({ ...form, email: detail.value })}
                  />
                </FormField>
                <FormField label="API Token">
                  <Input
                    type="password"
                    value={form.api_token}
                    onChange={({ detail }) => setForm({ ...form, api_token: detail.value })}
                  />
                </FormField>
              </SpaceBetween>
            </Form>
          </form>
        </Container>
      </div>
    </div>
  );
}
