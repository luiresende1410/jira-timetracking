# Documento de Requisitos

## Introdução

Este documento define os requisitos para o sistema de Integração Jira Timetracking, que consome dados da API REST do Jira para extrair informações de atividades e worklogs registrados por colaboradores. O sistema identifica a qual projeto ou cliente cada registro de horas está associado, permitindo visibilidade completa sobre a alocação de tempo da equipe. Os requisitos foram derivados do documento de design aprovado.

## Glossário

- **Sistema**: O sistema de Integração Jira Timetracking como um todo
- **Cliente_API_Jira**: Componente responsável pela comunicação HTTP com a API REST do Jira
- **Servico_Worklogs**: Componente que orquestra a coleta e enriquecimento de worklogs
- **Gerador_Relatorios**: Componente que consolida worklogs em relatórios estruturados
- **Processador_Dados**: Componente que transforma e consolida dados brutos
- **Worklog**: Registro de horas de trabalho no Jira, contendo autor, tempo gasto e issue associada
- **WorklogEnriquecido**: Worklog combinado com informações de projeto, colaborador e issue
- **Colaborador**: Usuário do Jira que registra horas de trabalho
- **Projeto**: Projeto do Jira ao qual issues e worklogs estão associados
- **Cliente**: Entidade externa associada a um projeto via mapeamento configurável
- **Issue**: Tarefa ou item de trabalho no Jira, pertencente a um projeto
- **API_Token**: Credencial de autenticação gerada no Jira para acesso via API
- **Rate_Limit**: Limite de requisições imposto pela API do Jira (HTTP 429)

## Requisitos

### Requisito 1: Configuração e Validação de Credenciais

**User Story:** Como administrador do sistema, eu quero configurar as credenciais de acesso ao Jira, para que o sistema possa se conectar de forma segura à API.

#### Critérios de Aceitação

1.1. WHEN o Sistema recebe uma configuração com baseUrl, email e apiToken, THEN o Cliente_API_Jira SHALL validar que a baseUrl é uma URL válida sem barra final, o email é um formato válido e o apiToken não está vazio

1.2. WHEN a configuração contém valores inválidos, THEN o Cliente_API_Jira SHALL retornar uma mensagem de erro descritiva indicando quais campos estão inválidos

1.3. WHEN o maxResultadosPorPagina é fornecido, THEN o Cliente_API_Jira SHALL validar que o valor está entre 1 e 1000

1.4. WHEN o maxResultadosPorPagina não é fornecido, THEN o Cliente_API_Jira SHALL utilizar o valor padrão de 1000

1.5. WHEN o timeoutSegundos não é fornecido, THEN o Cliente_API_Jira SHALL utilizar o valor padrão de 30 segundos
