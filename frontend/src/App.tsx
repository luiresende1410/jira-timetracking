import { useState, useEffect } from 'react';
import { checkStatus } from './api';
import Conexao from './components/Conexao';
import Dashboard from './components/Dashboard';
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";

function App() {
  const [conectado, setConectado] = useState<boolean | null>(null);

  useEffect(() => {
    checkStatus()
      .then((s) => setConectado(s.conectado))
      .catch(() => setConectado(false));
  }, []);

  if (conectado === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Box textAlign="center">
          <Spinner size="large" />
          <Box variant="p" margin={{ top: 's' }} color="text-status-inactive">
            Verificando conex\u00e3o...
          </Box>
        </Box>
      </div>
    );
  }

  if (!conectado) {
    return <Conexao onConectado={() => setConectado(true)} />;
  }

  return <Dashboard onDesconectado={() => setConectado(false)} />;
}

export default App;
