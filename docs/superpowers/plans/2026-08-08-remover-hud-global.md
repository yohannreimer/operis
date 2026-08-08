# Remoção da HUD Global Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** Remover a barra global acima das telas do Operis sem perder captura rápida, atalhos, contexto de Frente, alertas sistêmicos ou navegação móvel.

**Architecture:** O shell deixa de renderizar a `app-topbar` e qualquer espaço reservado para ela. A captura rápida passa a usar o `Sheet` compartilhado, controlado pelo estado já existente, de modo que os gatilhos da sidebar, do celular, do teclado e da command palette continuem convergindo para o mesmo fluxo. O estado de Frente, a command palette, o painel de atalhos e o alerta de backend permanecem no shell, apenas sem controles duplicados visíveis no topo.

**Tech Stack:** React, TypeScript, React Router, Radix Dialog por meio do componente compartilhado `Sheet`, Lucide, CSS, Vitest e Testing Library.

---

## Task 1: Travar o contrato do shell sem HUD

**Files:**
- Modify: `apps/web/src/components/layout.test.tsx`
- Test: `apps/web/src/components/layout.test.tsx`

- [ ] **Step 1: Adicionar um teste que prove que a HUD não é renderizada**

Dentro de `describe('Layout mobile shell rendering', ...)`, adicionar um teste que renderiza o shell e verifica a ausência do cabeçalho global, mantendo o conteúdo da rota:

```tsx
it('renders route content without the global top HUD', async () => {
  const { container } = renderLayout('/hoje');

  expect(await screen.findByText('Hoje route body')).toBeInTheDocument();
  expect(container.querySelector('.app-topbar')).not.toBeInTheDocument();
  expect(container.querySelector('.topbar-capture-expanded')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Adicionar um teste para a command palette por teclado**

O teste deve provar que `Meta+K` continua acessível sem o botão da HUD:

```tsx
it('keeps the command palette available from the keyboard', async () => {
  renderLayout('/hoje');

  fireEvent.keyDown(window, { key: 'k', metaKey: true });

  expect(await screen.findByRole('dialog', { name: 'Comandos' })).toBeInTheDocument();
});
```

O shell atual não nomeia esse diálogo. A implementação deverá adicionar `aria-label="Comandos"` à seção da command palette para que o contrato seja acessível e estável.

- [ ] **Step 3: Ajustar o teste de captura para exigir um fluxo em Sheet**

Manter a verificação de envio com Enter, mas provar primeiro que o gatilho móvel abre o diálogo compartilhado:

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Capturar' }));
expect(await screen.findByRole('dialog', { name: 'Capturar' })).toBeInTheDocument();

const input = screen.getByRole('textbox', { name: 'Captura rápida' });
```

Adicionar também um teste dedicado ao atalho `C`:

```tsx
it('opens quick capture from the global C shortcut', async () => {
  renderLayout('/hoje');

  fireEvent.keyDown(window, { key: 'c' });

  expect(await screen.findByRole('dialog', { name: 'Capturar' })).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Captura rápida' })).toHaveFocus();
});
```

- [ ] **Step 4: Rodar o teste e confirmar a falha esperada**

Run:

```bash
npm test --workspace @execution-os/web -- src/components/layout.test.tsx
```

Expected: FAIL porque a `.app-topbar` ainda existe e a captura ainda é inline, sem diálogo `Capturar`.

- [ ] **Step 5: Commit dos testes vermelhos**

```bash
git add apps/web/src/components/layout.test.tsx
git commit -m "test: define shell without global hud"
```

## Task 2: Remover a HUD e preservar a captura rápida

**Files:**
- Modify: `apps/web/src/components/layout.tsx`
- Test: `apps/web/src/components/layout.test.tsx`

- [ ] **Step 1: Limpar imports exclusivos da HUD e importar o Sheet compartilhado**

Remover os ícones que só alimentavam controles visíveis da barra (`ChevronDown`, `CircleHelp`, `Command`, `LaptopMinimalCheck`) e remover `IconButton` caso fique sem outro uso no arquivo. Manter `Layers3`, `PanelLeftClose`, `PanelLeftOpen` e `Plus`, pois continuam usados por comandos, sidebar e captura móvel.

Atualizar o import de UI para incluir `Sheet`:

```tsx
import { Button, InlineComposer, Sheet } from './ui';
```

Se `IconButton` continuar sendo usado fora do trecho removido, preservá-lo.

- [ ] **Step 2: Fazer todos os gatilhos abrirem o mesmo fluxo**

Trocar a ação `action-focus-capture` para chamar o callback que abre a captura antes de fechar a command palette:

```tsx
run: () => {
  focusCaptureInput();
  closeCommandPalette();
}
```

Adicionar `focusCaptureInput` às dependências do `useMemo` de `actionCommands`:

```tsx
[
  closeCommandPalette,
  copyBackendCommand,
  focusCaptureInput,
  openTaskComposer,
  sidebarCollapsed
]
```

Assim a ação não tenta focar um input desmontado.

- [ ] **Step 3: Remover o cabeçalho global inteiro**

Dentro de `<div className="app-main premium-main">`, apagar o bloco:

```tsx
<header className="app-topbar premium-topbar">
  ...
</header>
```

Não mover os controles para outra barra. A sidebar, os atalhos e os comandos existentes já são os pontos de entrada aprovados.

- [ ] **Step 4: Nomear a command palette preservada**

Como o botão visível será removido, garantir que o fluxo restante também tenha nome acessível:

```tsx
<section
  className="command-palette"
  role="dialog"
  aria-label="Comandos"
  aria-modal="true"
  onClick={(event) => event.stopPropagation()}
>
```

- [ ] **Step 5: Substituir o compositor inline por um Sheet sem impacto de layout**

No lugar de `captureExpanded && <div className="topbar-capture-expanded">...</div>`, renderizar:

```tsx
<Sheet
  open={captureExpanded}
  title="Capturar"
  side="bottom"
  initialFocusRef={quickCaptureInputRef}
  onClose={() => setCaptureExpanded(false)}
>
  <InlineComposer
    label="Captura rápida"
    value={quickCapture}
    placeholder="Capturar ideia ou pendência..."
    submitLabel="Capturar"
    busy={captureBusy}
    inputRef={quickCaptureInputRef}
    leading={<Inbox size={17} />}
    onValueChange={setQuickCapture}
    onSubmit={() => void handleQuickCapture()}
    onCancel={() => setCaptureExpanded(false)}
  />
</Sheet>
```

O `Sheet` deve ficar junto ao shell, antes do alerta sistêmico, e não dentro do fluxo de conteúdo. O sucesso de `handleQuickCapture` já limpa o campo e fecha o estado.

- [ ] **Step 6: Rodar os testes focados**

Run:

```bash
npm test --workspace @execution-os/web -- src/components/layout.test.tsx
```

Expected: PASS para ausência da HUD, command palette, captura móvel, captura por teclado e envio com Enter.

- [ ] **Step 7: Commit da mudança funcional**

```bash
git add apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx
git commit -m "feat: remove global hud"
```

## Task 3: Eliminar o CSS morto e o espaço reservado

**Files:**
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/components/layout.test.tsx`

- [ ] **Step 1: Remover seletores exclusivos da HUD**

Apagar as regras globais e responsivas sem consumidores:

```css
.app-topbar { ... }
.topbar-capture-wrap { ... }
.topbar-capture-toggle { ... }
.topbar-capture-toggle:hover { ... }
.topbar-capture-expanded { ... }
.topbar-capture-expanded .quick-capture { ... }
.topbar-capture-expanded .ui-inline-composer { ... }
.topbar-capture-expanded .quick-capture input { ... }
.premium-topbar { ... }
.topbar-workspace-selector { ... }
.topbar-workspace-selector:hover { ... }
.topbar-workspace-selector select { ... }
.selector-chevron { ... }
.sidebar-collapse-toggle { ... }
.command-k-trigger { ... }
```

Apagar também as variações desses seletores nos breakpoints móveis. Não remover seletores com nomes parecidos pertencentes ao editor de Notas, como `.notes-app-topbar`.

- [ ] **Step 2: Fazer o conteúdo começar no topo da área principal**

Alterar a margem padrão do conteúdo:

```css
.app-content {
  margin-top: 0;
}
```

Remover overrides responsivos que recolocam margem superior em `.premium-content` quando serviam apenas para separar a HUD do conteúdo. Preservar paddings do `.premium-main`, a área segura da navegação móvel e espaçamentos internos próprios das páginas.

- [ ] **Step 3: Confirmar que nenhum seletor ou import da HUD ficou órfão**

Run:

```bash
rg -n "app-topbar|premium-topbar|topbar-capture|topbar-workspace|sidebar-collapse-toggle|command-k-trigger|selector-chevron" apps/web/src
```

Expected: nenhuma ocorrência ligada ao shell global. Ocorrências de `.notes-app-topbar` são válidas e devem permanecer.

- [ ] **Step 4: Rodar verificação completa proporcional ao risco**

Run:

```bash
npm test --workspace @execution-os/web -- src/components/layout.test.tsx
npm run typecheck --workspace @execution-os/web
git diff --check
```

Expected: todos os comandos encerram com código 0.

- [ ] **Step 5: Verificar no navegador desktop e celular**

Abrir `http://127.0.0.1:4174/hoje` e confirmar:

- desktop inicia diretamente no título/conteúdo da tela, sem barra horizontal ou vão vazio;
- `⌘K` abre a command palette;
- `C`, “Capturar” da sidebar e “Capturar” móvel abrem o mesmo Sheet;
- o alerta de backend continua aparecendo apenas quando necessário;
- a navegação móvel continua acima da safe area e sem regressão de sobreposição.

- [ ] **Step 6: Commit da limpeza visual**

```bash
git add apps/web/src/styles.css
git commit -m "style: remove obsolete global hud spacing"
```

## Task 4: Revisão final do escopo

**Files:**
- Review: `apps/web/src/components/layout.tsx`
- Review: `apps/web/src/components/layout.test.tsx`
- Review: `apps/web/src/styles.css`

- [ ] **Step 1: Conferir o diff contra a especificação aprovada**

Run:

```bash
git diff HEAD~3 -- apps/web/src/components/layout.tsx apps/web/src/components/layout.test.tsx apps/web/src/styles.css
```

Confirmar que o diff não altera filtros locais de Frente, rotas, atalhos, alertas ou telas internas.

- [ ] **Step 2: Rodar a suíte final do workspace web**

Run:

```bash
npm test --workspace @execution-os/web
npm run typecheck --workspace @execution-os/web
npm run build --workspace @execution-os/web
git status --short
```

Expected: testes, typecheck e build passam; o status contém apenas mudanças deliberadas, se houver.

- [ ] **Step 3: Registrar o resultado**

Se os commits intermediários já tiverem sido criados, não criar commit vazio. Documentar no handoff os comandos executados e qualquer limitação de QA visual.
