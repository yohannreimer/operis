# Operis Interaction System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Operis web app's global orange button defaults and route-specific interaction styles with a coherent, accessible interaction system inspired by Superlist behavior across desktop and mobile.

**Architecture:** Add a small set of focused UI primitives under `apps/web/src/components/ui`, then migrate the shell and each feature in dependency order. Preserve domain behavior and existing APIs; use optimistic state, rollback and Sonner undo actions where the application already mutates immediately. Finish with an automated anti-pattern audit plus browser verification at desktop and phone breakpoints.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, Radix Dialog, Sonner, Lucide React, CSS with OKLCH semantic tokens, existing dnd-kit integrations.

---

## Preconditions and file map

Run all commands from:

```bash
cd /Volumes/SanDiskSSD/Projetos/Locais/Prymeira/Operis/.codex-worktrees/habitos-sidebar
```

Before the first code edit, print:

```text
IMPECCABLE_PREFLIGHT: context=pass product=pass command_reference=pass shape=pass image_gate=pass mutation=open
```

The image gate passes because the design used the five Operis screenshots supplied on 2026-08-08, the existing reference archive under `docs/superpowers/specs/assets/2026-08-05-operis-inbox-hoje/`, and official Superlist interaction documentation.

### New shared files

| File | Responsibility |
| --- | --- |
| `apps/web/src/components/ui/button.tsx` | Button and IconButton hierarchy, size, loading and accessible labels |
| `apps/web/src/components/ui/completion-control.tsx` | Compact completion mark with independent 44 px touch target |
| `apps/web/src/components/ui/field.tsx` | Label, hint and error relationship for form controls |
| `apps/web/src/components/ui/inline-composer.tsx` | Progressive one-line creation surface |
| `apps/web/src/components/ui/popover.tsx` | Accessible contextual menu with outside click, Escape and focus return |
| `apps/web/src/components/ui/sheet.tsx` | Radix side sheet and mobile bottom sheet primitive |
| `apps/web/src/components/ui/interaction-feedback.ts` | Optional short haptic feedback with safe feature detection |
| `apps/web/src/components/ui/ui.css` | Semantic OKLCH tokens and shared component states |
| `apps/web/src/components/ui/index.ts` | Stable public exports for the primitives |
| `apps/web/scripts/audit-interactions.mjs` | Regression audit for forbidden global button and orange glow patterns |

### Existing shared files to change

| File | Responsibility after migration |
| --- | --- |
| `apps/web/src/main.tsx` | Load the shared interaction CSS and configure neutral Sonner presentation |
| `apps/web/src/components/modal.tsx` | Radix-backed blocking dialog using shared button and field vocabulary |
| `apps/web/src/components/layout.tsx` | Named global capture action and no visible Settings entry |
| `apps/web/src/components/layout-navigation.ts` | User-visible route collections without Settings |
| `apps/web/src/components/layout-navigation.css` | Shell-only composition, no component-level button vocabulary |
| `apps/web/src/styles.css` | Legacy layout styles with global orange button defaults removed |

Feature CSS may position a shared component but must not redefine its colors, shadows, loading or focus states.

## Task 1: Establish semantic tokens and the Button primitives

**Files:**
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/button.test.tsx`
- Create: `apps/web/src/components/ui/ui.css`
- Create: `apps/web/src/components/ui/index.ts`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/styles.css:1-35,1155-1278`

- [ ] **Step 1: Write the failing Button tests**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Plus } from 'lucide-react';
import { Button, IconButton } from './button';

describe('Button', () => {
  it('uses a neutral primary variant and keeps its accessible name while loading', () => {
    render(<Button loading>Salvar projeto</Button>);
    const button = screen.getByRole('button', { name: 'Salvar projeto' });
    expect(button).toHaveClass('ui-button', 'ui-button--primary');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('supports secondary, tertiary and danger variants', () => {
    render(<><Button variant="secondary">Cancelar</Button><Button variant="tertiary">Editar</Button><Button variant="danger">Excluir</Button></>);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('ui-button--secondary');
    expect(screen.getByRole('button', { name: 'Editar' })).toHaveClass('ui-button--tertiary');
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass('ui-button--danger');
  });

  it('renders an icon action with a required accessible label', () => {
    const onClick = vi.fn();
    render(<IconButton label="Nova tarefa" icon={<Plus />} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```bash
npm test --workspace @execution-os/web -- src/components/ui/button.test.tsx
```

Expected: FAIL because `./button` does not exist.

- [ ] **Step 3: Implement Button and IconButton**

```tsx
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { clsx } from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger';
export type ButtonSize = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leadingIcon, className, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={clsx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <span className="ui-button__content">
        {leadingIcon}<span>{children}</span>
      </span>
      {loading ? <LoaderCircle className="ui-button__spinner" aria-hidden="true" /> : null}
    </button>
  );
});

type IconButtonProps = Omit<ButtonProps, 'children' | 'leadingIcon'> & {
  label: string;
  icon: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'tertiary', className, ...props },
  ref
) {
  return <Button ref={ref} aria-label={label} variant={variant} className={clsx('ui-icon-button', className)} {...props}>{icon}</Button>;
});
```

The visible content stays in the accessibility tree while CSS makes it transparent during loading, so the button keeps the same accessible name and width.

- [ ] **Step 4: Add semantic OKLCH tokens and shared states**

Add to `ui.css`:

```css
:root {
  --ui-canvas: oklch(0.155 0.006 55);
  --ui-surface: oklch(0.185 0.007 55);
  --ui-surface-raised: oklch(0.215 0.008 55);
  --ui-surface-hover: oklch(0.255 0.009 55);
  --ui-border: oklch(0.34 0.008 55 / 0.52);
  --ui-border-strong: oklch(0.46 0.009 55 / 0.68);
  --ui-text: oklch(0.925 0.007 65);
  --ui-text-muted: oklch(0.67 0.009 60);
  --ui-action: oklch(0.89 0.009 65);
  --ui-action-text: oklch(0.205 0.008 55);
  --ui-accent: oklch(0.70 0.17 47);
  --ui-success: oklch(0.72 0.11 155);
  --ui-warning: oklch(0.76 0.12 80);
  --ui-danger: oklch(0.68 0.16 25);
  --ui-focus-ring: 0 0 0 2px var(--ui-canvas), 0 0 0 4px color-mix(in oklch, var(--ui-accent) 72%, transparent);
  --ui-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}

.ui-button {
  position: relative;
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 0 12px;
  font-weight: 650;
  box-shadow: none;
  cursor: pointer;
  transition: color 120ms var(--ui-ease-out), background-color 120ms var(--ui-ease-out), border-color 120ms var(--ui-ease-out), opacity 120ms var(--ui-ease-out);
}
.ui-button--primary { background: var(--ui-action); color: var(--ui-action-text); }
.ui-button--secondary { background: transparent; border-color: var(--ui-border); color: var(--ui-text); }
.ui-button--tertiary { background: transparent; color: var(--ui-text-muted); }
.ui-button--danger { background: transparent; color: var(--ui-danger); }
.ui-button:hover:not(:disabled) { transform: none; box-shadow: none; }
.ui-button--secondary:hover:not(:disabled), .ui-button--tertiary:hover:not(:disabled) { background: var(--ui-surface-hover); color: var(--ui-text); }
.ui-button:focus-visible { outline: 0; box-shadow: var(--ui-focus-ring); }
.ui-button:active:not(:disabled) { transform: none; opacity: .78; }
.ui-button:disabled { opacity: .42; cursor: default; }
.ui-button--sm { min-height: 32px; padding-inline: 9px; font-size: .72rem; }
.ui-icon-button { width: 36px; padding: 0; }
.ui-button__content { display: inline-flex; align-items: center; gap: 7px; }
.ui-button__spinner { position: absolute; width: 16px; animation: ui-spin .7s linear infinite; }
.ui-button[aria-busy="true"] .ui-button__content { opacity: 0; }
@keyframes ui-spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .ui-button, .ui-icon-button { min-height: 44px; } .ui-icon-button { width: 44px; } }
@media (prefers-reduced-motion: reduce) { .ui-button { transition-duration: .01ms; } .ui-button__spinner { animation-duration: 1.4s; } }
```

Import `./components/ui/ui.css` immediately after `./styles.css` in `main.tsx`. Export `Button` and `IconButton` from `index.ts`.

- [ ] **Step 5: Remove the dangerous global defaults**

In `styles.css`, keep only font inheritance and disabled pointer behavior for native buttons. Delete:

```css
button { background: var(--primary); color: white; }
button:not([class]):not(:disabled) { box-shadow: 0 2px 8px var(--primary-glow); }
button:not([class]):hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px var(--primary-glow); }
button:active:not(:disabled) { transform: scale(0.97); }
```

Replace the legacy global block with a neutral reset so unmigrated controls remain legible between commits:

```css
button {
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
}
```

Do not remove route-specific button styles yet. They are migrated in later tasks before the final audit.

- [ ] **Step 6: Run the focused test and typecheck**

Run:

```bash
npm test --workspace @execution-os/web -- src/components/ui/button.test.tsx
npm run typecheck --workspace @execution-os/web
```

Expected: Button tests PASS and typecheck exits 0.

- [ ] **Step 7: Commit the foundation**

```bash
git add apps/web/src/components/ui apps/web/src/main.tsx apps/web/src/styles.css
git commit -m "feat: add neutral interaction button system"
```

## Task 2: Add completion, field, composer, modal and sheet primitives

**Files:**
- Create: `apps/web/src/components/ui/completion-control.tsx`
- Create: `apps/web/src/components/ui/completion-control.test.tsx`
- Create: `apps/web/src/components/ui/interaction-feedback.ts`
- Create: `apps/web/src/components/ui/field.tsx`
- Create: `apps/web/src/components/ui/inline-composer.tsx`
- Create: `apps/web/src/components/ui/inline-composer.test.tsx`
- Create: `apps/web/src/components/ui/popover.tsx`
- Create: `apps/web/src/components/ui/popover.test.tsx`
- Create: `apps/web/src/components/ui/sheet.tsx`
- Create: `apps/web/src/components/ui/sheet.test.tsx`
- Create: `apps/web/src/components/modal.test.tsx`
- Modify: `apps/web/src/components/modal.tsx`
- Modify: `apps/web/src/components/ui/index.ts`
- Modify: `apps/web/src/components/ui/ui.css`

- [ ] **Step 1: Write failing tests for compact completion and haptics**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionControl } from './completion-control';

describe('CompletionControl', () => {
  beforeEach(() => Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vi.fn() }));

  it('separates the 20px visual mark from the interactive button', () => {
    render(<CompletionControl checked={false} label="Concluir proposta" onCheckedChange={vi.fn()} />);
    const control = screen.getByRole('button', { name: 'Concluir proposta' });
    expect(control).toHaveClass('ui-completion-control');
    expect(control.querySelector('.ui-completion-control__mark')).toBeInTheDocument();
    expect(control).toHaveAttribute('aria-pressed', 'false');
  });

  it('requests a short haptic only when completing', () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(<CompletionControl checked={false} label="Concluir proposta" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir proposta' }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(navigator.vibrate).toHaveBeenCalledWith(10);
    rerender(<CompletionControl checked label="Reabrir proposta" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir proposta' }));
    expect(navigator.vibrate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Verify the completion test fails**

Run:

```bash
npm test --workspace @execution-os/web -- src/components/ui/completion-control.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement safe haptic feedback and CompletionControl**

```ts
export function confirmHaptic() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof window.navigator.vibrate === 'function') window.navigator.vibrate(10);
}
```

```tsx
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { confirmHaptic } from './interaction-feedback';

type Props = {
  checked: boolean;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  onCheckedChange(checked: boolean): void;
};

export function CompletionControl({ checked, label, disabled, busy, className, onCheckedChange }: Props) {
  return (
    <button
      type="button"
      className={clsx('ui-completion-control', className)}
      aria-label={label}
      aria-pressed={checked}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => {
        const next = !checked;
        if (next) confirmHaptic();
        onCheckedChange(next);
      }}
    >
      <span className="ui-completion-control__mark" aria-hidden="true">{checked ? <Check /> : null}</span>
    </button>
  );
}
```

Add CSS that fixes the button at 36 px desktop and 44 px mobile while keeping `.ui-completion-control__mark` at 20 px in both cases. The checked SVG must be 13 px. Hover changes border contrast only; focus uses `--ui-focus-ring`.

- [ ] **Step 4: Write failing tests for InlineComposer, Modal and Sheet**

Cover these exact behaviors:

```tsx
it('submits with Enter and preserves a named cancel action', () => {
  const onSubmit = vi.fn();
  render(<InlineComposer label="Nova tarefa" value="Enviar proposta" onValueChange={vi.fn()} onSubmit={onSubmit} onCancel={vi.fn()} placeholder="Qual trabalho precisa avançar?" />);
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Nova tarefa' }), { key: 'Enter' });
  expect(onSubmit).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Cancelar nova tarefa' })).toBeInTheDocument();
});
```

```tsx
it('renders a side sheet and returns close through Radix', () => {
  const onClose = vi.fn();
  render(<Sheet open title="Inbox" onClose={onClose}>Capturas</Sheet>);
  expect(screen.getByRole('dialog', { name: 'Inbox' })).toHaveClass('ui-sheet--side');
  fireEvent.click(screen.getByRole('button', { name: 'Fechar Inbox' }));
  expect(onClose).toHaveBeenCalledOnce();
});
```

`modal.test.tsx` must assert title association, close button name, `aria-modal`, optional footer and the `modal-md|lg|xl` size class.

- [ ] **Step 5: Implement Field and InlineComposer**

`Field` receives `label`, `htmlFor`, `hint`, `error` and children. It creates stable hint/error IDs with `useId`; callers pass those IDs through `aria-describedby` when needed.

`InlineComposer` owns no domain state. Its required API is:

```tsx
type InlineComposerProps = {
  label: string;
  value: string;
  placeholder: string;
  submitLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  error?: string;
  leading?: ReactNode;
  context?: ReactNode;
  onValueChange(value: string): void;
  onSubmit(): void;
  onCancel(): void;
};
```

Render a neutral `form.ui-inline-composer`, a visually hidden label, input, primary `Button` only when `value.trim()` is non-empty, and tertiary `IconButton` named `Cancelar ${label.toLowerCase()}`. `Enter` submits, `Escape` cancels, and composition events must not submit while an IME is active.

- [ ] **Step 6: Refactor Modal and implement Sheet with Radix Dialog**

`Modal` keeps its existing public props so current consumers compile. Replace manual body locking and key listeners with Radix `Dialog.Root`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, optional `Dialog.Description`, and an `IconButton` with label `Fechar ${title}`.

`Sheet` exposes:

```tsx
type SheetProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  side?: 'right' | 'bottom';
  initialFocusRef?: React.RefObject<HTMLElement>;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
};
```

Desktop defaults to `right`; CSS changes the same component to a bottom sheet under 760 px when `side="bottom"`. Use `onOpenAutoFocus` to focus `initialFocusRef` when supplied. Never render a second overlay inside the sheet.

- [ ] **Step 7: Implement the shared Popover and its focus tests**

Write these tests first:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Popover } from './popover';

it('opens a contextual menu, closes with Escape and returns focus', async () => {
  render(<Popover label="Opções da tarefa" trigger={<button type="button">Mais</button>}><button type="button">Arquivar</button></Popover>);
  const trigger = screen.getByRole('button', { name: 'Mais' });
  fireEvent.click(trigger);
  expect(screen.getByRole('menu', { name: 'Opções da tarefa' })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
});
```

Implement `Popover` without adding a dependency:

```tsx
import { cloneElement, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';

type Props = { label: string; trigger: ReactElement<ButtonHTMLAttributes<HTMLButtonElement>>; children: ReactNode; align?: 'start' | 'end' };

export function Popover({ label, trigger, children, align = 'end' }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        queueMicrotask(() => rootRef.current?.querySelector<HTMLElement>('[data-ui-popover-trigger]')?.focus());
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  return (
    <div className="ui-popover" ref={rootRef}>
      {cloneElement(trigger, {
        'data-ui-popover-trigger': true,
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
        onClick: (event) => {
          trigger.props.onClick?.(event);
          setOpen((current) => !current);
        }
      })}
      {open ? <div id={id} className={`ui-popover__content ui-popover__content--${align}`} role="menu" aria-label={label}>{children}</div> : null}
    </div>
  );
}
```

Add neutral surface, border, shadow and 150 ms opacity/transform reveal styles. Under reduced motion, remove the transform. Export `Popover` from `index.ts`.

- [ ] **Step 8: Run primitive tests and commit**

```bash
npm test --workspace @execution-os/web -- src/components/ui src/components/modal.test.tsx
npm run typecheck --workspace @execution-os/web
git add apps/web/src/components/ui apps/web/src/components/modal.tsx apps/web/src/components/modal.test.tsx
git commit -m "feat: add shared interaction surfaces"
```

Expected: focused tests PASS, typecheck exits 0, one commit created.

## Task 3: Migrate the shell, hide Settings and clarify capture

**Files:**
- Modify: `apps/web/src/components/layout-navigation.ts`
- Modify: `apps/web/src/components/layout-navigation.css`
- Modify: `apps/web/src/components/layout.tsx`
- Modify: `apps/web/src/components/layout.test.tsx`
- Modify: `apps/web/src/styles.css:1417-1465,19735-19915,20260-20280`

- [ ] **Step 1: Update shell tests first**

Change expected mobile secondary routes to:

```ts
expect(getMobileMoreLinks().map((link) => link.label)).toEqual([
  'Projetos', 'Frentes', 'Notas', 'Dashboard'
]);
```

Add:

```tsx
it('hides Settings from desktop, mobile and user-visible route collections', async () => {
  renderLayout('/hoje');
  expect(shellLinks.some((link) => link.to === '/configuracoes')).toBe(false);
  expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /mais opções/i }));
  expect(await screen.findByRole('dialog', { name: /mais opções/i })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();
});

it('labels the persistent mobile action as Capturar', async () => {
  renderLayout('/hoje');
  const capture = screen.getByRole('button', { name: 'Capturar' });
  expect(capture).toHaveTextContent('Capturar');
});

it('submits global capture with Enter', async () => {
  renderLayout('/hoje');
  fireEvent.click(screen.getByRole('button', { name: 'Capturar' }));
  const input = await screen.findByRole('textbox', { name: 'Captura rápida' });
  fireEvent.change(input, { target: { value: 'Comprar cabo USB-C' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(apiMock.createInboxItem).toHaveBeenCalledWith({ content: 'Comprar cabo USB-C', source: 'app' }));
});
```

- [ ] **Step 2: Run the layout test and verify it fails**

```bash
npm test --workspace @execution-os/web -- src/components/layout.test.tsx
```

Expected: FAIL because Settings is still visible and the capture action is still named `Capturar rápido`.

- [ ] **Step 3: Remove Settings only from discovery surfaces**

Keep `settingsLink` exported for direct route metadata if needed, but change:

```ts
export const shellLinks = shellGroups.flatMap((group) => group.links);

export function getMobileMoreLinks() {
  const moreRoutes = ['/projetos', '/frentes', '/notas', '/dashboard'];
  return moreRoutes.map((route) => shellLinks.find((link) => link.to === route)!).filter(Boolean);
}
```

Remove the `.sidebar-settings` rendering from `Layout`. Do not delete the `/configuracoes` route from `App.tsx`. Because command items are built from `shellLinks`, Settings also disappears from the palette without a second special case.

- [ ] **Step 4: Replace the capture surfaces with named shared controls**

Use `Inbox` and `Plus` Lucide icons, `Button`, `IconButton`, and `InlineComposer`:

```tsx
<Button variant="secondary" size="sm" className="sidebar-capture" leadingIcon={<Plus size={16} />} onClick={focusCaptureInput}>
  Capturar
</Button>
```

```tsx
<button type="button" className="mobile-capture-action" aria-label="Capturar" onClick={focusCaptureInput}>
  <Inbox aria-hidden="true" size={18} />
  <span>Capturar</span>
</button>
```

Render `InlineComposer` for the expanded command bar with label `Captura rápida`. Keep `handleQuickCapture` as the only API mutation function. Do not add an object-type chooser.

- [ ] **Step 5: Make the mobile action quiet and remove duplicate FAB styling**

Replace `.mobile-capture-fab` with `.mobile-capture-action`. It should sit above the bottom navigation, use `--ui-surface-raised`, a neutral border and muted text, and contain a visible label. The Inbox icon may use `--ui-accent`; the background may not. Remove orange borders, orange fill and heavy shadow.

Desktop capture focus uses the shared focus ring. Delete thick orange borders from `.premium-capture` and `.topbar-capture-expanded`.

- [ ] **Step 6: Run shell tests, typecheck and commit**

```bash
npm test --workspace @execution-os/web -- src/components/layout.test.tsx
npm run typecheck --workspace @execution-os/web
git add apps/web/src/components/layout.tsx apps/web/src/components/layout-navigation.ts apps/web/src/components/layout-navigation.css apps/web/src/components/layout.test.tsx apps/web/src/styles.css
git commit -m "feat: clarify global capture and hide settings"
```

Expected: layout tests PASS, Settings route code remains untouched.

## Task 4: Migrate Today completion, rollover and undo behavior

**Files:**
- Modify: `apps/web/src/features/today/today-execution-row.tsx`
- Create: `apps/web/src/features/today/today-execution-row.test.tsx`
- Modify: `apps/web/src/features/today/rollover-review.tsx`
- Create: `apps/web/src/features/today/rollover-review.test.tsx`
- Modify: `apps/web/src/features/today/use-today-workspace.ts`
- Modify: `apps/web/src/features/today/use-today-workspace.test.tsx`
- Modify: `apps/web/src/features/today/today-workspace.tsx`
- Modify: `apps/web/src/styles.css:300-650`

- [ ] **Step 1: Add failing interaction tests**

For `TodayExecutionRow`, assert one `CompletionControl` exists, the title is not wrapped by the completion button, and secondary actions remain keyboard reachable.

For rollover, add:

```tsx
it('renders compact neutral decisions for yesterday', () => {
  render(<RolloverReview items={[oldEntry]} targetDate="2026-08-08" onResolve={vi.fn()} />);
  expect(screen.getByRole('button', { name: /manter em hoje/i })).toHaveClass('ui-button--tertiary');
  expect(screen.getByRole('button', { name: /concluir/i })).toHaveClass('ui-button--tertiary');
  expect(screen.getByText('Pendente de ontem').closest('section')).toHaveClass('rollover-review');
});
```

In the hook test, exercise each inverse mutation:

```ts
expect(apiMock.resolveDailyRollover).toHaveBeenLastCalledWith('daily_old', 'keep_today', '2026-08-04');
expect(apiMock.setDailyExecutionCompleted).toHaveBeenLastCalledWith('daily_old', false);
expect(apiMock.assignDailyExecution).toHaveBeenLastCalledWith('2026-08-04', { sourceType: 'inbox', sourceId: 'inbox_1' });
```

- [ ] **Step 2: Verify the new tests fail**

```bash
npm test --workspace @execution-os/web -- src/features/today
```

Expected: FAIL because the shared control and rollover undo actions are absent.

- [ ] **Step 3: Replace Today checkboxes and rollover actions**

Use:

```tsx
<CompletionControl
  checked={completed}
  label={`${completed ? 'Reabrir' : 'Concluir'} ${entry.title}`}
  onCheckedChange={() => onToggle(entry)}
/>
```

Use `Button variant="tertiary" size="sm"` for `Manter em Hoje`, `Voltar ao Inbox` and `Concluir`. Preserve all accessible labels and the existing session preference for collapsed rollover.

Change `Adicionar item` to a tertiary `Button` that opens Inbox; its route composition class may control alignment only.

- [ ] **Step 4: Add explicit rollover undo mutations**

After a successful `resolveDailyRollover`, show a five-second Sonner toast. Its action calls:

```ts
async function undoRollover(item: TodayEntry, action: RolloverAction, resolved?: TodayEntry | void) {
  if (action === 'keep_today' && resolved) {
    const restored = await api.resolveDailyRollover(resolved.id, 'keep_today', item.date);
    setEntries((current) => current.filter((entry) => entry.id !== resolved.id));
    if (restored) setRollover((current) => [...current, restored].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position));
    return;
  }
  if (action === 'complete') {
    const restored = await api.setDailyExecutionCompleted(item.id, false);
    setRollover((current) => [...current, restored].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position));
    return;
  }
  const restored = await api.assignDailyExecution(item.date, { sourceType: item.kind, sourceId: item.sourceId });
  setRollover((current) => [...current, restored].sort((a, b) => a.date.localeCompare(b.date) || a.position - b.position));
}
```

If undo fails, reload the workspace and show `Não foi possível desfazer a revisão.`. Do not fake a local-only restore.

- [ ] **Step 5: Remove visual inflation and glows from Today CSS**

- `.ui-completion-control` owns the target and mark sizes;
- `.today-execution-row` stays a continuous row, not a card;
- `.rollover-review` uses a neutral top separator and a 3 to 4 px warning dot;
- `.rollover-review__actions` may wrap on narrow screens but buttons remain visually compact;
- `.today-workspace__add` has no orange fill;
- no selector in this section may use `var(--primary-glow)` or orange `box-shadow`.

- [ ] **Step 6: Run Today tests and commit**

```bash
npm test --workspace @execution-os/web -- src/features/today
npm run typecheck --workspace @execution-os/web
git add apps/web/src/features/today apps/web/src/styles.css
git commit -m "feat: refine today completion interactions"
```

Expected: Today tests PASS, completion remains optimistic, all three rollover decisions can be undone.

## Task 5: Migrate Inbox to Sheet and remove nested modal behavior

**Files:**
- Modify: `apps/web/src/features/today/inbox-tray.tsx`
- Create: `apps/web/src/features/today/inbox-tray.test.tsx`
- Modify: `apps/web/src/components/inbox-input.tsx`
- Create: `apps/web/src/components/inbox-input.test.tsx`
- Modify: `apps/web/src/components/create-task-modal.tsx`
- Create: `apps/web/src/components/create-task-modal.test.tsx`
- Modify: `apps/web/src/components/inbox-schedule-sheet.tsx`
- Modify: `apps/web/src/styles.css:650-860,18950-19035,980-1070`

- [ ] **Step 1: Add tests for neutral capture and non-nested conversion**

Test that Inbox renders `Sheet`, that the input is named `Capturar no Inbox`, `Enter` calls `onSubmit`, and the submit icon is a Lucide `CornerDownLeft` inside an `IconButton`.

Add a conversion test:

```tsx
fireEvent.click(screen.getByRole('button', { name: /converter .* em tarefa/i }));
expect(screen.queryByRole('dialog', { name: 'Inbox' })).not.toBeInTheDocument();
expect(screen.getByRole('dialog', { name: 'Nova tarefa' })).toBeInTheDocument();
expect(screen.getAllByRole('dialog')).toHaveLength(1);
```

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
npm test --workspace @execution-os/web -- src/features/today/inbox-tray.test.tsx src/components/inbox-input.test.tsx
```

Expected: FAIL before the tests can find shared Sheet and named input behavior.

- [ ] **Step 3: Replace Inbox custom dialog markup with Sheet**

Keep controller ownership in `InboxTray`. Render:

```tsx
<Sheet open={open} title="Inbox" eyebrow="Capturas" initialFocusRef={inputRef} onClose={onClose}>
  <div className="inbox-tray__capture">...</div>
  <div className="inbox-tray__content">...</div>
</Sheet>
```

When conversion starts, set `convertingItem` and call `onClose()` before opening `CreateTaskModal`. Render `CreateTaskModal` as a sibling of `Sheet`, not inside it. After conversion, call `controller.convert`, clear the item and leave the Inbox closed. This guarantees one modal surface at a time.

- [ ] **Step 4: Normalize InboxInput**

- label the input `Capturar no Inbox`;
- replace the text glyph `↵` with Lucide `CornerDownLeft`;
- replace folder/building emoji in autocomplete with `Folder` and `Building2`;
- use shared `IconButton` and tertiary `Button` for autocomplete rows;
- keep `@` filtering and keyboard behavior unchanged;
- remove permanent orange border; use shared focus-visible state.

- [ ] **Step 5: Migrate shared task and schedule dialogs**

In `CreateTaskModal`, use `Field` and shared `Button` variants. The submit button is primary, `Cancelar` secondary, option choices secondary with `aria-pressed`. Keep all domain fields and API payload unchanged.

Replace `InboxScheduleSheet`'s separate `.modal-overlay/.modal-content` vocabulary with `Sheet side="bottom"`. Keep `Executar hoje`, explicit time and cancel behavior unchanged.

Create `create-task-modal.test.tsx` before running the task suite:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTaskModal } from './create-task-modal';

const apiMock = vi.hoisted(() => ({ createTask: vi.fn(), getProjects: vi.fn() }));
vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return { ...actual, api: apiMock };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const workspaces = [{ id: 'ws-1', name: 'Negócios', type: 'empresa' as const }];

describe('CreateTaskModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getProjects.mockResolvedValue([]);
  });

  it('submits the existing structured task payload through the shared dialog', async () => {
    apiMock.createTask.mockResolvedValue({ id: 'task-1', title: 'Enviar proposta' });
    render(<CreateTaskModal open onClose={vi.fn()} workspaces={workspaces} />);
    fireEvent.change(screen.getByPlaceholderText(/verbo \+ objeto/i), { target: { value: 'Enviar proposta' } });
    fireEvent.change(screen.getByRole('combobox', { name: /frente/i }), { target: { value: 'ws-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => expect(apiMock.createTask).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws-1', title: 'Enviar proposta' })));
  });

  it('keeps the primary action disabled while the request is pending', async () => {
    apiMock.createTask.mockReturnValue(new Promise(() => undefined));
    render(<CreateTaskModal open onClose={vi.fn()} workspaces={workspaces} />);
    fireEvent.change(screen.getByPlaceholderText(/verbo \+ objeto/i), { target: { value: 'Enviar proposta' } });
    fireEvent.change(screen.getByRole('combobox', { name: /frente/i }), { target: { value: 'ws-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    expect(await screen.findByRole('button', { name: 'Criar tarefa' })).toBeDisabled();
  });
});
```

- [ ] **Step 6: Run Inbox/shared tests and commit**

```bash
npm test --workspace @execution-os/web -- src/components/inbox-input.test.tsx src/features/today/inbox-tray.test.tsx src/features/inbox src/components/create-task-modal.test.tsx
npm run typecheck --workspace @execution-os/web
git add apps/web/src/components apps/web/src/features/today/inbox-tray.tsx apps/web/src/features/today/inbox-tray.test.tsx apps/web/src/styles.css
git commit -m "feat: unify inbox capture surfaces"
```

## Task 6: Remove oversized Agenda timeline actions and nested recurrence dialogs

**Files:**
- Modify: `apps/web/src/features/agenda/mobile-day-timeline.tsx`
- Modify: `apps/web/src/features/agenda/mobile-day-timeline.test.tsx`
- Modify: `apps/web/src/features/agenda/block-inspector.tsx`
- Modify: `apps/web/src/features/agenda/block-inspector.test.tsx`
- Modify: `apps/web/src/features/agenda/planning-drawer.tsx`
- Modify: `apps/web/src/features/agenda/planner-block.tsx`
- Modify: `apps/web/src/features/agenda/agenda.css`

- [ ] **Step 1: Add failing timeline and inspector tests**

```tsx
it('uses a compact completion control beside task content and no trailing completion box', () => {
  render(<MobileDayTimeline week={weekFixture()} selectedDate="2026-08-06" controller={controller()} />);
  const complete = screen.getByRole('button', { name: /concluir .*proposta/i });
  expect(complete).toHaveClass('ui-completion-control');
  expect(complete.closest('.agenda-mobile-block-controls')).toBeNull();
});
```

In `block-inspector.test.tsx`, assert editing a recurring item shows the scope choices inside the same dialog and `screen.getAllByRole('dialog')` stays at length one.

- [ ] **Step 2: Run the Agenda tests and verify failure**

```bash
npm test --workspace @execution-os/web -- src/features/agenda/mobile-day-timeline.test.tsx src/features/agenda/block-inspector.test.tsx
```

Expected: FAIL because the completion action is in the large trailing controls and scope uses a nested Dialog.

- [ ] **Step 3: Restructure MobileBlock**

Render task/inbox rows as:

```tsx
<span className="agenda-mobile-block-time">...</span>
{block.kind !== 'commitment' ? <CompletionControl checked={Boolean(block.completedAt)} label={`${block.completedAt ? 'Reabrir' : 'Concluir'} ${block.title}`} onCheckedChange={() => onComplete(block)} /> : <CalendarDays className="agenda-mobile-block-kind" />}
<button className="agenda-mobile-block-main">...</button>
{planning && block.kind !== 'commitment' ? <IconButton label={`Mover ${block.title}`} icon={<MoreHorizontal />} onClick={() => setMoving(true)} /> : null}
```

Remove `.agenda-mobile-block-controls` completely. Use `Sheet side="bottom"` for move controls. `Confirmar mudança` is primary; cancel is secondary.

- [ ] **Step 4: Make recurrence scope an inline inspector state**

Delete the nested `Dialog.Root` for `scopeOpen`. When the user saves a recurring block, replace the inspector footer with an inline `fieldset` titled `Aplicar alteração` containing two secondary buttons: `Somente esta ocorrência` and `Toda a série`. Keep one `Dialog.Content` and preserve current `persist(scope)` calls.

- [ ] **Step 5: Migrate remaining Agenda actions**

Use shared button variants in `planning-drawer.tsx` and `planner-block.tsx`. Keep explicit keyboard-accessible controls for schedule, move, resize and complete. Route CSS may position them but cannot add orange backgrounds or glows.

- [ ] **Step 6: Run all Agenda tests and commit**

```bash
npm test --workspace @execution-os/web -- src/features/agenda
npm run typecheck --workspace @execution-os/web
git add apps/web/src/features/agenda
git commit -m "feat: compact agenda interactions"
```

Expected: all Agenda tests PASS; no nested recurrence dialog; Today timeline has no oversized right-side check buttons.

## Task 7: Migrate Tarefas composer, rows, filters and dialogs

**Files:**
- Modify: `apps/web/src/features/tasks/task-backlog-toolbar.tsx`
- Modify: `apps/web/src/features/tasks/task-create-composer.tsx`
- Modify: `apps/web/src/features/tasks/task-create-composer.test.tsx`
- Modify: `apps/web/src/features/tasks/task-row.tsx`
- Modify: `apps/web/src/features/tasks/task-row.test.tsx`
- Modify: `apps/web/src/features/tasks/task-detail-panel.tsx`
- Modify: `apps/web/src/features/tasks/task-filters-popover.tsx`
- Modify: `apps/web/src/features/tasks/task-schedule-dialog.tsx`
- Modify: `apps/web/src/features/tasks/task-waiting-dialog.tsx`
- Modify: `apps/web/src/features/tasks/tasks.css`

- [ ] **Step 1: Extend task tests for the shared interaction vocabulary**

Add assertions:

```tsx
expect(screen.getByRole('button', { name: /concluir preparar apresentação/i })).toHaveClass('ui-completion-control');
expect(screen.getByRole('button', { name: /nova tarefa/i })).toHaveTextContent('Nova tarefa');
```

For the composer:

```tsx
expect(screen.getByRole('form', { name: 'Nova tarefa complexa' })).not.toHaveClass('task-create-composer--accent');
expect(screen.getByRole('button', { name: 'Criar' })).toHaveClass('ui-button--primary');
expect(screen.getByRole('button', { name: 'Cancelar nova tarefa' })).toHaveClass('ui-icon-button');
```

- [ ] **Step 2: Run task tests and verify failure**

```bash
npm test --workspace @execution-os/web -- src/features/tasks/task-row.test.tsx src/features/tasks/task-create-composer.test.tsx src/features/tasks/task-backlog-page.test.tsx
```

Expected: FAIL on shared classes.

- [ ] **Step 3: Migrate toolbar and task rows**

- `Nova tarefa` uses `Button variant="secondary"` with visible text on desktop and an accessible visible short label on mobile;
- filter trigger uses `Button variant="secondary"`;
- filter clearing uses tertiary;
- task row completion uses `CompletionControl`;
- row body remains the detail opener;
- drag and more actions use `IconButton` or the standardized popover menu class.

Do not change task grouping, filtering, drag movement or detail URL behavior.

- [ ] **Step 4: Make the task composer neutral**

Keep its current state and validation, but compose it with `InlineComposer` semantics:

- neutral `--ui-surface` background;
- neutral border;
- no brown tint or orange border;
- primary `Criar` appears only with a non-empty title;
- tertiary `Adicionar contexto`;
- tertiary cancel icon;
- existing fields remain below when expanded;
- failed creation keeps title and context values.

- [ ] **Step 5: Migrate detail actions and task dialogs**

Use Button variants in the detail panel. `Concluir` uses a success-colored icon with secondary button structure, not a filled green/orange action. `TaskScheduleDialog` and `TaskWaitingDialog` continue using `Modal`, `Field`, secondary cancel and neutral primary submit.

Use the shared popover surface for filters and move menus. Preserve role `menu`, arrow-key/focus behavior already supported, and all accessible names.

- [ ] **Step 6: Delete route-specific orange/glow styles**

Remove from `tasks.css`:

- orange `.task-new-button` fill;
- brown/orange `.task-create-composer` background and border;
- orange focus box-shadow on search;
- any orange hover shadow.

Keep the 2 px accent only for active tab underline, selected row indicator and focus.

- [ ] **Step 7: Run all task tests and commit**

```bash
npm test --workspace @execution-os/web -- src/features/tasks
npm run typecheck --workspace @execution-os/web
git add apps/web/src/features/tasks
git commit -m "feat: unify task interactions"
```

Expected: all task tests PASS and the composer no longer renders an orange/brown container.

## Task 8: Migrate Hábitos controls and dialogs

**Files:**
- Modify: `apps/web/src/pages/habitos.tsx`
- Modify: `apps/web/src/features/habits/habit-day-list.tsx`
- Modify: `apps/web/src/features/habits/habit-day-list.test.tsx`
- Modify: `apps/web/src/features/habits/habit-value-editor.tsx`
- Modify: `apps/web/src/features/habits/habit-value-editor.test.tsx`
- Modify: `apps/web/src/features/habits/habit-evolution-view.tsx`
- Modify: `apps/web/src/features/habits/habits.css`

- [ ] **Step 1: Add failing habit interaction assertions**

For binary habits, assert the completion action uses `CompletionControl` and still calls `onToggle(id, currentValue)`. For quantitative and vice habits, assert primary row actions use secondary buttons, menu actions use tertiary buttons, and delete uses danger.

For `HabitValueEditor`, assert one dialog, a secondary cancel button and primary `Salvar total` button.

- [ ] **Step 2: Run habit tests and verify failure**

```bash
npm test --workspace @execution-os/web -- src/features/habits
```

Expected: feature tests FAIL on the new shared component assertions.

- [ ] **Step 3: Migrate habit rows**

- binary uses `CompletionControl` plus a quiet text status;
- quantitative `+10 páginas` uses secondary Button;
- vice `Sigo firme` uses secondary Button and a shield icon;
- relapse remains danger semantics and never uses orange;
- row menu uses `IconButton` and shared menu surface;
- the 44 px touch area does not enlarge the visible completion mark.

Call the existing callbacks exactly as before. Do not change XP, streak or recurrence rules.

- [ ] **Step 4: Migrate Habit dialogs and header actions**

Use the shared Modal structure for `HabitFormDialog` and `HabitValueEditor`. Weekday choices are secondary buttons with `aria-pressed`; save is primary; cancel is secondary; close is IconButton. `Novo hábito` keeps visible text on mobile and desktop.

- [ ] **Step 5: Remove route-specific button vocabulary and commit**

```bash
npm test --workspace @execution-os/web -- src/features/habits
npm run typecheck --workspace @execution-os/web
git add apps/web/src/pages/habitos.tsx apps/web/src/features/habits
git commit -m "feat: refine habit interactions"
```

Expected: habit tests PASS; the habit feature CSS retains layout and life-area colors but no generic primary button definition.

## Task 9: Migrate Frentes and Projetos without redesigning approved flows

**Files:**
- Modify: `apps/web/src/features/fronts/front-overview.tsx`
- Modify: `apps/web/src/features/fronts/front-rail.tsx`
- Modify: `apps/web/src/features/fronts/responsibility-editor-panel.tsx`
- Modify: `apps/web/src/features/fronts/responsibility-review-panel.tsx`
- Modify: `apps/web/src/features/fronts/fronts.css`
- Modify: `apps/web/src/features/fronts/fronts-page.test.tsx`
- Modify: `apps/web/src/features/projects/project-list.tsx`
- Modify: `apps/web/src/features/projects/project-wizard.tsx`
- Modify: `apps/web/src/features/projects/project-tasks-panel.tsx`
- Modify: `apps/web/src/features/projects/project-tasks-panel.test.tsx`
- Modify: `apps/web/src/features/projects/project-shell.tsx`
- Modify: `apps/web/src/features/projects/engines/engine-ui.tsx`
- Modify: `apps/web/src/features/projects/engines/milestone-engine.tsx`
- Modify: `apps/web/src/features/projects/engines/pipeline-engine.tsx`
- Modify: `apps/web/src/features/projects/engines/exploration-engine.tsx`
- Modify: `apps/web/src/features/projects/projects.css`

- [ ] **Step 1: Add tests for named creation and compact project task completion**

Add to existing suites:

```tsx
expect(screen.getByRole('button', { name: 'Nova Frente' })).toHaveTextContent('Nova Frente');
expect(screen.getByRole('button', { name: 'Novo Projeto' })).toHaveTextContent('Novo Projeto');
expect(screen.getByRole('button', { name: /concluir tarefa 1/i })).toHaveClass('ui-completion-control');
```

Wizard tests must assert Back is secondary, Continue/Save is primary, and close is IconButton. Preserve all existing methodology and payload assertions.

- [ ] **Step 2: Run project/front tests and verify failure**

```bash
npm test --workspace @execution-os/web -- src/features/fronts src/features/projects
```

Expected: FAIL on shared component classes or missing visible creation labels.

- [ ] **Step 3: Migrate Frentes surfaces**

- replace the icon-only rail plus with visible `Nova Frente` on expanded desktop and mobile, retaining an accessible label when rail space is constrained;
- refactor `FrontEditor` to `Sheet` with shared Field and buttons;
- use Sheet for responsibility editor/review panels;
- use tertiary IconButton for row menus;
- use primary only for final save/review confirmation;
- preserve attention, health and capacity semantic colors.

No change is allowed to Front selection persistence, responsibility API calls or navigation.

- [ ] **Step 4: Migrate approved Project flows**

- keep the wizard steps and methodology selection intact;
- replace its close/back/next/save buttons with shared primitives;
- use CompletionControl for project task completion;
- keep `Nova tarefa` inline in the project task panel;
- replace `window.prompt` for `Editar direção` with an inline Field inside the existing project action surface;
- replace engine-local `.engine-dialog` wrappers with shared Modal;
- engine add/cancel actions follow primary/secondary hierarchy;
- dangerous delete remains a separate confirmation.

Do not alter project engines, recommendation logic, next movement rules or API payloads.

- [ ] **Step 5: Remove colored button backgrounds and run tests**

In `fronts.css` and `projects.css`, keep brand/health/methodology colors only for state indicators, selected options and data visualization. Remove generic orange fills, gradient buttons and colored shadows.

Run:

```bash
npm test --workspace @execution-os/web -- src/features/fronts src/features/projects
npm run typecheck --workspace @execution-os/web
```

Expected: all existing and new tests PASS.

- [ ] **Step 6: Commit Frentes and Projetos migration**

```bash
git add apps/web/src/features/fronts apps/web/src/features/projects
git commit -m "feat: unify front and project interactions"
```

## Task 10: Migrate Notas capture, menus and temporary surfaces

**Files:**
- Modify: `apps/web/src/features/notes/notes-library-page.tsx`
- Modify: `apps/web/src/features/notes/quick-capture.tsx`
- Modify: `apps/web/src/features/notes/folder-filter-strip.tsx`
- Modify: `apps/web/src/features/notes/note-workspace-page.tsx`
- Modify: `apps/web/src/features/notes/note-document-editor.tsx`
- Modify: `apps/web/src/features/notes/note-actions-menu.tsx`
- Modify: `apps/web/src/features/notes/artifact-block.tsx`
- Modify: `apps/web/src/features/notes/notes.css`
- Modify: `apps/web/src/features/notes/quick-capture.test.tsx`
- Modify: `apps/web/src/features/notes/notes-accessibility.test.tsx`
- Modify: `apps/web/src/features/notes/notes-library-page.test.tsx`

- [ ] **Step 1: Add failing Notas interaction tests**

Assert:

- quick capture submits with Enter and remains inline;
- `Nova nota` and `Nova pasta` are named actions;
- template and folder manager dialogs use the shared Modal class;
- artifact fullscreen action remains tertiary;
- action menu close is IconButton;
- there is never more than one `aria-modal="true"` surface.

Example:

```tsx
expect(screen.getByRole('button', { name: 'Nova nota' })).toHaveClass('ui-button--secondary');
fireEvent.click(screen.getByRole('button', { name: /templates/i }));
expect(screen.getAllByRole('dialog')).toHaveLength(1);
```

- [ ] **Step 2: Run the Notes tests and verify failure**

```bash
npm test --workspace @execution-os/web -- src/features/notes/quick-capture.test.tsx src/features/notes/notes-accessibility.test.tsx src/features/notes/notes-library-page.test.tsx
```

Expected: FAIL on shared primitive expectations.

- [ ] **Step 3: Migrate capture and library actions**

Use `InlineComposer` for note capture. Keep slash commands, title/body creation and folder association unchanged. Use named secondary actions for `Nova nota`, `Templates` and `Nova pasta`. Use tertiary actions for filters and advanced options.

- [ ] **Step 4: Replace local Notes modals and panels**

- folder manager and template chooser use Modal;
- note action surface uses Sheet on mobile and side Sheet on desktop;
- artifact editing continues to use the approved full-screen route, not a smaller modal;
- close actions use IconButton;
- no overlay is nested inside another modal;
- unsaved note behavior and save retry remain unchanged.

- [ ] **Step 5: Normalize document and artifact microinteractions**

Use shared tertiary/icon actions in slash menus, artifact block actions, error dismissal and export menus. Preserve BlockNote commands, Excalidraw full-screen behavior, editor selection and autosave.

Remove orange fills/glows from notes creation and modal CSS. Orange may remain for active editor selection, focus and small artifact type icons.

- [ ] **Step 6: Run all Notes tests and commit**

```bash
npm test --workspace @execution-os/web -- src/features/notes
npm run typecheck --workspace @execution-os/web
git add apps/web/src/features/notes
git commit -m "feat: unify note interactions"
```

Expected: all Notes tests PASS and full-screen artifacts continue to work.

## Task 11: Add regression audit, verify Dashboard compatibility and perform visual QA

**Files:**
- Create: `apps/web/scripts/audit-interactions.mjs`
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/components/premium-ui.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/pages/dashboard.tsx`
- Create: `docs/superpowers/reports/2026-08-08-interaction-audit.md`

- [ ] **Step 1: Write the audit script before final cleanup**

```js
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.css', '.tsx'].includes(extname(path)) ? [path] : [];
  });
}

const files = sourceFiles(join(webRoot, 'src'));
const forbidden = [
  { label: 'classless button glow selector', pattern: /button:not\(\[class\]\)/ },
  { label: 'legacy primary glow token use', pattern: /var\(--primary-glow\)/ },
  { label: 'orange box shadow', pattern: /box-shadow:[^;]*(?:249\s*,\s*115\s*,\s*22|#f97316)/i },
  { label: 'button hover lift', pattern: /button[^\{]*:hover[^\{]*\{[^}]*translateY\s*\(\s*-1px/i }
];

const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const rule of forbidden) if (rule.pattern.test(source)) failures.push(`${rule.label}: ${file}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`interaction audit passed across ${files.length} files`);
```

Add to `apps/web/package.json`:

```json
"audit:interactions": "node scripts/audit-interactions.mjs"
```

- [ ] **Step 2: Run the audit and use each failure as the cleanup list**

```bash
npm run audit:interactions --workspace @execution-os/web
```

Expected before cleanup: FAIL with exact files containing legacy glow/lift patterns.

Remove each reported anti-pattern. Do not silence files or add allowlists. Data visualizations may keep orange strokes, but orange `box-shadow` remains forbidden.

- [ ] **Step 3: Distill Premium UI and verify Dashboard compatibility**

Remove decorative page-load staggering from `PremiumPage`, `PremiumHeader`, `PremiumCard`, `MetricCard` and `TabSwitch`. Render normal semantic elements and shared Buttons. This prevents orchestrated load motion from surviving in Dashboard and older surfaces.

Do not structurally redesign Dashboard. Render it, migrate only touched buttons/fields, and confirm its data and sections remain present.

- [ ] **Step 4: Run the complete automated suite**

```bash
npm run audit:interactions --workspace @execution-os/web
npm test --workspace @execution-os/web
npm run typecheck --workspace @execution-os/web
npm run build --workspace @execution-os/web
```

Expected:

- interaction audit prints `interaction audit passed`;
- all web tests PASS;
- typecheck exits 0;
- Vite production build exits 0.

- [ ] **Step 5: Run API regression verification**

Use the same safe dummy environment used by the existing worktree verification:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/operis_test' CLERK_SECRET_KEY='sk_test_dummy' PRYMEIRA_ACCOUNT_API_URL='http://127.0.0.1:3001' PRYMEIRA_ACCOUNT_API_KEY='dummy' npm test --workspace @execution-os/api
```

Expected: API test suite PASS. No API behavior should have changed in this plan.

- [ ] **Step 6: Start demo mode and inspect every route at four viewports**

```bash
VITE_DEMO_MODE=true VITE_API_URL=http://127.0.0.1:3000 npm run dev:web -- --host 127.0.0.1 --port 4174
```

Use the in-app Browser. Verify `/hoje`, `/agenda`, `/tarefas`, `/habitos`, `/frentes`, `/projetos`, `/notas`, `/dashboard` at:

- 1440 x 900;
- 1024 x 768;
- 390 x 844;
- 360 x 800.

For each route, capture default, creation open, one contextual surface, keyboard focus and a relevant completion/loading state. Confirm:

- no two indistinguishable plus actions;
- no orange button background or glow;
- visible completion mark at 20 px or less;
- mobile hit target at least 44 px;
- no nested dialogs;
- focus is visible;
- reduced motion media query removes non-essential transitions;
- Settings is absent from all discovery surfaces.

- [ ] **Step 7: Write the audit report with evidence**

Create `docs/superpowers/reports/2026-08-08-interaction-audit.md` with this table and fill every cell with `pass` or a fixed commit hash:

```markdown
| Surface | 1440 | 1024 | 390 | 360 | Creation | Focus | Error/loading |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Shell |  |  |  |  |  |  |  |
| Hoje |  |  |  |  |  |  |  |
| Agenda |  |  |  |  |  |  |  |
| Tarefas |  |  |  |  |  |  |  |
| Hábitos |  |  |  |  |  |  |  |
| Frentes |  |  |  |  |  |  |  |
| Projetos |  |  |  |  |  |  |  |
| Notas |  |  |  |  |  |  |  |
| Dashboard |  |  |  |  |  |  |  |
```

Embed or link the final screenshots produced by the browser verification. Reference the original Macshot filenames from the design spec for before/after comparison.

- [ ] **Step 8: Commit audit and final cleanup**

```bash
git add apps/web/package.json apps/web/scripts/audit-interactions.mjs apps/web/src docs/superpowers/reports/2026-08-08-interaction-audit.md
git commit -m "test: audit interaction system across routes"
git status --short
```

Expected: commit succeeds and `git status --short` is empty.

## Final acceptance checkpoint

Before reporting completion, rerun:

```bash
npm run audit:interactions --workspace @execution-os/web
npm test --workspace @execution-os/web
npm run typecheck --workspace @execution-os/web
npm run build --workspace @execution-os/web
git status --short
```

Completion requires fresh passing output, the browser audit report, screenshots at all four sizes and a clean worktree. Do not claim success from earlier task-level runs.
