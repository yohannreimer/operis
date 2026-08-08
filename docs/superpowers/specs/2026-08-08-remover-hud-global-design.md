# Remoção da HUD global

## Objetivo

Remover a barra horizontal fixa acima do conteúdo principal. A HUD repete controles raramente usados, consome altura útil e compete com a hierarquia própria de cada tela.

## Escopo

- Remover a renderização de `app-topbar premium-topbar` no shell desktop.
- Remover o compositor expandido associado ao botão de captura dessa barra.
- Preservar a sidebar e o controle de recolhimento já disponível nela.
- Preservar a navegação móvel e o botão móvel nomeado `Capturar`.
- Preservar a command palette, a captura rápida e a ajuda de atalhos por teclado.
- Preservar o seletor global de Frente no estado do shell; cada tela continua oferecendo o contexto necessário localmente.
- Manter o alerta de backend indisponível e os demais avisos sistêmicos.

## Comportamento

No desktop, o conteúdo começa no topo da área principal, sem uma barra vazia intermediária. Os atalhos globais continuam abrindo seus respectivos fluxos sem depender de um botão visível na HUD. No celular, nada muda.

## Testes

- A HUD não deve existir no shell renderizado.
- `⌘K` continua abrindo a command palette.
- O atalho de captura continua abrindo o fluxo de captura.
- A navegação e a captura móvel continuam visíveis.
- O shell não deve manter espaçamento reservado para a barra removida.

## Fora de escopo

- Redesenhar a command palette.
- Alterar os atalhos existentes.
- Remover filtros de Frente presentes dentro de Agenda, Tarefas, Projetos ou outras telas.
- Alterar alertas de conectividade.
