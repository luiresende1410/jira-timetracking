# Jira Timetracking Dashboard

Dashboard para visualização de horas apontadas (worklogs) no Jira, com relatórios por colaborador, projeto e cliente.

![Cloudscape Design System](https://img.shields.io/badge/UI-Cloudscape-0073bb) ![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688) ![Docker](https://img.shields.io/badge/Deploy-Docker-2496ED)

## Funcionalidades

- **Resumo geral**: total de horas, colaboradores, projetos e média por colaborador
- **Relatório por colaborador**: horas totais com detalhamento por cliente/projeto (expandível)
- **Relatório por projeto**: horas por projeto com gráfico horizontal
- **Relatório por cliente**: horas por cliente com classificação Billable/Non-Billable e detalhamento por colaborador
- **Gráficos**: barras e pizza (Recharts)
- **Filtros**: multiselect por colaborador, projeto ou cliente
- **Exportação**: CSV e Excel (xlsx)
- **Período automático**: mês corrente pré-selecionado com busca automática

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando
- Credenciais do Jira (URL, email e API Token)

> Para gerar um API Token do Jira: https://id.atlassian.com/manage-profile/security/api-tokens

## Como rodar

### 1. Clone o repositório

```bash
git clone https://github.com/luiresende1410/jira-timetracking.git
cd jira-timetracking
```

### 2. Configure as credenciais do Jira

Copie o arquivo de exemplo e preencha com suas credenciais:

```bash
cp backend/.env.example backend/.env
```

Edite o `backend/.env`:

```
JIRA_BASE_URL=https://sua-empresa.atlassian.net
JIRA_EMAIL=seu-email@empresa.com
JIRA_API_TOKEN=seu-token-aqui
```

### 3. Suba a aplicação

```bash
docker compose up --build -d
```

### 4. Acesse

Abra no navegador: **http://localhost:3000**

Pronto! O dashboard vai carregar automaticamente os dados do mês corrente.

## Parar a aplicação

```bash
docker compose down
```

## Estrutura do projeto

```
├── backend/                  # API FastAPI (Python)
│   ├── app/
│   │   ├── main.py           # Endpoints da API
│   │   ├── models.py         # Modelos Pydantic
│   │   ├── config.py         # Configuração e validação
│   │   ├── cliente_api_jira.py   # Cliente HTTP para API do Jira
│   │   ├── servico_worklogs.py   # Coleta e enriquecimento de worklogs
│   │   └── gerador_relatorios.py # Geração de relatórios
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 # React + TypeScript + Cloudscape
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts            # Chamadas à API
│   │   ├── types.ts          # Tipos TypeScript
│   │   ├── export.ts         # Exportação CSV/Excel
│   │   └── components/
│   │       ├── Dashboard.tsx  # Dashboard principal
│   │       ├── Conexao.tsx    # Tela de conexão
│   │       └── MultiFilter.tsx
│   ├── Dockerfile
│   └── nginx.conf            # Proxy reverso para o backend
└── docker-compose.yml
```

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19, TypeScript, Cloudscape Design System, Recharts, Vite |
| Backend | Python 3.13, FastAPI, httpx, Pydantic |
| Deploy | Docker, Nginx |
