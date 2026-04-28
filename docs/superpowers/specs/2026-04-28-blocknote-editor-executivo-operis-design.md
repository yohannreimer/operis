# Editor Executivo do Operis com BlockNote
**Data:** 2026-04-28
**Status:** Aprovado para planejamento

---

## Contexto

A página de Notas do Operis já funciona como uma central de escrita e memória de execução: biblioteca de notas, pastas, busca, smart collections, autosave, histórico de revisões, templates, gravação/transcrição, exportações, atalhos, ligações com workspaces/projetos/tarefas e modos visuais de diagrama, mapa mental e lousa.

O ponto fraco atual é o editor textual. Ele usa `contentEditable`, `document.execCommand`, snippets de texto e manipulação manual de seleção/DOM. Isso limita a qualidade da escrita e torna recursos avançados frágeis. A nova direção é usar BlockNote como motor nativo de blocos, mantendo tudo que já existe e adicionando blocos executivos próprios do Operis.

---

## Objetivo

Transformar a aba **Texto** em um editor executivo nativo de blocos, com UX de escrita moderna e blocos específicos para decisão, próximos passos, riscos, insights, reuniões, checklist executivo e tarefa vinculada.

O editor deve preservar as integrações existentes:

- Autosave e salvamento manual.
- Histórico de revisões e restauração.
- Templates base e personalizados.
- Slash commands/comandos rápidos.
- Inserção de checklist, tabela, decisão, retro e data.
- Contagem de palavras/caracteres.
- Busca por conteúdo.
- Notas relacionadas.
- Exportação TXT, PDF e WhatsApp.
- Gravação/transcrição robusta com IA.
- Geração de diagrama e mapa mental a partir da nota.
- Modo Diagrama, Mapa Mental e Lousa.
- Vínculos com workspace, projeto, tarefa, pasta, tipo, tags e fixação.

---

## Decisão de Produto

O editor não deve ser um clone genérico do Notion. Ele deve ser um **editor executivo do Operis**: livre o suficiente para escrever sem fricção, mas com blocos estruturados que ajudam a transformar pensamento em execução.

O caminho aprovado é híbrido:

- Blocos comuns continuam disponíveis: parágrafo, headings, listas, checklist, tabela, quote/callout e formatação inline.
- Blocos Operis adicionam semântica de execução: Decisão, Próximo passo, Risco, Insight, Reunião, Checklist executivo e Tarefa vinculada.
- O usuário pode escrever livremente e inserir estrutura quando precisar.
- Os blocos customizados devem parecer parte do produto Operis, não widgets externos.

---

## Modelo de Dados

Adicionar campos nativos de documento ao modelo `Note`:

```prisma
model Note {
  content       String? // legado/cache textual ou HTML derivado durante migração
  contentBlocks Json?   @map("content_blocks")
  contentText   String? @map("content_text")
  contentHtml   String? @map("content_html")
  contentVersion Int    @default(1) @map("content_version")
}
```

Adicionar os mesmos campos em `NoteRevision`:

```prisma
model NoteRevision {
  content       String?
  contentBlocks Json?   @map("content_blocks")
  contentText   String? @map("content_text")
  contentHtml   String? @map("content_html")
  contentVersion Int    @default(1) @map("content_version")
}
```

`contentBlocks` é a fonte da verdade para notas já migradas. `contentText` e `contentHtml` são derivados para busca, IA, exportação e compatibilidade. `content` fica preservado no primeiro ciclo para não quebrar notas antigas, rotas existentes e rollback.

---

## Migração

A migração deve ser compatível com notas antigas.

1. Notas antigas podem ter `content` em HTML simples ou texto.
2. Ao abrir uma nota sem `contentBlocks`, o frontend converte `content` para blocos BlockNote.
3. Ao salvar, o app grava `contentBlocks`, `contentText`, `contentHtml` e também atualiza `content` com uma versão derivada compatível.
4. O backend passa a aceitar payloads antigos e novos durante a transição.
5. Depois de estabilizado, novas features deixam de depender de `content`.

Essa migração evita quebra de histórico, exportações e geração de canvas.

---

## Backend

Atualizar os schemas de criação e atualização de notas para aceitar:

```ts
contentBlocks?: unknown[] | null;
contentText?: string | null;
contentHtml?: string | null;
contentVersion?: number;
```

As validações devem limitar tamanho e profundidade do JSON de blocos. Como referência inicial:

- `contentBlocks`: máximo 1 MB serializado.
- `contentText`: máximo 500.000 caracteres, mantendo o limite atual.
- `contentHtml`: máximo 500.000 caracteres.
- Profundidade máxima de blocos aninhados: 8.

`hasNoteSnapshotChanged` deve comparar os campos nativos, não apenas `content`. `createNoteRevisionSnapshot` deve salvar os campos nativos para restauração fiel.

Busca por notas deve usar `contentText` quando disponível e cair para `content` em notas legadas.

---

## Frontend

Criar um módulo dedicado:

```txt
apps/web/src/features/notes/editor/
  operis-block-editor.tsx
  operis-block-schema.ts
  operis-block-serializers.ts
  operis-block-templates.ts
  operis-block-commands.ts
  legacy-content-migration.ts
```

`NotasPage` deve parar de conter a lógica interna do editor. Ela continua responsável por carregar notas, selecionar nota, salvar metadados e alternar modos. A escrita fica encapsulada em `OperisBlockEditor`.

Interface principal:

```ts
type OperisBlockEditorValue = {
  blocks: unknown[];
  text: string;
  html: string;
};

type OperisBlockEditorProps = {
  noteId: string;
  initialBlocks: unknown[] | null;
  legacyContent: string | null;
  onChange: (value: OperisBlockEditorValue) => void;
  onCommand: (command: OperisEditorCommand) => void;
};
```

O estado da nota mantém `contentBlocks`, `contentText` e `contentHtml`. O autosave usa esses campos. `contentPlain` passa a vir de `contentText`.

---

## Blocos Operis

### Decisão

Representa uma decisão executiva.

Campos:

- Título ou resumo.
- Motivo/contexto.
- Próximo passo opcional.
- Data implícita pelo documento.

Serialização textual:

```txt
Decisão: <titulo>
Motivo: <motivo>
Próximo passo: <proximo passo>
```

### Próximo Passo

Representa ação derivada da nota.

Campos:

- Texto da ação.
- Status local: aberto, feito.
- `taskId` opcional quando vinculado a tarefa real.

Esse bloco deve permitir, no futuro, criar uma tarefa a partir dele.

### Risco

Campos:

- Risco.
- Impacto.
- Mitigação.

Visualmente deve ter destaque sóbrio, sem parecer alerta agressivo por padrão.

### Insight

Bloco para aprendizado, tese ou percepção relevante.

Campos:

- Texto principal.
- Categoria opcional futura.

### Reunião

Bloco composto para registrar reunião.

Campos:

- Participantes.
- Pauta.
- Decisões.
- Follow-ups.

Na primeira entrega, será um bloco customizado `operisMeeting` com propriedades para participantes e pauta, mais blocos filhos para decisões e follow-ups. O slash command "Reunião" insere esse bloco já preenchido com estrutura mínima.

### Checklist Executivo

Checklist focado em execução.

Campos:

- Itens com `checked`.
- Rótulo opcional do checklist.

Deve ser compatível com a contagem de progresso que hoje lê `- [ ]` e `- [x]`.

### Tarefa Vinculada

Bloco que aponta para uma tarefa existente ou prepara criação futura.

Campos:

- `taskId` opcional.
- Título da tarefa.
- Status exibido quando existir vínculo.

A primeira entrega vincula tarefas existentes. Criação de tarefa a partir do bloco fica fora do escopo inicial.

---

## Comandos e Templates

Os comandos atuais devem continuar existindo, agora como comandos BlockNote:

- Checklist.
- Tabela.
- Decisão.
- Retro.
- Data.
- Templates.
- Detalhes.
- Salvar.

Adicionar comandos Operis:

- Decisão executiva.
- Próximo passo.
- Risco.
- Insight.
- Reunião.
- Checklist executivo.
- Tarefa vinculada.

Templates existentes devem ser migrados para arrays de blocos. Templates personalizados antigos salvos em texto continuam funcionando: ao aplicar, passam por `legacyContentToBlocks`.

---

## Serializadores

Todas as integrações devem passar por uma camada única:

```ts
serializeNoteBlocks(blocks): {
  text: string;
  html: string;
  markdown: string;
  whatsapp: string;
}
```

Uso esperado:

- `text`: busca, contagem, notas relacionadas, IA de canvas.
- `html`: preview, impressão e PDF.
- `markdown`: templates, exportação técnica e interoperabilidade.
- `whatsapp`: cópia formatada para WhatsApp.

Nenhuma integração nova deve ler diretamente a estrutura interna do BlockNote fora desse módulo.

---

## Canvas e IA

Diagrama e mapa mental continuam como abas separadas. A geração por IA passa a usar `contentText`, derivado dos blocos.

Regras:

- Se `contentBlocks` existir, gerar texto via serializador.
- Se só existir `content`, usar extração legada.
- Manter limite mínimo de texto antes de gerar.
- Preserve comportamento de sobrescrever diagrama/mapa existente com confirmação.

Lousa não depende do texto da nota e permanece inalterada.

---

## Histórico e Restauração

Revisões devem capturar os blocos nativos e os derivados. Restauração deve recuperar:

- Título.
- Blocos.
- Texto derivado.
- HTML derivado.
- Tipo.
- Tags.
- Fixação.
- Pasta.
- Vínculos com workspace/projeto/tarefa.

Se uma revisão antiga não tiver `contentBlocks`, a restauração usa `content` legado e converte para blocos no próximo salvamento.

---

## UX

A aba Texto deve ter uma sensação mais calma e poderosa:

- Área de escrita limpa.
- Toolbar discreta.
- Slash menu contextual.
- Blocos Operis visualmente distintos, mas sem poluir.
- Botões de exportação e ações existentes preservados.
- Metadados da nota continuam recolhíveis.
- Modo foco/tela cheia continua funcionando.

Os blocos executivos devem usar linguagem do produto, por exemplo:

- "Decisão"
- "Próximo passo"
- "Risco"
- "Insight"
- "Reunião"
- "Checklist executivo"
- "Tarefa vinculada"

---

## Compatibilidade e Riscos

### Licença

`@blocknote/react` usa MPL-2.0. A implementação deve evitar pacotes opcionais com licença GPL, como variantes XL, salvo decisão explícita futura.

### Risco de migração

Conversão de HTML/texto legado para blocos pode perder detalhes finos. Mitigação: manter `content` e `contentHtml` durante transição, além de criar revisão antes da primeira gravação migrada se necessário.

### Risco de acoplamento

BlockNote não deve vazar para toda a página de notas. O acoplamento fica limitado ao módulo `features/notes/editor`.

### Risco de regressão

Exportações, IA e busca podem quebrar se cada uma serializar blocos de forma diferente. Mitigação: serializador único e testes focados.

---

## Testes

### Backend

- Criar nota com `contentBlocks`.
- Atualizar nota com blocos e derivados.
- Buscar por termo presente em `contentText`.
- Criar revisão com blocos.
- Restaurar revisão nativa.
- Restaurar revisão legada.

### Frontend

- Abrir nota legada e converter para blocos.
- Editar e autosalvar nota nativa.
- Inserir blocos Operis por slash command.
- Aplicar templates existentes.
- Exportar TXT, PDF e WhatsApp.
- Gerar diagrama a partir de `contentText`.
- Gerar mapa mental a partir de `contentText`.
- Alternar entre Texto, Diagrama, Mapa Mental e Lousa sem perder estado.

### Verificação visual

- Testar viewport desktop e mobile.
- Validar que blocos customizados não quebram layout.
- Validar tela cheia.
- Validar menus flutuantes e seleção de texto.

---

## Fora do Escopo Inicial

- Colaboração em tempo real.
- Comentários inline.
- Criação automática de tarefas a partir de blocos.
- Permissões por bloco.
- Remoção definitiva do campo `content`.
- Migração em massa no backend sem abertura da nota.

Esses itens podem vir depois que o editor nativo estiver estável.

---

## Critérios de Aceite

- O usuário consegue escrever notas com BlockNote nativo.
- Notas antigas continuam abrindo.
- Ao salvar uma nota, `contentBlocks`, `contentText` e `contentHtml` são persistidos.
- Autosave, salvar manualmente e histórico continuam funcionando.
- Os blocos Operis aparecem no slash menu e podem ser editados.
- Busca encontra conteúdo de notas nativas.
- Exportações TXT, PDF e WhatsApp funcionam com blocos comuns e blocos Operis.
- Diagrama e mapa mental continuam sendo gerados a partir do texto da nota.
- Diagrama, mapa mental e lousa continuam funcionando em suas abas.
- A página de notas fica menos acoplada ao editor textual.
