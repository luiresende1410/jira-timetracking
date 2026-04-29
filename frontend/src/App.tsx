import { useState, useEffect } from 'react';
import { checkStatus } from './api';
import Conexao from './components/Conexao';
import Dashboard from './components/Dashboard';
import Box from "@cloudscape-design/components/box";
import Spinner from "@cloudscape-design/components/spinner";
import { applyMode, Mode } from "@cloudscape-design/global-styles";

function App() {
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  useEffect(() => {
    applyMode(darkMode ? Mode.Dark : Mode.Light);
    localStorage.setItem('darkMode', String(darkMode));
    document.body.style.backgroundColor = darkMode ? '#0f1b2d' : '';
    document.body.style.color = darkMode ? '#d1d5db' : '';
  }, [darkMode]);

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
            Verificando conexao...
          </Box>
        </Box>
      </div>
    );
  }

  if (!conectado) {
    return <Conexao onConectado={() => setConectado(true)} />;
  }

  return <Dashboard onDesconectado={() => setConectado(false)} darkMode={darkMode} onToggleDarkMode={() => setDarkMode(d => !d)} />;
}

export default App;