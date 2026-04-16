import { useState, useEffect } from 'react';
import { checkStatus } from './api';
import Conexao from './components/Conexao';
import Dashboard from './components/Dashboard';

function App() {
  const [conectado, setConectado] = useState<boolean | null>(null);

  useEffect(() => {
    checkStatus()
      .then((s) => setConectado(s.conectado))
      .catch(() => setConectado(false));
  }, []);

  if (conectado === null) {
    return <div style={{ textAlign: 'center', marginTop: 80 }}>Verificando conexao...</div>;
  }

  if (!conectado) {
    return <Conexao onConectado={() => setConectado(true)} />;
  }

  return <Dashboard onDesconectado={() => setConectado(false)} />;
}

export default App;