# Plano de Implementação: Gerenciar Times e Capacity

## Visão Geral

Implementação incremental da feature `team-capacity-settings`, que expande a aba "Configurações" do Dashboard com duas novas seções: **Gerenciar Colaboradores** e **Gerenciar Horas por Perfil**. O backend migra o dict `PERFIS_CAPACITY` hardcoded para um arquivo `perfis_capacity.json` editável via dois novos endpoints. O frontend cria o componente `ConfiguracoesTime.tsx` seguindo o padrão visual de `ConfiguracoesMSP.tsx`.

## Tarefas

- [ ] 1. Criar `backend/perfis_capacity.json`
  - Criar o arquivo `backend/perfis_capacity.json` com o conteúdo extraído do dict `PERFIS_CAPACITY` em `servico_capacity.py`
  - Estrutura: `{ "Tech Leader": {...}, "Efetivo": {...}, "Estagiario": {...} }` com os valores atuais de horas por categoria
  - _Requisitos: 6.1_

- [ ] 2. Migrar `backend/app/servico_capacity.py` para usar `perfis_capacity.json`
  - [ ] 2.1 Adicionar funções de I/O para `perfis_capacity.json`
    - Adicionar constante `_PERFIS_PATH` apontando para `../perfis_capacity.json` (relativo ao diretório do arquivo)
    - Implementar `_carregar_perfis() -> dict`: lê e retorna o JSON; retorna `{}` se arquivo não existir
    - Implementar `_salvar_perfis(data: dict) -> None`: escreve o JSON com `ensure_ascii=False, indent=2`
    - Implementar `listar_perfis() -> dict`: retorna `_carregar_perfis()`
    - Implementar `atualizar_perfil(perfil: str, categorias: dict[str, float]) -> dict`: carrega, valida existência do perfil (lança `KeyError` se não encontrado), atualiza e salva
    - _Requisitos: 6.2, 6.3, 6.4, 6.5_

  - [ ] 2.2 Modificar `calcular_capacity` para usar `_carregar_perfis()`
    - Substituir a referência a `PERFIS_CAPACITY` por uma chamada a `_carregar_perfis()` no início da função
    - Remover o dict `PERFIS_CAPACITY` hardcoded do módulo
    - Garantir que o campo `"perfis"` no resultado de `calcular_capacity` continue sendo populado (agora com os dados do arquivo)
    - _Requisitos: 6.7_

- [ ] 3. Adicionar endpoints `GET/PUT /api/perfis-capacity` em `backend/app/main.py`
  - [ ] 3.1 Atualizar imports de `servico_capacity`
    - Substituir `PERFIS_CAPACITY` por `listar_perfis` e `atualizar_perfil` no import de `servico_capacity`
    - Atualizar o endpoint `GET /api/perfis` para chamar `listar_perfis()` em vez de retornar `PERFIS_CAPACITY` diretamente
    - _Requisitos: 6.2_

  - [ ] 3.2 Criar modelo Pydantic `PerfilCapacityUpdate`
    - Adicionar `class PerfilCapacityUpdate(BaseModel): categorias: dict[str, float]`
    - _Requisitos: 6.4_

  - [ ] 3.3 Implementar `GET /api/perfis-capacity`
    - Endpoint que retorna `listar_perfis()`
    - _Requisitos: 6.3_

  - [ ] 3.4 Implementar `PUT /api/perfis-capacity/{perfil}`
    - Validar que nenhum valor em `body.categorias` seja negativo; se houver, lançar `HTTPException(422)` com mensagem `"Valor de horas para '{categoria}' deve ser maior ou igual a zero"`
    - Chamar `atualizar_perfil(perfil, body.categorias)`; capturar `KeyError` e lançar `HTTPException(404)`
    - Retornar o resultado de `atualizar_perfil`
    - _Requisitos: 6.4, 6.5, 6.6_

- [ ] 4. Atualizar `docker-compose.yml` com novo volume
  - Adicionar a linha `- ./backend/perfis_capacity.json:/app/perfis_capacity.json` na seção `volumes` do serviço `backend`, após o volume de `clientes_msp.json`
  - _Requisitos: 6.1, 6.2_

- [ ] 5. Adicionar funções de API em `frontend/src/api.ts`
  - Implementar `getPerfisCapacity()`: `GET /api/perfis-capacity`, retorna `Record<string, Record<string, number>>`
  - Implementar `updatePerfilCapacity(perfil: string, categorias: Record<string, number>)`: `PUT /api/perfis-capacity/{perfil}` com body `{ categorias }`, retorna `Record<string, number>`
  - _Requisitos: 6.3, 6.4_

- [ ] 6. Criar `frontend/src/components/ConfiguracoesTime.tsx`
  - [ ] 6.1 Estrutura base, tipos e estilos
    - Definir interfaces: `ColaboradorFormState`, `ColaboradorFormErrors`, `PerfilCapacityFormState`, `PerfilCapacityFormErrors`
    - Copiar os objetos de estilo de `ConfiguracoesMSP.tsx`: `overlayStyle`, `modalStyle`, `fieldStyle`, `labelStyle`, `inputStyle`, `errorMsgStyle`, `modalActionsStyle`
    - Declarar todos os estados do componente conforme o design: colaboradores, perfisDisponiveis, perfis, modais, notificação, salvando, filtroNome
    - _Requisitos: 1.1, 1.2_

  - [ ] 6.2 Implementar carregamento de dados no mount
    - Carregar `GET /api/colaboradores` e `GET /api/perfis` em paralelo (usando `Promise.all`) para a seção de colaboradores
    - Carregar `GET /api/perfis-capacity` para a seção de horas por perfil
    - Exibir `<Spinner>` durante carregamento e `<Alert type="error">` em caso de falha
    - _Requisitos: 2.1, 2.3, 7.1, 7.3_

  - [ ] 6.3 Implementar seção "Gerenciar Colaboradores" — tabela e filtro
    - Renderizar tabela com colunas: Nome, Perfil, Time, Ações (Editar / Remover)
    - Derivar lista filtrada e ordenada via `useMemo`: filtro case-insensitive por substring no nome, ordenação alfabética
    - Renderizar campo de busca por nome acima da tabela
    - Botão "Adicionar Colaborador" no header do container
    - _Requisitos: 2.2, 2.4, 2.5_

  - [ ] 6.4 Implementar Add_Modal de colaborador
    - Abrir com campos em branco e perfil padrão "Efetivo"
    - Campos: Nome (input texto), Perfil (select com valores de `perfisDisponiveis`), Time (input texto)
    - Validações client-side antes de chamar a API: Nome obrigatório, Nome único, Time obrigatório
    - Chamar `updateColaborador` (PUT) em caso de sucesso; atualizar estado local, fechar modal, exibir notificação
    - Manter modal aberto e exibir notificação de erro em caso de falha na API
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ] 6.5 Implementar Edit_Modal de colaborador
    - Abrir pré-preenchido com perfil e time atuais do colaborador selecionado
    - Campos: Perfil (select) e Time (input texto); Nome exibido como label não editável
    - Validação: Time obrigatório
    - Chamar `updateColaborador` (PUT); atualizar estado local, fechar modal, exibir notificação de sucesso
    - Manter modal aberto e exibir notificação de erro em caso de falha
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ] 6.6 Implementar Delete_Confirmation de colaborador
    - Exibir nome do colaborador no modal de confirmação
    - Ao confirmar: chamar `deleteColaborador`, remover do estado local, fechar modal, exibir notificação de sucesso
    - Em caso de falha: fechar modal e exibir notificação de erro
    - Ao cancelar: fechar modal sem chamar a API
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 6.7 Implementar seção "Gerenciar Horas por Perfil" — visualização
    - Renderizar os perfis carregados de `GET /api/perfis-capacity` em cards ou tabela
    - Cada perfil exibe suas categorias com as horas diárias e o total (soma das categorias)
    - Botão "Editar" por perfil
    - _Requisitos: 7.2, 7.4_

  - [ ] 6.8 Implementar Edit_Modal de perfil capacity
    - Abrir pré-preenchido com todas as categorias e horas atuais do perfil selecionado
    - Renderizar um campo numérico por categoria
    - Validações: valor negativo → "Valor deve ser maior ou igual a zero"; valor não numérico → "Valor inválido"
    - Chamar `updatePerfilCapacity`; atualizar estado local, fechar modal, exibir notificação de sucesso
    - Manter modal aberto e exibir notificação de erro em caso de falha
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 7. Atualizar `frontend/src/components/Dashboard.tsx`
  - Adicionar import: `import ConfiguracoesTime from './ConfiguracoesTime';`
  - Localizar o bloco de renderização da aba `configuracoes` e envolver `<ConfiguracoesMSP />` e `<ConfiguracoesTime />` em `<SpaceBetween size="l">`
  - _Requisitos: 1.1, 1.2, 1.3_

- [ ] 8. Checkpoint — Rebuild Docker e verificar funcionamento
  - Fazer rebuild das imagens Docker com `docker-compose build --no-cache`
  - Subir os containers com `docker-compose up -d`
  - Verificar que o backend inicia sem erros e que `GET /api/perfis-capacity` retorna os dados do arquivo JSON
  - Verificar que a aba "Configurações" exibe as três seções (Clientes MSP, Gerenciar Colaboradores, Gerenciar Horas por Perfil)
  - Verificar que editar um perfil de capacity persiste no arquivo e reflete na UI após recarregar
  - Garantir que todos os fluxos de colaboradores (adicionar, editar, remover) funcionam corretamente

## Notas

- As tarefas devem ser executadas na ordem apresentada para garantir que cada etapa construa sobre a anterior
- O backend deve ser modificado antes do frontend para que os endpoints estejam disponíveis
- O componente `ConfiguracoesTime.tsx` deve seguir rigorosamente o padrão visual de `ConfiguracoesMSP.tsx` (estilos inline, Cloudscape, modais com overlay)
- O dict `PERFIS_CAPACITY` em `servico_capacity.py` deve ser completamente removido após a migração
- O endpoint `GET /api/perfis` existente deve continuar funcionando (agora delegando para `listar_perfis()`)
