# CloudDog Timetracking Dashboard

Dashboard para visualizacao e gestao de horas apontadas (worklogs) no Jira, com relatorios por colaborador, projeto, cliente MSP e capacity de time.

![Cloudscape](https://img.shields.io/badge/UI-Cloudscape-0073bb) ![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688) ![Docker](https://img.shields.io/badge/Deploy-Docker-2496ED) ![React](https://img.shields.io/badge/Frontend-React%2019-61DAFB)

---

## Funcionalidades

### Navegacao
- Menu lateral esquerdo com **SideNavigation** nativo do Cloudscape (padrao AWS Console)
- **TopNavigation** com titulo, exportacao CSV/Excel e toggle dark mode
- Secao **Configuracoes** expansivel no menu com sub-itens independentes

### Aba Resumo
- Total de horas, colaboradores, projetos e media por colaborador
- Tabela **Capacity por Time**: horas provisionadas vs realizadas por equipe com barra de progresso
- Tabela **Capacity vs Horas Reais**: detalhamento por colaborador com status (OK / Atencao / Critico)

### Aba Projetos
- Tabela de projetos com ordenacao clicavel
- Expansao por projeto mostrando **atividades por colaborador** (issue key, resumo, tipo, status, data, horas)
- Issue keys como **links clicaveis** para o Jira
- Campo editavel de **Evolucao (%)** com barra de progresso colorida
- **Valor Agregado** calculado automaticamente: `(Evolucao% / 100) x Horas Vendidas x Valor/hora`

### Aba MSP
- Horas contratadas vs trabalhadas por cliente MSP
- **Categorias de cliente** calculadas automaticamente pelas horas contratadas:
  - **ENTERPRISE**: >= 20h/mes -- acumula saldo por ate 3 meses
  - **BUSINESS**: 10h a 19h/mes -- acumula saldo por ate 1 mes
  - **BASICO**: < 10h/mes -- sem acumulo de saldo
- Colunas **Saldo** (acumulado de meses anteriores) e **Disponivel** (contratado + saldo)
- **Fechamento automatico de saldo** no dia 1 de cada mes as 00:05 BRT
- **Fechamento retroativo** ao iniciar o sistema: processa todos os meses passados ainda nao fechados
- Filtros por status do contrato e por nome

### Aba Tickets
- Tickets do projeto AWS filtrados pelo periodo selecionado (criados ou atualizados no intervalo)
- Agrupados por organization com filtro por nome e status
- Issue keys como links clicaveis para o Jira

### Aba Capacity
- Capacity provisionado por colaborador no periodo selecionado

### Configuracoes -> Clientes MSP
- Adicionar, editar e remover clientes MSP
- Categoria exibida automaticamente com base nas horas contratadas

### Configuracoes -> Colaboradores
- Adicionar, editar e remover colaboradores
- **Ausencias por data**: informe datas especificas (`2026-05-05`) ou ranges (`2026-05-05/2026-05-09`)
- O sistema calcula automaticamente quantos dias uteis caem no periodo selecionado

### Configuracoes -> Perfis de Horas
- Criar, editar e excluir perfis de capacity com categorias de horas personalizadas

### Configuracoes -> Projetos
- Configurar **Horas Vendidas**, **Valor/hora** e **Project Manager** por projeto
- Exibe apenas projetos com worklogs no periodo selecionado
- Ordenado por evolucao decrescente com barra de progresso colorida

---

## Pre-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando
- Credenciais do Jira (URL, email e API Token)

> Para gerar um API Token: https://id.atlassian.com/manage-profile/security/api-tokens

---

## Como rodar

### 1. Clone o repositorio

```bash
git clone https://github.com/luiresende1410/jira-timetracking.git
cd jira-timetracking
```

### 2. Configure as credenciais do Jira

```bash
cp backend/.env.example backend/.env
```

Edite o `backend/.env`:

```
JIRA_BASE_URL=https://sua-empresa.atlassian.net
JIRA_EMAIL=seu-email@empresa.com
JIRA_API_TOKEN=seu-token-aqui
```

### 3. Suba a aplicacao

```bash
docker compose up --build -d
```

### 4. Acesse

Abra no navegador: **http://localhost:3000**

---

## Parar a aplicacao

```bash
docker compose down
```

---

## Estrutura do projeto

```
backend/
  app/
    main.py                  # Endpoints da API
    models.py                # Modelos Pydantic
    cliente_api_jira.py      # Cliente HTTP para o Jira
    servico_worklogs.py      # Coleta e enriquecimento de worklogs
    servico_capacity.py      # Calculo de capacity e gestao de perfis
    gerador_relatorios.py    # Geracao de relatorios
    saldo_msp.py             # Gestao de saldo acumulado MSP
  colaboradores.json         # Colaboradores e times
  perfis_capacity.json       # Perfis de capacity
  clientes_msp.json          # Clientes MSP
  saldo_msp.json             # Saldo acumulado por cliente
  fechamentos_msp.json       # Historico de fechamentos mensais
  Dockerfile
frontend/
  src/
    App.tsx                  # Raiz da aplicacao (dark mode)
    api.ts                   # Chamadas a API
    types.ts                 # Tipos TypeScript
    export.ts                # Exportacao CSV/Excel
    components/
      Dashboard.tsx          # Dashboard principal + navegacao
      Capacity.tsx           # Aba Capacity
      ConfiguracoesMSP.tsx   # Configuracoes de clientes MSP
      ConfiguracoesTime.tsx  # Configuracoes de colaboradores e perfis
      ConfiguracoesProjetos.tsx # Configuracoes financeiras de projetos
      Conexao.tsx            # Tela de conexao
      MultiFilter.tsx        # Filtro multiselect
  Dockerfile
docker-compose.yml
```

---

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, TypeScript, Cloudscape Design System, Recharts, Vite |
| Backend | Python 3.13, FastAPI, httpx, Pydantic, APScheduler |
| Deploy | Docker, Nginx |
| Persistencia | JSON files + localStorage (preferencias UI) |