# Documento de Requisitos: Gerenciar Times e Capacity

## Introdução

Esta feature expande a aba "Configurações" existente com duas novas seções:

1. **Gerenciar Colaboradores** — permite listar, adicionar, editar e remover colaboradores, incluindo a definição de perfil e time de cada um.
2. **Gerenciar Horas por Perfil (Capacity)** — permite visualizar e editar as horas diárias por categoria de cada perfil (Efetivo, Estagiário, Tech Leader), migrando os dados de hardcoded no Python para um arquivo JSON editável via sistema.

Ambas as seções seguem o padrão visual do componente `ConfiguracoesMSP.tsx` já existente (tabela + modais inline, estilos inline, Cloudscape Design System).

## Glossário

- **Colaborador**: Membro da equipe registrado no sistema, com nome, perfil e time associados.
- **Perfil**: Categoria funcional do colaborador. Valores fixos: `"Efetivo"`, `"Estagiario"`, `"Tech Leader"`.
- **Time**: Grupo ao qual o colaborador pertence (ex: "SRE - TORINO", "PROJETOS").
- **Categoria de Horas**: Subdivisão das horas diárias de um perfil (ex: "Horas Administrativas", "Horas Efetivas").
- **Capacity**: Total de horas provisionadas para um colaborador em um período, calculado com base no perfil e nos dias úteis.
- **Perfis_Capacity**: Dicionário que mapeia cada perfil às suas categorias de horas diárias.
- **Colaboradores_Manager**: Componente frontend responsável pela seção "Gerenciar Colaboradores".
- **Capacity_Manager**: Componente frontend responsável pela seção "Gerenciar Horas por Perfil".
- **Configuracoes_Tab**: Aba "Configurações" no Dashboard que agrupa ConfiguracoesMSP, Colaboradores_Manager e Capacity_Manager.
- **Colaboradores_API**: Endpoints do backend para operações CRUD de colaboradores.
- **Capacity_API**: Endpoints do backend para leitura e atualização de horas por perfil.
- **perfis_capacity.json**: Arquivo JSON no backend que armazena as horas diárias por perfil e categoria, substituindo o dict hardcoded.
- **Edit_Modal**: Modal de edição de um registro existente.
- **Add_Modal**: Modal de adição de um novo registro.
- **Delete_Confirmation**: Modal de confirmação antes de remover um registro.

---

## Requisitos

### Requisito 1: Integração das novas seções na aba Configurações

**User Story:** Como usuário do sistema, quero que as seções de gerenciamento de colaboradores e de horas por perfil apareçam dentro da aba "Configurações" existente, para que eu possa acessar todas as configurações em um único lugar.

#### Critérios de Aceitação

1. THE Configuracoes_Tab SHALL exibir a seção "Gerenciar Colaboradores" abaixo da seção "Clientes MSP" existente.
2. THE Configuracoes_Tab SHALL exibir a seção "Gerenciar Horas por Perfil" abaixo da seção "Gerenciar Colaboradores".
3. THE Configuracoes_Tab SHALL renderizar as três seções sem recarregar a página ao navegar entre abas.

---

### Requisito 2: Listar colaboradores

**User Story:** Como administrador, quero visualizar todos os colaboradores cadastrados com seus perfis e times, para que eu possa ter uma visão geral da equipe.

#### Critérios de Aceitação

1. WHEN a seção "Gerenciar Colaboradores" é exibida, THE Colaboradores_Manager SHALL carregar os dados via `GET /api/colaboradores` e exibir um indicador de carregamento enquanto a requisição está em andamento.
2. WHEN o carregamento é concluído com sucesso, THE Colaboradores_Manager SHALL exibir uma tabela com as colunas: Nome, Perfil, Time e Ações.
3. WHEN o carregamento falha, THE Colaboradores_Manager SHALL exibir uma mensagem de erro descritiva no lugar da tabela.
4. THE Colaboradores_Manager SHALL ordenar os colaboradores alfabeticamente por nome por padrão.
5. WHEN o usuário digita no campo de busca, THE Colaboradores_Manager SHALL filtrar a tabela exibindo apenas colaboradores cujo nome contenha o texto digitado (sem distinção de maiúsculas/minúsculas).

---

### Requisito 3: Adicionar colaborador

**User Story:** Como administrador, quero adicionar novos colaboradores ao sistema, para que eles sejam incluídos nos cálculos de capacity.

#### Critérios de Aceitação

1. WHEN o usuário clica em "Adicionar Colaborador", THE Colaboradores_Manager SHALL abrir o Add_Modal com todos os campos em branco e o perfil padrão "Efetivo".
2. THE Add_Modal SHALL exibir os campos: Nome (texto livre), Perfil (seleção entre os perfis retornados por `GET /api/perfis`) e Time (texto livre).
3. WHEN o usuário submete o Add_Modal com o campo Nome vazio, THE Add_Modal SHALL exibir a mensagem de erro "Campo obrigatório" no campo Nome sem chamar a API.
4. WHEN o usuário submete o Add_Modal com um nome já existente em `colaboradores`, THE Add_Modal SHALL exibir a mensagem de erro "Já existe um colaborador com este nome" no campo Nome sem chamar a API.
5. WHEN o usuário submete o Add_Modal com o campo Time vazio, THE Add_Modal SHALL exibir a mensagem de erro "Campo obrigatório" no campo Time sem chamar a API.
6. WHEN o usuário submete o Add_Modal com todos os campos válidos, THE Colaboradores_Manager SHALL chamar `PUT /api/colaboradores/{nome}` com os dados informados.
7. WHEN a requisição de adição é concluída com sucesso, THE Colaboradores_Manager SHALL inserir o novo colaborador na tabela, fechar o Add_Modal e exibir uma notificação de sucesso.
8. IF a requisição de adição falha, THEN THE Colaboradores_Manager SHALL manter o Add_Modal aberto e exibir uma notificação de erro com a mensagem retornada pela API.

---

### Requisito 4: Editar colaborador

**User Story:** Como administrador, quero editar o perfil e o time de um colaborador existente, para que os cálculos de capacity reflitam mudanças organizacionais.

#### Critérios de Aceitação

1. WHEN o usuário clica em "Editar" em uma linha da tabela, THE Colaboradores_Manager SHALL abrir o Edit_Modal pré-preenchido com os valores atuais do colaborador (perfil e time).
2. THE Edit_Modal SHALL exibir os campos: Perfil (seleção entre os perfis disponíveis) e Time (texto livre). O campo Nome não deve ser editável.
3. WHEN o usuário submete o Edit_Modal com o campo Time vazio, THE Edit_Modal SHALL exibir a mensagem de erro "Campo obrigatório" no campo Time sem chamar a API.
4. WHEN o usuário submete o Edit_Modal com todos os campos válidos, THE Colaboradores_Manager SHALL chamar `PUT /api/colaboradores/{nome}` com os dados atualizados.
5. WHEN a requisição de edição é concluída com sucesso, THE Colaboradores_Manager SHALL atualizar o registro na tabela, fechar o Edit_Modal e exibir uma notificação de sucesso.
6. IF a requisição de edição falha, THEN THE Colaboradores_Manager SHALL manter o Edit_Modal aberto e exibir uma notificação de erro com a mensagem retornada pela API.

---

### Requisito 5: Remover colaborador

**User Story:** Como administrador, quero remover colaboradores que saíram da equipe, para que eles não sejam mais incluídos nos cálculos de capacity.

#### Critérios de Aceitação

1. WHEN o usuário clica em "Remover" em uma linha da tabela, THE Colaboradores_Manager SHALL abrir o Delete_Confirmation exibindo o nome do colaborador a ser removido.
2. WHEN o usuário confirma a remoção, THE Colaboradores_Manager SHALL chamar `DELETE /api/colaboradores/{nome}`.
3. WHEN a requisição de remoção é concluída com sucesso, THE Colaboradores_Manager SHALL remover o colaborador da tabela, fechar o Delete_Confirmation e exibir uma notificação de sucesso.
4. IF a requisição de remoção falha, THEN THE Colaboradores_Manager SHALL fechar o Delete_Confirmation e exibir uma notificação de erro com a mensagem retornada pela API.
5. WHEN o usuário cancela o Delete_Confirmation, THE Colaboradores_Manager SHALL fechar o modal sem realizar nenhuma requisição.

---

### Requisito 6: Migrar horas por perfil para arquivo JSON

**User Story:** Como desenvolvedor, quero que as horas diárias por perfil sejam armazenadas em um arquivo JSON em vez de hardcoded no Python, para que possam ser editadas via sistema sem necessidade de redeploy.

#### Critérios de Aceitação

1. THE Backend SHALL criar o arquivo `backend/perfis_capacity.json` com o conteúdo equivalente ao dict `PERFIS_CAPACITY` atualmente definido em `servico_capacity.py`.
2. WHEN o backend é iniciado, THE Backend SHALL carregar as horas por perfil a partir de `perfis_capacity.json` em vez do dict hardcoded.
3. THE Backend SHALL expor o endpoint `GET /api/perfis-capacity` que retorna o conteúdo completo de `perfis_capacity.json`.
4. THE Backend SHALL expor o endpoint `PUT /api/perfis-capacity/{perfil}` que recebe um objeto com as categorias e horas atualizadas e persiste as alterações em `perfis_capacity.json`.
5. WHEN `PUT /api/perfis-capacity/{perfil}` é chamado com um perfil inexistente, THE Backend SHALL retornar HTTP 404 com mensagem descritiva.
6. WHEN `PUT /api/perfis-capacity/{perfil}` é chamado com um valor de horas negativo, THE Backend SHALL retornar HTTP 422 com mensagem descritiva.
7. THE Backend SHALL garantir que a função `calcular_capacity` utilize os dados carregados de `perfis_capacity.json`, mantendo compatibilidade com o comportamento atual.

---

### Requisito 7: Visualizar horas por perfil

**User Story:** Como administrador, quero visualizar as horas diárias configuradas para cada perfil e suas categorias, para que eu possa entender como o capacity é calculado.

#### Critérios de Aceitação

1. WHEN a seção "Gerenciar Horas por Perfil" é exibida, THE Capacity_Manager SHALL carregar os dados via `GET /api/perfis-capacity` e exibir um indicador de carregamento enquanto a requisição está em andamento.
2. WHEN o carregamento é concluído com sucesso, THE Capacity_Manager SHALL exibir os três perfis (Tech Leader, Efetivo, Estagiario) cada um com suas categorias e respectivas horas diárias.
3. WHEN o carregamento falha, THE Capacity_Manager SHALL exibir uma mensagem de erro descritiva.
4. THE Capacity_Manager SHALL exibir o total de horas diárias de cada perfil como soma das categorias.

---

### Requisito 8: Editar horas de uma categoria de perfil

**User Story:** Como administrador, quero editar as horas diárias de uma categoria específica de um perfil, para que os cálculos de capacity reflitam mudanças na política de alocação de tempo.

#### Critérios de Aceitação

1. WHEN o usuário clica em "Editar" em um perfil, THE Capacity_Manager SHALL abrir o Edit_Modal pré-preenchido com todas as categorias e horas atuais daquele perfil.
2. THE Edit_Modal SHALL exibir um campo numérico para cada categoria do perfil selecionado.
3. WHEN o usuário submete o Edit_Modal com um valor de horas negativo em qualquer categoria, THE Edit_Modal SHALL exibir a mensagem de erro "Valor deve ser maior ou igual a zero" no campo correspondente sem chamar a API.
4. WHEN o usuário submete o Edit_Modal com um valor não numérico em qualquer categoria, THE Edit_Modal SHALL exibir a mensagem de erro "Valor inválido" no campo correspondente sem chamar a API.
5. WHEN o usuário submete o Edit_Modal com todos os campos válidos, THE Capacity_Manager SHALL chamar `PUT /api/perfis-capacity/{perfil}` com as horas atualizadas.
6. WHEN a requisição de edição é concluída com sucesso, THE Capacity_Manager SHALL atualizar os dados exibidos, fechar o Edit_Modal e exibir uma notificação de sucesso.
7. IF a requisição de edição falha, THEN THE Capacity_Manager SHALL manter o Edit_Modal aberto e exibir uma notificação de erro com a mensagem retornada pela API.
