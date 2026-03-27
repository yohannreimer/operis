# Canvas: Diagramas e Mapas Mentais nas Notas
**Data:** 2026-03-23
**Status:** Aprovado

---

## Contexto

O Operis é um OS de execução pessoal. A página de Notas já tem editor rich text (contentEditable customizado), autosave, templates, versionamento e integração com projetos/tarefas. Esta feature adiciona capacidade visual: diagramas de fluxo e mapas mentais integrados ao editor existente, com geração por IA a partir do texto da nota.

O campo `content` das notas é armazenado como HTML. O projeto usa CSS custom properties global em `styles.css` — sem Tailwind ou CSS Modules.

---

## Abordagem

Entrega faseada com gate explícito:

- **Fase 1:** Diagramas de fluxo (React Flow) + IA gerando de texto + 4 templates de execução
- **Fase 2:** Inicia somente após todos os 8 itens de verificação da Fase 1 passarem. Adiciona mapas mentais (mind-elixir) + IA + 4 templates estratégicos.

---

## Modelo de Dados

Dois novos modelos Prisma. Ambos os modelos e a relação em `Note` são adicionados em **uma única migration** ao final da Fase 1 — a migration é segura em produção pois só adiciona tabelas novas (não altera colunas existentes). O `MindMap` entra no banco na Fase 1 mas só é usado na Fase 2.

```prisma
model Diagram {
  id        String   @id @default(uuid())
  noteId    String   @unique @map("note_id")
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title     String?
  data      Json     // { nodes: ReactFlowNode[], edges: ReactFlowEdge[], viewport: Viewport }
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("diagrams")
}

model MindMap {
  id        String   @id @default(uuid())
  noteId    String   @unique @map("note_id")
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title     String?
  data      Json     // { nodeData: MindElixirData, ... }
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@map("mind_maps")
}
```

O `@unique` em `noteId` garante no máximo 1 Diagram e 1 MindMap por nota e cria automaticamente o índice necessário. O cascade delete remove o canvas ao excluir a nota.

O modelo `Note` recebe duas relações opcionais:
```prisma
diagram  Diagram?
mindMap  MindMap?
```

**Política de tamanho:** O campo `data` (Json) não tem cap no banco. A validação Zod no endpoint `PATCH /canvas/diagram` e `PATCH /canvas/mindmap` limita o payload a 500 KB — suficiente para diagramas complexos (500+ nodes). Diagramas maiores retornam `413 Payload Too Large`.

---

## API (Backend)

### Arquivo de rotas

Novo arquivo `apps/api/src/routes/canvas.ts` — separado de `notes.ts` para manter o arquivo de notas focado. Registrado em `app.ts` como `registerCanvasRoutes(app, prisma)`.

### Endpoints

```
GET    /canvas/notes/:noteId/diagram          — busca diagrama (200 com data | 404 se não existe)
POST   /canvas/notes/:noteId/diagram          — cria diagrama { data, title? }
PATCH  /canvas/notes/:noteId/diagram          — atualiza data (autosave)
DELETE /canvas/notes/:noteId/diagram          — remove diagrama

GET    /canvas/notes/:noteId/mindmap
POST   /canvas/notes/:noteId/mindmap
PATCH  /canvas/notes/:noteId/mindmap
DELETE /canvas/notes/:noteId/mindmap

POST   /canvas/notes/:noteId/diagram/generate — gera via IA (upsert)
POST   /canvas/notes/:noteId/mindmap/generate — gera via IA (upsert)
```

### Semântica dos endpoints

**GET** — retorna `{ id, data, title, updatedAt }` ou `404 { error: 'not_found' }`.

**POST** — cria. Retorna `409` se já existe (nesse caso o cliente deve usar PATCH).

**PATCH** — atualiza `data` e/ou `title`. Retorna `404` se não existe.

**DELETE** — remove. Retorna `204`. Não exige confirmação no backend (confirmação é responsabilidade do frontend).

**POST /generate** — comportamento de upsert:
```typescript
await prisma.diagram.upsert({
  where: { noteId },
  create: { noteId, data: generatedData },
  update: { data: generatedData }
})
```
O endpoint aceita `{ overwrite?: boolean }` no body. Se `overwrite` for `false` e já existir um diagrama, retorna `409 { error: 'diagram_exists', message: 'Já existe um diagrama. Envie overwrite: true para substituir.' }`.

### Contrato de erros (generate)

| Situação | Status | Body |
|----------|--------|------|
| Nota não encontrada | 404 | `{ error: 'note_not_found' }` |
| Texto da nota < 50 chars | 422 | `{ error: 'content_too_short', minLength: 50 }` |
| Claude retorna JSON inválido | 502 | `{ error: 'ai_invalid_response' }` |
| Claude API indisponível / timeout | 503 | `{ error: 'ai_unavailable' }` |
| Diagrama já existe e overwrite=false | 409 | `{ error: 'diagram_exists' }` |

### canvas-ai-service.ts

```typescript
// apps/api/src/services/canvas-ai-service.ts

export async function generateDiagram(noteContent: string): Promise<DiagramData>
// Extrai texto puro do HTML, envia para Claude com prompt de React Flow,
// valida e retorna { nodes: ReactFlowNode[], edges: ReactFlowEdge[], viewport: Viewport }
// Lança CanvasAIError com code: 'invalid_response' | 'unavailable' em caso de falha

export async function generateMindMap(noteContent: string): Promise<MindMapData>
// Idem mas retorna estrutura de árvore do mind-elixir
// Lança CanvasAIError com os mesmos códigos

export function extractPlainText(html: string): string
// Reutiliza a lógica já existente em notas.tsx (plainTextFromHtml)
// Remove tags HTML, decodifica entidades, retorna texto limpo
```

---

## Frontend — UX e Interação

### Toggle de modo

Toolbar superior do editor de notas ganha seletor de 3 modos:

```
[ ≡ Texto ]  [ ⬡ Diagrama ]  [ ✦ Mapa Mental ]
```

- **Texto** — editor contentEditable atual, sem alterações
- **Diagrama** — canvas React Flow (Fase 1)
- **Mapa Mental** — canvas mind-elixir (Fase 2; o botão existe na Fase 1 mas mostra "Em breve")

O conteúdo de texto é preservado ao trocar de modo.

### Estratégia de fetch do canvas

O canvas é carregado **lazily — somente quando o usuário clica no tab de Diagrama ou Mapa Mental**. O GET `/canvas/notes/:noteId/diagram` é disparado na primeira vez que o tab é aberto. O resultado é cacheado no estado do componente enquanto a nota está aberta; fechando a nota o cache é descartado.

**Estados de loading do canvas:**
1. `idle` — tab ainda não foi clicado
2. `loading` — fetch em andamento → skeleton/spinner no canvas
3. `empty` — 404 → empty state com as 3 opções de criação
4. `ready` — dados carregados → canvas renderizado
5. `error` — falha de rede → mensagem de erro + botão "Tentar novamente"

### Empty state (primeiro uso)

```
[ ícone ]
Nenhum diagrama ainda

[ Começar do zero ]  [ Escolher template ]  [ Gerar da nota ✦ ]
```

"Gerar da nota" aparece somente se `extractPlainText(note.content).length >= 50`. `extractPlainText` é a função já existente `plainTextFromHtml` de `notas.tsx`, movida para `utils/text.ts` para reutilização.

### Geração por IA — estados e erros

O botão "Gerar da nota ✦" (na toolbar ou no empty state) passa por:
1. Desabilita o botão, exibe spinner inline
2. POST `/canvas/notes/:noteId/diagram/generate`
3. **Sucesso** → canvas aparece com o diagrama gerado; toast "Diagrama gerado — edite à vontade"
4. **Erro `ai_unavailable`** → toast de erro "IA indisponível, tente em instantes"
5. **Erro `ai_invalid_response`** → toast "Não consegui gerar um diagrama para esse texto. Tente reformular a nota."
6. **Diagrama já existe** → modal de confirmação "Já existe um diagrama. Substituir com o gerado pela IA?" → Cancelar / Substituir

### Autosave do canvas

Independente do autosave de texto — debounce próprio de 1.5s após qualquer mudança no canvas. Usa PATCH `/canvas/notes/:noteId/diagram`. O `AutoSaveStatus` do canvas é exibido no mesmo indicador da nota ("Salvando..." / "Salvo") — os dois autosaves compartilham o componente de status mas têm timers separados. O status exibido é o "pior" dos dois (se qualquer um estiver `saving`, mostra saving).

### Deletar diagrama

A toolbar do canvas tem um botão `···` (menu) que expõe:
- Fit view
- Exportar como PNG
- **Limpar diagrama** (com confirmação inline: "Tem certeza? Essa ação não pode ser desfeita" + botões Cancelar / Limpar)

Ao confirmar, DELETE `/canvas/notes/:noteId/diagram` → canvas retorna para o empty state imediatamente.

### Viewport

O `viewport` (zoom + pan) é incluído no `data` salvo. Ao carregar o diagrama, o viewport salvo é restaurado. O botão "Fit view" na toolbar sempre reposiciona para mostrar todos os nodes.

---

## Fase 1 — Editor de Diagramas (React Flow)

### Dependência
```
npm install @xyflow/react
```

### Tipos de nó customizados (16 total)

Todos os nodes seguem o dark theme do Operis. Organizados em grupos no menu de inserção:

**Básicos**
| Tipo | Visual | Uso |
|------|--------|-----|
| `default` | Card escuro borda `--border` | Passo genérico |
| `start` | Pill verde arredondado | Início do fluxo |
| `end` | Pill vermelho/cinza | Fim / resultado |
| `annotation` | Post-it amarelo muted | Nota contextual |

**Fluxo**
| Tipo | Visual | Uso |
|------|--------|-----|
| `decision` | Losango borda `--accent` laranja | Decisão sim/não |
| `process` | Card com barra lateral colorida (azul) | Processo / etapa |
| `trigger` | Borda tracejada laranja | Evento disparador |
| `delay` | Card com ícone de relógio | Espera / tempo |
| `parallel` | Card com faixa dupla no topo | Ações simultâneas |
| `checkpoint` | Hexágono com ícone check | Gate de validação |
| `warning` | Card borda âmbar + ícone ⚠ | Risco / alerta |

**Pessoas & Sistemas**
| Tipo | Visual | Uso |
|------|--------|-----|
| `person` | Card com avatar circular + nome | Responsável / stakeholder |
| `system` | Card com canto cortado + ícone | Sistema externo |
| `group` | Container translúcido | Agrupar nós |

**Dados & Métricas**
| Tipo | Visual | Uso |
|------|--------|-----|
| `database` | Cilindro SVG customizado | Dado / repositório |
| `metric` | Card com valor grande destacado | KPI / número |

### Toolbar lateral do canvas

Barra esquerda minimalista com ícones:
```
+   Adicionar nó (abre panel com 16 tipos agrupados)
⬡   Templates
↩   Desfazer (Ctrl+Z)
↪   Refazer (Ctrl+Shift+Z)
⊡   Fit view
✦   Gerar com IA
···  Menu (exportar PNG, limpar diagrama)
```

### 4 Templates de Execução

1. **Fluxo de Decisão** — start → decision (losango) → 2 branches Sim/Não → end nodes
2. **Roadmap de Projeto** — linha horizontal com 4-5 marcos sequenciais (checkpoint nodes) + datas como edge labels
3. **Mapa de Dependências** — grafo com tasks como default nodes, edges de bloqueio com label "bloqueia"
4. **Planejamento de Lançamento** — 3 grupos (Pré-lançamento / Lançamento / Pós-lançamento) com process nodes em cada fase

### Arquivo novo
`apps/web/src/components/diagram-canvas.tsx` — componente React Flow completo com nodes customizados, toolbar, autosave hook e panel de templates.

---

## Fase 2 — Editor de Mapas Mentais (mind-elixir)

### Gate de início
Fase 2 começa somente após todos os 8 itens de verificação da Fase 1 passarem.

### Dependência
```
npm install mind-elixir
```

### Integração React ↔ mind-elixir

mind-elixir é uma biblioteca vanilla JS — a integração requer uma bridge explícita:

```typescript
// apps/web/src/components/mindmap-canvas.tsx

const containerRef = useRef<HTMLDivElement>(null)
const meRef = useRef<MindElixir | null>(null)

useEffect(() => {
  if (!containerRef.current) return
  const me = new MindElixir({
    el: containerRef.current,
    direction: MindElixir.RIGHT,
    draggable: true,
    editable: true,
    theme: operisTheme, // objeto de CSS vars mapeadas para o formato do mind-elixir
  })
  me.init(data ?? defaultData)
  me.bus.addListener('operation', handleChange) // captura toda mudança para autosave
  meRef.current = me

  return () => {
    me.bus.removeListener('operation', handleChange)
    meRef.current = null
  }
}, []) // inicializa uma vez; updates via me.refresh(newData)
```

O `handleChange` captura o evento `operation` do mind-elixir, extrai `me.getData()` e dispara o debounce de autosave. A inicialização é imperativa e não reativa — mudanças externas de dados (ex: carregamento inicial) são aplicadas via `meRef.current.refresh(data)`.

### Visual e theming

O mind-elixir aceita um objeto `theme` com cores CSS. Mapeamento:
```typescript
const operisTheme = {
  name: 'operis-dark',
  palette: ['#f97316', '#6366f1', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'],
  cssVar: {
    '--main-color': '#e8e4df',
    '--main-bgcolor': '#232328',
    '--color': '#a09a92',
    '--bgcolor': '#2a2a30',
    '--selected': 'rgba(249,115,22,0.15)',
    '--border': 'rgba(255,255,255,0.07)',
  }
}
```

### Interações nativas mantidas
- `Enter` — adicionar irmão
- `Tab` — adicionar filho
- `Delete` — remover nó
- Duplo clique — editar inline
- Drag — reordenar
- Scroll/pinch — zoom

### 4 Templates Estratégicos

1. **Mapa de Ideia** — raiz "Ideia" + 4 branches: O quê / Por quê / Como / Riscos
2. **Análise de Problema** — raiz "Problema" → Causas → Sintomas → Soluções
3. **Pros & Cons** — bifurcação simétrica, esquerda (Prós) / direita (Contras)
4. **5 Porquês** — cadeia descendente com 5 níveis "Por quê?"

### Arquivo novo
`apps/web/src/components/mindmap-canvas.tsx` — wrapper com bridge React↔mind-elixir, theming, autosave e templates.

---

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `apps/api/prisma/schema.prisma` | +2 modelos (`Diagram`, `MindMap`), relações opcionais em `Note` |
| `apps/api/prisma/migrations/` | Nova migration gerada por `prisma migrate dev` |
| `apps/api/src/routes/canvas.ts` | **novo** — 10 endpoints (CRUD × 2 tipos + generate × 2) |
| `apps/api/src/app.ts` | `registerCanvasRoutes(app, prisma)` |
| `apps/api/src/services/canvas-ai-service.ts` | **novo** — `generateDiagram`, `generateMindMap`, `extractPlainText` |
| `apps/web/src/api.ts` | +tipos `Diagram`, `MindMap`, `DiagramData`, `MindMapData` + hooks de fetch |
| `apps/web/src/utils/text.ts` | **novo** (ou expandido) — `extractPlainText` compartilhado |
| `apps/web/src/pages/notas.tsx` | Toggle de modo na toolbar, integração lazy dos canvas |
| `apps/web/src/components/diagram-canvas.tsx` | **novo** — React Flow completo |
| `apps/web/src/components/mindmap-canvas.tsx` | **novo** — mind-elixir bridge + Fase 2 |
| `apps/web/src/styles.css` | Estilos dos canvas, nodes customizados, toolbar lateral |

---

## Verificação

### Fase 1 — Gate para Fase 2

1. Nota com `extractPlainText(content).length < 50` → botão "Gerar da nota" não aparece
2. Clicar tab Diagrama pela primeira vez → loading state → empty state com 3 opções
3. "Começar do zero" → canvas React Flow vazio abre com toolbar lateral
4. "Escolher template" → panel de 4 templates → ao selecionar, canvas pré-populado aparece
5. Editar nodes/edges → 1.5s depois indicador mostra "Salvo"
6. Fechar nota e reabrir → clicar Diagrama → diagrama preservado com viewport restaurado
7. Trocar para modo Texto → texto original intacto; voltar para Diagrama → canvas intacto
8. "Gerar da nota" (nota > 50 chars):
   - Sucesso → diagrama aparece + toast de confirmação
   - Falha de rede → toast de erro com mensagem adequada
   - Diagrama já existe → modal de confirmação antes de substituir
9. "Limpar diagrama" via menu `···` → confirmação → empty state restaurado
10. `npx tsc --noEmit` → zero erros

### Fase 2

1. Clicar tab "Mapa Mental" → loading → empty state com 3 opções
2. "Começar do zero" → canvas mind-elixir com nó raiz vazio
3. Atalhos `Tab`/`Enter`/`Delete` funcionam no canvas
4. Duplo clique em nó → edição inline
5. Drag de nó → reordena e salva após 1.5s
6. Escolher template "Pros & Cons" → estrutura bifurcada aparece
7. "Gerar da nota" → mapa mental gerado + toast de confirmação
8. Fechar e reabrir → mapa preservado com posições
9. Deletar mapa → empty state restaurado
10. `npx tsc --noEmit` → zero erros
