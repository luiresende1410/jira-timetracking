# Design Técnico: Gerenciar Times e Capacity

## Overview

Esta feature expande a aba "Configurações" do Dashboard com duas novas seções gerenciáveis:

1. **Gerenciar Colaboradores** — CRUD completo de colaboradores (nome, perfil, time), consumindo os endpoints já existentes (`GET/PUT/DELETE /api/colaboradores`).
2. **Gerenciar Horas por Perfil** — Visualização e edição das horas diárias por categoria de cada perfil (Tech Leader, Efetivo, Estagiario), migrando os dados do dict `PERFIS_CAPACITY` hardcoded em `servico_capacity.py` para um arquivo `perfis_capacity.json` editável via dois novos endpoints.

A implementação segue rigorosamente o padrão visual e estrutural de `ConfiguracoesMSP.tsx`: componente autossuficiente (sem props), estado local, modais inline com overlay, estilos inline, Cloudscape Design System.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard.tsx  (aba 'configuracoes')                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  <ConfiguracoesMSP />   (existente — sem alteração)  │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  <ConfiguracoesTime />  (novo componente)            │   │
│  │  ┌─────────────────────────────────────────────────┐ │   │
│  │  │  Seção 1: Gerenciar Colaboradores               │ │   │
│  │  │  GET/PUT/DELETE /api/colaboradores              │ │   │
│  │  ├─────────────────────────────────────────────────┤ │   │
│  │  │  Seção 2: Gerenciar Horas por Perfil            │ │   │
│  │  │  GET /api/perfis-capacity                       │ │   │
│  │  │  PUT /api/perfis-capacity/{perfil}              │ │   │
│  │  └─────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Backend (FastAPI)                                          │
│                                                             │
│  servico_capacity.py                                        │
│  ├── _carregar_perfis()  ← lê perfis_capacity.json         │
│  ├── _salvar_perfis()    ← escreve perfis_capacity.json    │
│  └── calcular_capacity() ← usa _carregar_perfis()          │
│                                                             │
│  main.py                                                    │
│  ├── GET  /api/perfis-capacity      (novo)                  │
│  └── PUT  /api/perfis-capacity/{perfil}  (novo)             │
│                                                             │
│  perfis_capacity.json  (novo arquivo de dados)              │
└─────────────────────────────────────────────────────────────┘
```

**Fluxo de dados — Colaboradores:**
```
ConfiguracoesTime → api.ts → GET /api/colaboradores → colaboradores.json
ConfiguracoesTime → api.ts → PUT /api/colaboradores/{nome} → colaboradores.json
ConfiguracoesTime → api.ts → DELETE /api/colaboradores/{nome} → colaboradores.json
```

**Fluxo de dados — Perfis Capacity:**
```
ConfiguracoesTime → api.ts → GET /api/perfis-capacity → perfis_capacity.json
ConfiguracoesTime → api.ts → PUT /api/perfis-capacity/{perfil} → perfis_capacity.json
calcular_capacity() → _carregar_perfis() → perfis_capacity.json
```

---

## Components and Interfaces

### Backend

#### `backend/perfis_capacity.json` (novo arquivo)

Conteúdo inicial extraído do dict `PERFIS_CAPACITY` em `servico_capacity.py`:

```json
{
  "Tech Leader": {
    "Horas Administrativas": 4.0,
    "Horas de Apoio": 2.0,
    "Horas Efetivas": 2.0
  },
  "Efetivo": {
    "Horas Administrativas": 1.0,
    "Horas de Apoio": 3.0,
    "Horas Efetivas": 4.0
  },
  "Estagiario": {
    "Horas Administrativas": 1.0,
    "Horas de Estudo": 3.0,
    "Horas Efetivas": 2.0
  }
}
```

#### `backend/app/servico_capacity.py` (modificado)

Adicionar funções de I/O para `perfis_capacity.json` e modificar `calcular_capacity` para usar `_carregar_perfis()` em vez do dict hardcoded. O dict `PERFIS_CAPACITY` é removido.

```python
_PERFIS_PATH = os.path.join(os.path.dirname(__file__), "..", "perfis_capacity.json")

def _carregar_perfis() -> dict:
    if not os.path.exists(_PERFIS_PATH):
        return {}
    with open(_PERFIS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def _salvar_perfis(data: dict) -> None:
    with open(_PERFIS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def listar_perfis() -> dict:
    return _carregar_perfis()

def atualizar_perfil(perfil: str, categorias: dict[str, float]) -> dict:
    """Atualiza as categorias de um perfil existente. Lança KeyError se perfil não existe."""
    data = _carregar_perfis()
    if perfil not in data:
        raise KeyError(f"Perfil '{perfil}' não encontrado")
    data[perfil] = categorias
    _salvar_perfis(data)
    return data[perfil]
```

`calcular_capacity` passa a chamar `_carregar_perfis()` no início da função, substituindo a referência a `PERFIS_CAPACITY`.

**Compatibilidade com `main.py`:** O import `PERFIS_CAPACITY` em `main.py` (usado em `GET /api/perfis`) é substituído pela chamada `listar_perfis()`. O endpoint `/api/perfis` existente continua funcionando.

#### `backend/app/main.py` (modificado)

Novos imports de `servico_capacity`:
```python
from .servico_capacity import (
    listar_colaboradores,
    atualizar_colaborador,
    remover_colaborador,
    calcular_capacity,
    listar_perfis,       # novo
    atualizar_perfil,    # novo
)
```

Atualizar `GET /api/perfis` para usar `listar_perfis()` em vez de `PERFIS_CAPACITY`.

Novos endpoints:

```python
@app.get("/api/perfis-capacity")
async def get_perfis_capacity():
    return listar_perfis()

class PerfilCapacityUpdate(BaseModel):
    categorias: dict[str, float]

@app.put("/api/perfis-capacity/{perfil}")
async def put_perfil_capacity(perfil: str, body: PerfilCapacityUpdate):
    # Validar valores negativos
    for categoria, horas in body.categorias.items():
        if horas < 0:
            raise HTTPException(
                status_code=422,
                detail=f"Valor de horas para '{categoria}' deve ser maior ou igual a zero"
            )
    try:
        resultado = atualizar_perfil(perfil, body.categorias)
        return resultado
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

#### `docker-compose.yml` (modificado)

Adicionar volume para `perfis_capacity.json`:

```yaml
volumes:
  - ./backend/colaboradores.json:/app/colaboradores.json
  - ./backend/clientes_msp.json:/app/clientes_msp.json
  - ./backend/perfis_capacity.json:/app/perfis_capacity.json  # novo
```

### Frontend

#### `frontend/src/api.ts` (modificado)

Adicionar duas novas funções:

```typescript
export async function getPerfisCapacity() {
  return request<Record<string, Record<string, number>>>(API + '/perfis-capacity');
}

export async function updatePerfilCapacity(
  perfil: string,
  categorias: Record<string, number>
) {
  return request<Record<string, number>>(
    API + '/perfis-capacity/' + encodeURIComponent(perfil),
    { method: 'PUT', body: JSON.stringify({ categorias }) }
  );
}
```

#### `frontend/src/components/ConfiguracoesTime.tsx` (novo)

Componente autossuficiente (sem props) com duas seções:

**Seção 1 — Gerenciar Colaboradores:**
- Estado: `colaboradores: Record<string, ColaboradorConfig>`, `perfisDisponiveis: string[]`
- Carrega `GET /api/colaboradores` e `GET /api/perfis` no mount
- Tabela com colunas: Nome, Perfil, Time, Ações (Editar / Remover)
- Filtro por nome (case-insensitive, busca por substring)
- Ordenação alfabética por nome (derivada via `useMemo`)
- Add_Modal: campos Nome (texto), Perfil (select com valores de `GET /api/perfis`), Time (texto)
- Edit_Modal: campos Perfil (select) e Time (texto); Nome exibido como label não editável
- Delete_Confirmation: exibe nome do colaborador, botões Cancelar / Confirmar

**Seção 2 — Gerenciar Horas por Perfil:**
- Estado: `perfis: Record<string, Record<string, number>>`
- Carrega `GET /api/perfis-capacity` no mount
- Exibe cards ou tabela com os três perfis, cada um listando categorias e horas
- Exibe total de horas diárias por perfil (soma das categorias)
- Edit_Modal: um campo numérico por categoria do perfil selecionado

**Estrutura de estado do componente:**

```typescript
// Colaboradores
const [colaboradores, setColaboradores] = useState<Record<string, ColaboradorConfig>>({});
const [perfisDisponiveis, setPerfisDisponiveis] = useState<string[]>([]);
const [loadingColab, setLoadingColab] = useState(false);
const [erroColab, setErroColab] = useState('');

// Perfis Capacity
const [perfis, setPerfis] = useState<Record<string, Record<string, number>>>({});
const [loadingPerfis, setLoadingPerfis] = useState(false);
const [erroPerfis, setErroPerfis] = useState('');

// Modais colaboradores
const [modalAddColab, setModalAddColab] = useState(false);
const [modalEditColab, setModalEditColab] = useState<string | null>(null);
const [modalRemoveColab, setModalRemoveColab] = useState<string | null>(null);

// Modal perfil capacity
const [modalEditPerfil, setModalEditPerfil] = useState<string | null>(null);

// Notificação global
const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

// Salvando
const [salvando, setSalvando] = useState(false);

// Filtro colaboradores
const [filtroNome, setFiltroNome] = useState('');
```

**Validações — Colaboradores:**
- Nome: obrigatório (não pode ser vazio ou só whitespace), único na lista existente
- Time: obrigatório (não pode ser vazio ou só whitespace)
- Perfil: seleção obrigatória (sempre tem valor padrão "Efetivo")

**Validações — Perfis Capacity:**
- Cada campo de horas: deve ser numérico e ≥ 0
- Mensagem para negativo: "Valor deve ser maior ou igual a zero"
- Mensagem para não numérico: "Valor inválido"

**Estilos:** Reutilizar exatamente os mesmos objetos de estilo de `ConfiguracoesMSP.tsx` (`overlayStyle`, `modalStyle`, `fieldStyle`, `labelStyle`, `inputStyle`, `errorMsgStyle`, `modalActionsStyle`).

#### `frontend/src/components/Dashboard.tsx` (modificado)

Adicionar import:
```typescript
import ConfiguracoesTime from './ConfiguracoesTime';
```

Modificar a renderização da aba `configuracoes`:
```tsx
{tab === 'configuracoes' && (
  <SpaceBetween size="l">
    <ConfiguracoesMSP />
    <ConfiguracoesTime />
  </SpaceBetween>
)}
```

---

## Data Models

### Backend

#### Perfil Capacity (JSON)

```
Record<string, Record<string, float>>
```

Exemplo:
```json
{
  "Tech Leader": {
    "Horas Administrativas": 4.0,
    "Horas de Apoio": 2.0,
    "Horas Efetivas": 2.0
  }
}
```

Restrições:
- Chaves de perfil: strings não vazias, devem corresponder a perfis existentes para PUT
- Valores de horas: `float >= 0`

#### `PerfilCapacityUpdate` (Pydantic)

```python
class PerfilCapacityUpdate(BaseModel):
    categorias: dict[str, float]
```

Validação adicional no endpoint: rejeitar qualquer valor `< 0` com HTTP 422.

### Frontend

#### `ColaboradorConfig` (existente em `api.ts`)

```typescript
interface ColaboradorConfig {
  perfil: string;
  time: string;
}
```

#### `PerfilCapacityFormState`

```typescript
interface PerfilCapacityFormState {
  [categoria: string]: string;  // string para permitir edição livre no input
}

interface PerfilCapacityFormErrors {
  [categoria: string]: string | undefined;
}
```

#### `ColaboradorFormState`

```typescript
interface ColaboradorFormState {
  nome: string;
  perfil: string;
  time: string;
}

interface ColaboradorFormErrors {
  nome?: string;
  time?: string;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Ordenação alfabética de colaboradores

*Para qualquer* conjunto de colaboradores carregado no componente, a lista exibida deve estar sempre ordenada alfabeticamente por nome em ordem crescente, independentemente da ordem em que os dados chegam da API.

**Validates: Requirements 2.4**

---

### Property 2: Filtro de colaboradores por nome

*Para qualquer* conjunto de colaboradores e qualquer string de busca, todos os itens exibidos devem conter a string de busca no nome (comparação case-insensitive), e nenhum item cujo nome não contenha a string deve aparecer na lista filtrada.

**Validates: Requirements 2.5**

---

### Property 3: Validação de campos obrigatórios (whitespace)

*Para qualquer* string composta inteiramente de caracteres whitespace (incluindo string vazia), submetê-la como valor do campo Nome ou Time no Add_Modal ou Edit_Modal deve resultar em rejeição com a mensagem "Campo obrigatório", sem chamar a API.

**Validates: Requirements 3.3, 3.5, 4.3**

---

### Property 4: Unicidade de nome de colaborador

*Para qualquer* conjunto de colaboradores existentes e qualquer nome que já esteja presente nesse conjunto, tentar adicionar um colaborador com esse nome deve ser rejeitado com a mensagem "Já existe um colaborador com este nome", sem chamar a API.

**Validates: Requirements 3.4**

---

### Property 5: Adição de colaborador reflete na tabela

*Para qualquer* colaborador válido (nome único, perfil e time não vazios) adicionado com sucesso via API, o colaborador deve aparecer na tabela após a operação, e a tabela deve continuar ordenada alfabeticamente.

**Validates: Requirements 3.7**

---

### Property 6: Pré-preenchimento do modal de edição

*Para qualquer* colaborador na tabela, ao abrir o Edit_Modal, os campos Perfil e Time devem conter exatamente os valores atuais daquele colaborador.

**Validates: Requirements 4.1**

---

### Property 7: Round-trip de atualização de perfil capacity (backend)

*Para qualquer* perfil existente e qualquer conjunto válido de categorias com horas ≥ 0, chamar `PUT /api/perfis-capacity/{perfil}` seguido de `GET /api/perfis-capacity` deve retornar os dados exatamente como foram enviados no PUT.

**Validates: Requirements 6.4**

---

### Property 8: Rejeição de perfil inexistente no PUT

*Para qualquer* string que não corresponda a um perfil existente em `perfis_capacity.json`, chamar `PUT /api/perfis-capacity/{string}` deve retornar HTTP 404.

**Validates: Requirements 6.5**

---

### Property 9: Rejeição de horas negativas no PUT

*Para qualquer* perfil válido e qualquer payload onde pelo menos uma categoria tenha valor negativo, chamar `PUT /api/perfis-capacity/{perfil}` deve retornar HTTP 422.

**Validates: Requirements 6.6**

---

### Property 10: calcular_capacity reflete perfis_capacity.json

*Para qualquer* configuração de perfis em `perfis_capacity.json` e qualquer período válido, o resultado de `calcular_capacity` deve usar as horas por categoria definidas no arquivo, de modo que modificar o arquivo e recalcular produza resultados proporcionais às novas horas.

**Validates: Requirements 6.7**

---

### Property 11: Total de horas por perfil é soma das categorias

*Para qualquer* perfil com qualquer conjunto de categorias e horas, o total exibido pelo Capacity_Manager deve ser igual à soma aritmética de todas as horas das categorias daquele perfil.

**Validates: Requirements 7.4**

---

### Property 12: Pré-preenchimento do modal de edição de perfil

*Para qualquer* perfil exibido no Capacity_Manager, ao abrir o Edit_Modal, cada campo de categoria deve conter exatamente o valor atual daquela categoria para aquele perfil.

**Validates: Requirements 8.1, 8.2**

---

### Property 13: Validação de horas negativas no frontend

*Para qualquer* valor numérico negativo inserido em qualquer campo de categoria no Edit_Modal de perfil, a submissão deve ser rejeitada com a mensagem "Valor deve ser maior ou igual a zero", sem chamar a API.

**Validates: Requirements 8.3**

---

### Property 14: Validação de valor não numérico no frontend

*Para qualquer* string não numérica inserida em qualquer campo de categoria no Edit_Modal de perfil, a submissão deve ser rejeitada com a mensagem "Valor inválido", sem chamar a API.

**Validates: Requirements 8.4**

---

### Property 15: Atualização de perfil reflete na UI

*Para qualquer* atualização válida de perfil concluída com sucesso, os dados exibidos no Capacity_Manager devem refletir os novos valores imediatamente após o fechamento do modal.

**Validates: Requirements 8.6**

---

## Error Handling

### Backend

| Situação | Resposta |
|---|---|
| `PUT /api/perfis-capacity/{perfil}` com perfil inexistente | HTTP 404, `{"detail": "Perfil '{perfil}' não encontrado"}` |
| `PUT /api/perfis-capacity/{perfil}` com horas negativas | HTTP 422, `{"detail": "Valor de horas para '{categoria}' deve ser maior ou igual a zero"}` |
| `perfis_capacity.json` não encontrado na inicialização | Retornar dict vazio; logar warning |
| Erro de I/O ao salvar `perfis_capacity.json` | HTTP 500, propagar exceção |
| `colaboradores.json` não encontrado | Comportamento existente mantido (retorna `{}`) |

### Frontend

**ConfiguracoesTime — Colaboradores:**
- Falha no carregamento inicial: exibir `<Alert type="error">` com a mensagem da API no lugar da tabela
- Falha no PUT/DELETE: manter modal aberto (para add/edit) ou fechar (para delete), exibir `<Alert type="error">` dismissível com a mensagem da API
- Sucesso: fechar modal, exibir `<Alert type="success">` dismissível

**ConfiguracoesTime — Perfis Capacity:**
- Falha no carregamento inicial: exibir `<Alert type="error">` com a mensagem da API no lugar dos cards
- Falha no PUT: manter Edit_Modal aberto, exibir `<Alert type="error">` dismissível
- Sucesso: fechar modal, exibir `<Alert type="success">` dismissível

**Validação client-side (sem chamada à API):**
- Nome vazio/whitespace → "Campo obrigatório"
- Nome duplicado → "Já existe um colaborador com este nome"
- Time vazio/whitespace → "Campo obrigatório"
- Horas negativas → "Valor deve ser maior ou igual a zero"
- Horas não numéricas → "Valor inválido"

---

## Testing Strategy

### Abordagem Dual

A estratégia combina testes de exemplo (para comportamentos específicos e casos de erro) com testes baseados em propriedades (para invariantes universais).

### Testes de Exemplo (Unit Tests)

**Backend:**
- `GET /api/perfis-capacity` retorna o conteúdo do arquivo
- `PUT /api/perfis-capacity/{perfil}` com perfil inexistente → 404
- `PUT /api/perfis-capacity/{perfil}` com horas negativas → 422
- `calcular_capacity` com arquivo de perfis modificado produz resultado correto
- Carregamento do arquivo na inicialização do serviço

**Frontend:**
- Spinner exibido durante carregamento
- Mensagem de erro exibida quando API falha
- Add_Modal abre com campos em branco e perfil padrão "Efetivo"
- Edit_Modal de colaborador não permite editar o campo Nome
- Delete_Confirmation exibe o nome correto do colaborador
- Cancelar Delete_Confirmation não chama a API

### Testes Baseados em Propriedades (Property-Based Tests)

**Biblioteca recomendada:**
- Backend (Python): [Hypothesis](https://hypothesis.readthedocs.io/)
- Frontend (TypeScript): [fast-check](https://fast-check.dev/)

**Configuração mínima:** 100 iterações por propriedade.

**Tag format:** `Feature: team-capacity-settings, Property {N}: {texto}`

| Propriedade | Implementação |
|---|---|
| P1: Ordenação alfabética | `fc.array(fc.record({nome: fc.string(), perfil: fc.string(), time: fc.string()}))` → verificar `sorted === [...sorted].sort()` |
| P2: Filtro por nome | `fc.array(colaborador), fc.string()` → todos os resultados contêm a string (case-insensitive) |
| P3: Validação whitespace | `fc.stringOf(fc.constantFrom(' ', '\t', '\n', ''))` → sempre rejeitado |
| P4: Unicidade de nome | `fc.array(colaborador), fc.integer({min:0})` → nome existente sempre rejeitado |
| P5: Adição reflete na tabela | `fc.record({nome, perfil, time})` → após add, nome aparece na lista ordenada |
| P6: Pré-preenchimento edit colab | `fc.record({perfil, time})` → modal reflete valores exatos |
| P7: Round-trip PUT/GET perfil | `fc.record({categorias: fc.dictionary(fc.string(), fc.float({min:0}))})` → GET após PUT retorna mesmo valor |
| P8: 404 para perfil inexistente | `fc.string().filter(s => !perfisValidos.includes(s))` → sempre 404 |
| P9: 422 para horas negativas | `fc.record` com pelo menos um valor `< 0` → sempre 422 |
| P10: calcular_capacity usa arquivo | Modificar arquivo, recalcular → valores proporcionais às novas horas |
| P11: Total = soma das categorias | `fc.dictionary(fc.string(), fc.float({min:0}))` → total exibido = soma |
| P12: Pré-preenchimento edit perfil | `fc.record(perfil)` → cada campo reflete valor exato |
| P13: Rejeição horas negativas UI | `fc.float({max: -0.001})` → sempre rejeitado com mensagem correta |
| P14: Rejeição não numérico UI | `fc.string().filter(s => isNaN(Number(s)))` → sempre rejeitado |
| P15: Atualização reflete na UI | `fc.record(categorias válidas)` → UI exibe novos valores após sucesso |

**Reflexão sobre redundância:**
- P3 (whitespace) cobre tanto Nome quanto Time — uma única propriedade parametrizada por campo
- P13 e P14 são distintas (negativo vs. não numérico) — mantidas separadas
- P7 (round-trip backend) e P15 (atualização UI) são complementares, não redundantes: P7 testa a camada de persistência, P15 testa a camada de apresentação
- P1 e P5 são distintas: P1 testa a ordenação da lista existente, P5 testa que a adição mantém a ordenação

### Testes de Integração

- Verificar que `perfis_capacity.json` é criado com o conteúdo correto
- Verificar que o backend carrega do arquivo e não do dict hardcoded após restart
- Verificar que o volume Docker está configurado corretamente
- Verificar que `calcular_capacity` continua produzindo resultados corretos após a migração
