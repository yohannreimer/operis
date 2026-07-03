# Operis Mobile Experience Design

## Context

Operis already works well on desktop, but the current mobile experience feels like a compressed desktop app. The mobile version must support quick, real-world use: capture a thought, check today's plan, adjust a task, and quickly inspect agenda or project context from a phone.

The goal is not to rebuild the product as a separate app. The goal is to add a mobile-first interaction layer to the existing React/Vite frontend while preserving the current desktop workflows.

## Goals

- Make the logged-in app usable and comfortable on phone-sized screens.
- Prioritize fast capture, daily execution, agenda lookup, and task triage.
- Avoid sidebar/table-heavy desktop patterns on mobile.
- Preserve the existing desktop shell and routes.
- Implement the first mobile pass with focused changes to `apps/web/src/components/layout.tsx` and `apps/web/src/styles.css`, then adjust critical page layouts where needed.

## Non-Goals

- Native iOS/Android app.
- Offline-first behavior.
- Full redesign of every desktop page.
- Separate mobile route tree.
- Rewriting core page logic or API contracts.

## Recommended Approach

Use a dedicated responsive mobile shell over the existing routes.

On desktop and tablet-wide screens, the app keeps the current premium sidebar, topbar, and page layouts. On mobile, the shell changes to a phone-native pattern:

- compact topbar with workspace/context selector and utility actions;
- fixed bottom navigation for the most common flows;
- floating capture action that opens quick capture;
- drawer-style "More" menu for lower-frequency destinations;
- page content stacked into cards and lists instead of wide grids where possible.

This gives the phone version its own interaction model without duplicating routes or business logic.

## Mobile Navigation

Primary bottom tabs:

- Inbox: capture and process new items.
- Hoje: daily execution.
- Agenda: appointments and schedule.
- Tarefas: backlog and task triage.
- Mais: secondary destinations and account/system actions.

The "Mais" drawer includes:

- Frentes
- Projetos
- Notas
- Hábitos
- Dashboard
- Configurações
- current gamification/status summary

The existing desktop sidebar remains the source list for all routes. The mobile shell reuses the same `links` definition so route labels and destinations stay consistent.

## Quick Capture

Mobile quick capture is always reachable through a fixed floating action button. Tapping it opens the existing quick capture form as a bottom sheet or compact expanded panel.

Behavior:

- focus the input immediately;
- submit creates the same inbox item/task path used by the current topbar capture;
- Escape behavior remains for desktop;
- mobile close uses a clear icon button;
- bottom navigation remains visually below or hidden behind the sheet depending on available space.

## Page Adaptation Priorities

Phase 1 focuses on the main phone workflows:

1. Shell and navigation
2. Inbox
3. Hoje
4. Tarefas
5. Agenda

Secondary routes should remain accessible and not broken:

- Projetos
- Frentes
- Notas
- Hábitos
- Dashboard
- Configurações

For secondary routes, the first pass can use stacked layouts and controlled horizontal overflow for complex widgets. Deep redesigns can happen later.

## Layout Rules

At phone widths:

- page padding shrinks and accounts for bottom navigation safe area;
- `.premium-header` stacks actions under the title;
- `.premium-grid.two` and `.premium-grid.two-wide` become one column;
- topbar controls must not overflow horizontally;
- tables or dense grids either become card-like rows or live inside a scroll container with visible affordance;
- buttons inside headers and toolbars wrap or stretch instead of overflowing;
- modals and command palette use near-full-width sheets.

Use stable dimensions for bottom nav, icon buttons, and floating capture so the viewport does not jump when content changes.

## Components And Data Flow

Primary code surface:

- `apps/web/src/components/layout.tsx`
  - detect mobile through CSS classes, not JS-only routing;
  - render mobile bottom navigation and "More" drawer;
  - keep current command palette, shortcuts, workspace selector, and quick capture logic.
- `apps/web/src/styles.css`
  - add mobile shell rules after current premium shell rules so they win predictably;
  - add small-screen rules for headers, grids, forms, modals, and dense operational sections.

The existing `ShellContext` remains unchanged. Pages continue to receive active workspace, gamification, and refresh handlers the same way.

## Interaction Details

- Bottom nav highlights the current route using the same active-route logic as the sidebar.
- The capture button is route-independent and creates items from anywhere.
- Opening a nav destination closes any open mobile drawer.
- Mobile "Mais" is a real navigational drawer, not a copy of the full desktop sidebar squeezed onto the screen.
- The command palette remains available from the topbar, but it is secondary to touch navigation.

## Error Handling

- Existing API offline alert remains visible, but stacks vertically on mobile.
- If backend is unavailable, capture and page actions keep their current error toasts.
- The mobile drawer and capture panel should be closable even if API calls fail.

## Testing And Verification

Run:

- `npm run typecheck --workspace @execution-os/web`
- `npm run build --workspace @execution-os/web`

Manual browser verification:

- desktop viewport around 1440px: sidebar and current layout still work;
- tablet viewport around 768px: shell does not overlap or overflow;
- phone viewport around 390px: bottom nav, capture, Inbox, Hoje, Tarefas, and Agenda are usable;
- narrow phone viewport around 360px: no incoherent text overlap in topbar, nav, headers, or primary actions.

## Rollout Scope

The first implementation should make mobile viable without attempting to perfect every specialized project engine, note editor, or analytical dashboard. Those dense areas can receive deeper mobile redesigns after the main phone loop works smoothly.
