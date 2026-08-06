# Operis — Agenda como estúdio de tempo

**Data:** 2026-08-06

**Status:** Design aprovado em conversa; aguardando revisão deste documento

**Direção:** planejamento semanal completo, com tarefas e compromissos no mesmo calendário

**Escopo:** segunda etapa da reestruturação profunda de UI/UX do Operis

## 1. Objetivo

Transformar a Agenda de um cadastro de compromissos com uma grade pouco utilizada em uma superfície real de planejamento semanal.

A nova Agenda deve permitir:

1. enxergar compromissos, tarefas complexas e itens rápidos no mesmo horizonte temporal;
2. distribuir o trabalho da semana por arrastar, soltar e redimensionar;
3. planejar completamente tanto no desktop quanto no celular;
4. manter Hoje como a lente de execução do dia, sem criar um segundo planejamento;
5. distinguir intenção diária, horário planejado e execução real sem inventar dados;
6. preservar a diferença entre captura rápida e tarefa complexa.

O princípio central é: **um único planejamento, duas lentes**.

- **Agenda:** como o tempo será distribuído ao longo da semana.
- **Hoje:** o que será executado agora e em seguida.
- **Inbox:** o que surgiu e ainda precisa ser decidido.

## 2. Relação com a especificação Inbox/Hoje

Este documento complementa `2026-08-05-inbox-hoje-unificado-design.md` e substitui as partes em que o modo Planejar era tratado apenas como uma superfície diária isolada.

As duas experiências compartilham as mesmas entidades:

- `DailyExecutionItem` representa algo escolhido para um dia, ainda que sem horário;
- `DayPlanItem` representa um bloco planejado com início e fim;
- compromissos continuam sendo expandidos a partir de `Commitment` e suas exceções;
- uma execução real só existe quando há início e fim observáveis.

Agendar no Hoje altera a Agenda. Alterar na Agenda altera o Hoje. Não existem cópias ou sincronização eventual entre dois planejamentos distintos.

## 3. Diagnóstico do estado atual

A Agenda atual foi auditada em produção no desktop e no celular, nas visões semanal, lista e no formulário de criação.

### 3.1 Desktop

- O cabeçalho repete título, contadores, intervalo, total de horas, modos e ação principal dentro de um card alto.
- A grade de sete dias possui muito espaço vazio e pouca informação para apoiar decisões.
- Não existe uma fonte de tarefas ao lado do calendário; a tela apenas exibe compromissos.
- A largura útil é reduzida pela combinação de sidebar, margens, contêiner e sete colunas equivalentes.
- Blocos pequenos concentram título, horário e duração com contraste insuficiente.
- A visão de lista transforma recorrentes e pontuais em dois grandes cards de administração.

### 3.2 Celular

- A semana é convertida em sete cards verticais, criando uma rolagem longa para pouca informação.
- O cabeçalho quebra em várias linhas e mantém controles de desktop.
- A visão móvel não oferece linha do tempo nem planejamento real.
- O formulário modal pode ficar comprimido e desconectado da largura disponível.
- O botão flutuante, a navegação inferior e os botões de adicionar por dia competem entre si.

### 3.3 Problema de produto

A Agenda atual administra compromissos, enquanto Hoje administra tarefas planejadas. Isso divide uma mesma pergunta — “onde cabe meu trabalho?” — entre superfícies que não parecem conversar.

## 4. Decisões aprovadas

As decisões abaixo foram validadas uma a uma:

1. **A Agenda é um planejador semanal completo.** Tarefas e compromissos disputam o mesmo tempo.
2. **O celular também permite planejar.** Não será somente uma visão de consulta.
3. **Desktop no formato estúdio de tempo.** Fila de tarefas à esquerda e grade semanal à direita.
4. **Celular mostra um dia por vez.** Faixa semanal no topo, linha do tempo central e gaveta de tarefas.
5. **Item rápido não é convertido.** Agendá-lo preserva sua natureza de captura rápida.
6. **Tarefa complexa pode ter várias sessões.** Uma estimativa de seis horas pode ser dividida em blocos em dias diferentes.
7. **Concluir uma sessão não conclui automaticamente a tarefa.** A tarefa possui conclusão explícita própria.
8. **Escolher para Hoje não significa agendar.** Itens sem horário permanecem na faixa `Para hoje`.
9. **Sem horário, sem duração inventada.** Marcar algo como concluído sem iniciar uma sessão registra apenas o instante de conclusão.
10. **Hoje e Agenda leem e escrevem o mesmo plano.** Hoje é a lente diária; Agenda é a lente semanal.
11. **O sol deixa de ser um comando misterioso.** A ação passa a se chamar `Fazer hoje`.
12. **A administração de recorrências vira Rotinas.** Não compete com o calendário como visão principal.

## 5. Referências visuais

### 5.1 Sunsama — tarefa e calendário no mesmo fluxo

![Sunsama — planejamento ao lado do calendário](assets/2026-08-05-operis-inbox-hoje/referencia-sunsama-planejamento.png)

Decisões extraídas:

- fonte de tarefas junto do calendário;
- planejamento por arrastar para um horário;
- separação clara entre organizar e executar;
- sensação de calma mesmo com muita informação.

O Operis não copiará as colunas diárias do Sunsama como estrutura principal, pois elas enfraquecem a leitura espacial dos horários.

### 5.2 Notion Calendar — grade limpa e edição direta

![Notion Calendar — superfície especializada de calendário](assets/2026-08-05-operis-inbox-hoje/referencia-notion-calendar-interface.png)

Decisões extraídas:

- pouco chrome ao redor da grade;
- comandos próximos do objeto alterado;
- calendário como superfície contínua;
- integração entre tempo e trabalho sem cards decorativos.

O Operis não copiará a identidade do Notion nem dependerá de integrações externas nesta etapa.

### 5.3 Things — clareza móvel

![Things — eventos e tarefas no Hoje móvel](assets/2026-08-05-operis-inbox-hoje/referencia-things-today-mobile.png)

Decisões extraídas:

- eventos compactos;
- tarefas legíveis sem contêineres pesados;
- ações secundárias progressivas;
- um dia por vez no celular.

O Operis acrescentará planejamento temporal completo, que não é o papel principal dessa tela do Things.

### 5.4 Morgen — backlog e semana

Referência oficial: <https://www.morgen.so/>

Decisões extraídas:

- tarefas não planejadas permanecem visíveis ao lado da semana;
- tarefas importantes precisam ocupar espaço real no calendário;
- o calendário diferencia intenção, evento e bloco de trabalho;
- a semana é a unidade principal de capacidade.

## 6. Arquitetura da experiência

### 6.1 Desktop

```text
┌──────────────────────────────────────────────────────────────┐
│ Agosto  ‹  3–9 ago  ›   Hoje       Semana ▾    + Criar       │
├──────────────────┬───────────────────────────────────────────┤
│ PARA PLANEJAR    │ SEG │ TER │ QUA │ QUI │ SEX │ SÁB │ DOM │
│ Busca e filtros  ├───────────────────────────────────────────┤
│                  │ Para hoje · itens sem horário             │
│ • Tarefa A  45m  ├───────────────────────────────────────────┤
│ • Tarefa B   2h  │                                           │
│ • Item rápido    │        grade horária semanal              │
│                  │                                           │
│ + Nova tarefa    │  compromissos + tarefas + itens rápidos   │
└──────────────────┴───────────────────────────────────────────┘
```

- A fila `Para planejar` ocupa aproximadamente 280 px e pode ser recolhida.
- A grade semanal é a superfície dominante.
- Sábado e domingo permanecem visíveis, mas podem usar colunas mais estreitas.
- A faixa sem horário fica entre os cabeçalhos dos dias e a grade.
- O cabeçalho da página vira uma toolbar simples, sem card envolvente.
- A navegação global pode ser recolhida para maximizar a semana, mas mantém seu comportamento consistente com o restante do app.

### 6.2 Celular

```text
┌──────────────────────────┐
│ ‹  Agosto       Hoje  +  │
│ S  T  Q  Q  S  S  D      │
│ 3  4  5 [6] 7  8  9      │
├──────────────────────────┤
│ Para hoje · 3            │
├──────────────────────────┤
│ 08:00                    │
│ 09:00 ┌ Academia ──────┐ │
│ 10:00 └────────────────┘ │
│                          │
│ 11:00 ┌ Gravar vídeo ──┐ │
│       │ tarefa · 90min  │ │
│ 12:30 └────────────────┘ │
│                          │
├──────────────────────────┤
│     6 tarefas sem horário│
└──────────────────────────┘
```

- A faixa semanal troca o dia selecionado por toque ou gesto horizontal.
- Indicadores discretos mostram carga leve, equilibrada ou excessiva por dia.
- A linha do tempo mostra somente um dia e ocupa a maior parte da tela.
- A gaveta inferior lista tarefas e itens rápidos ainda não planejados.
- Arrastar da gaveta para a linha do tempo agenda o item.
- Pressionar e segurar um bloco permite mover e redimensionar.
- Todo gesto possui alternativa por toque e menu.
- O botão `+` abre uma folha inferior com `Tarefa` e `Compromisso`.

## 7. Um planejamento, três estados temporais

### 7.1 Para hoje

`Fazer hoje` cria ou move um `DailyExecutionItem` para a data atual. O item ganha intenção de dia, mas não ganha início, fim ou duração.

Na Agenda ele aparece na faixa sem horário da coluna correspondente. No Hoje ele aparece na fila de execução.

### 7.2 Agendado

Colocar um item na grade cria um `DayPlanItem` com início e fim. O bloco aparece no Hoje e na Agenda.

- tarefa complexa: pode possuir vários blocos;
- item rápido: pode possuir um bloco sem conversão em `Task`;
- remover o bloco não apaga nem conclui a origem.

Um item rápido sem estimativa recebe **15 minutos** quando é colocado diretamente num horário. O ajuste para 15, 30 ou 60 minutos fica disponível imediatamente após a soltura. Esse padrão só é aplicado ao agendar; escolher `Fazer hoje` nunca inventa horário ou duração.

### 7.3 Realizado

Uma execução real precisa de início e fim observáveis.

- `Iniciar` cria uma sessão real;
- `Concluir sessão` encerra essa sessão;
- concluir diretamente sem iniciar registra apenas `completedAt`;
- a interface nunca inventa um intervalo retroativo.

Uma tarefa concluída sem horário aparece em `Concluídas hoje`, fora da grade. Um bloco planejado concluído permanece no horário planejado, com estado visual concluído.

## 8. Regras por tipo de bloco

| Tipo | Origem | Pode dividir | Possui conclusão | Remover da grade |
|---|---|---:|---|---|
| Compromisso | `Commitment` | Não | Não como tarefa | cancela/remarca ocorrência ou série |
| Tarefa complexa | `Task` | Sim | sessão e tarefa são distintas | mantém a tarefa disponível |
| Item rápido | `InboxItem` | Não por padrão | conclui a captura | mantém o item no Inbox/Hoje |

Regras adicionais:

- agendar a mesma tarefa novamente cria outra sessão planejada;
- cada bloco mostra quanto da estimativa total já foi planejado;
- concluir um bloco de tarefa registra a sessão, não conclui a tarefa inteira;
- conflitos produzem aviso e opção de corrigir, mas não impedem o planejamento;
- compromissos recorrentes perguntam `Somente esta ocorrência` ou `Toda a série`;
- toda movimentação relevante oferece `Desfazer`.

## 9. Modelo de dados

### 9.1 Extensão de `DayPlanItem`

O modelo atual permite apenas `taskId` e remove blocos pendentes duplicados da mesma tarefa. Isso conflita com duas decisões aprovadas: agendar itens rápidos e dividir tarefas em várias sessões.

A implementação deve:

- adicionar `inboxItemId` opcional;
- incluir a origem `inboxItem` nas consultas;
- validar que no máximo uma origem estruturada esteja ligada ao bloco;
- remover a limpeza automática de blocos pendentes duplicados por `taskId`;
- permitir vários `DayPlanItem` da mesma tarefa;
- preservar blocos `fixed` sem origem quando usados pelo mecanismo legado;
- adicionar `completedAt` ao bloco para concluir uma sessão sem concluir a tarefa.

Esboço conceitual:

```prisma
model DayPlanItem {
  id                String            @id @default(uuid())
  dayPlanId         String            @map("day_plan_id")
  taskId            String?
  inboxItemId       String?           @map("inbox_item_id")
  startTime         DateTime          @map("start_time")
  endTime           DateTime          @map("end_time")
  completedAt       DateTime?         @map("completed_at")
  orderIndex        Int               @default(0) @map("order_index")
  blockType         BlockType         @map("block_type")
  confirmationState ConfirmationState @default(pending) @map("confirmation_state")

  dayPlan  DayPlan   @relation(fields: [dayPlanId], references: [id], onDelete: Cascade)
  task     Task?     @relation(fields: [taskId], references: [id], onDelete: SetNull)
  inboxItem InboxItem? @relation(fields: [inboxItemId], references: [id], onDelete: SetNull)

  @@index([dayPlanId, startTime])
  @@index([taskId])
  @@index([inboxItemId])
}
```

O serviço deve validar XOR entre `taskId` e `inboxItemId` quando `blockType = task`, permitindo ausência de ambos somente para compatibilidade com blocos fixos legados.

### 9.2 Sessões reais

Para registrar início e fim reais sem sobrescrever horários planejados, será criada uma entidade separada:

```prisma
model ExecutionSession {
  id                   String   @id @default(uuid())
  clerkUserId          String   @map("clerk_user_id")
  dayPlanItemId        String?  @map("day_plan_item_id")
  dailyExecutionItemId String?  @map("daily_execution_item_id")
  taskId               String?
  inboxItemId          String?  @map("inbox_item_id")
  startedAt            DateTime @map("started_at")
  endedAt              DateTime? @map("ended_at")
  createdAt            DateTime @default(now()) @map("created_at")

  @@index([clerkUserId, startedAt])
  @@index([dayPlanItemId])
  @@index([taskId])
  @@index([inboxItemId])
}
```

O serviço valida que a sessão possui uma origem válida e pertence ao usuário autenticado. Apenas uma sessão aberta por usuário é permitida.

## 10. API e sincronização

- Criar endpoint semanal que retorne, numa chamada coerente, planos dos sete dias, compromissos expandidos e itens sem horário.
- Manter endpoints diários atuais para Hoje e compatibilidade.
- Criar e atualizar blocos com `taskId` ou `inboxItemId`.
- Permitir mover um bloco entre dias sem sequência de apagar/criar visível ao usuário.
- Criar comandos para iniciar, encerrar e cancelar `ExecutionSession`.
- Usar atualização otimista no cliente, com rollback e `Desfazer`.
- Invalidar as consultas da Agenda e do Hoje após qualquer mutação compartilhada.
- Operações de mover, redimensionar e reordenar devem ser idempotentes.

## 11. Interações

### 11.1 Desktop

- arrastar tarefa ou item rápido para agendar;
- arrastar bloco para mudar dia ou horário;
- redimensionar a borda inferior para alterar duração;
- clicar num espaço vazio para criar no horário escolhido;
- clicar num bloco para abrir edição contextual;
- duplo clique ou atalho abre detalhes completos;
- `N` cria, `/` busca e setas navegam quando o foco está na grade;
- comandos de teclado equivalentes permitem mover e redimensionar sem mouse.

### 11.2 Celular

- arrastar da gaveta para a linha do tempo;
- pressão longa ativa movimentação de bloco;
- toque abre `Concluir`, `Editar`, `Mover`, `Remover do planejamento` e `Iniciar` quando aplicável;
- horários e duração também podem ser escolhidos em controles explícitos;
- a gaveta nunca cobre permanentemente o bloco em edição;
- a navegação inferior continua acessível.

## 12. Linguagem visual

- tema escuro preservado nesta etapa, com revisão de contraste;
- cabeçalho plano e compacto, sem card externo;
- grade contínua, linhas discretas e espaço morto reduzido;
- laranja somente para ação primária, seleção e horário atual;
- frentes aparecem como faixa lateral ou ponto, não como preenchimento completo;
- compromisso usa ícone de calendário e preenchimento sólido;
- tarefa usa checkbox e indicador de progresso planejado;
- item rápido usa raio e tratamento mais leve;
- capacidade aparece no cabeçalho do dia, sem card de métrica;
- menos caixa alta, legendas e bordas;
- animações entre 120 e 180 ms, respeitando `prefers-reduced-motion`;
- painel lateral no desktop e folha inferior no celular substituem modais para edições comuns.

## 13. Componentes propostos

| Componente | Responsabilidade |
|---|---|
| `WeeklyPlannerWorkspace` | Orquestrar semana, tarefas, compromissos e mutações |
| `PlannerToolbar` | Navegação temporal, visão, criação e Rotinas |
| `UnscheduledRail` | Tarefas e itens rápidos disponíveis para planejamento |
| `WeekTimeline` | Grade semanal do desktop |
| `MobileDayTimeline` | Linha do tempo de um dia no celular |
| `DayIntentLane` | Itens `Para hoje` sem horário |
| `PlannerBlock` | Representação acessível dos três tipos de bloco |
| `PlanningDrawer` | Gaveta móvel de itens sem horário |
| `BlockInspector` | Edição contextual sem modal pesado |
| `RoutineManager` | Administração secundária de recorrências |
| `ExecutionSessionController` | Iniciar e encerrar execução real |

O Hoje deve reutilizar `MobileDayTimeline`, `DayIntentLane`, `PlannerBlock` e o controlador de sessão, evitando duas implementações das mesmas regras.

## 14. Estados e falhas

- Falha em compromissos não bloqueia tarefas planejadas.
- Falha em itens sem horário não bloqueia a grade já carregada.
- Movimento otimista retorna à posição anterior se a API falhar.
- Conflitos são destacados nos blocos envolvidos e podem ser corrigidos pelo painel contextual.
- O estado vazio mostra a grade e uma instrução curta, não um card central gigante.
- A série recorrente nunca é alterada sem escolha explícita de escopo.
- Fechar painel ou gaveta não descarta mudanças já confirmadas.
- Excluir a origem é uma ação diferente de remover do calendário.

## 15. Acessibilidade

- Nenhuma informação depende apenas de cor.
- Todos os alvos de toque possuem ao menos 44 × 44 px.
- Arrastar possui alternativas por teclado, menu e seletores de data/hora.
- A grade tem nomes acessíveis para dia, início, fim, tipo e estado.
- Painéis e folhas controlam e restauram foco.
- Atalhos não são ativados dentro de campos de texto.
- Conflitos e falhas são anunciados em região de status.
- Redução de movimento é respeitada.

## 16. Verificação

### 16.1 Funcional

- item rápido entra em Hoje sem horário;
- item sem horário aparece na faixa do dia na Agenda;
- agendar item rápido não o converte em tarefa;
- a mesma alteração aparece em Hoje e Agenda;
- tarefa complexa aceita vários blocos em um ou mais dias;
- concluir bloco não conclui automaticamente a tarefa;
- iniciar e encerrar cria sessão real;
- concluir sem iniciar não cria intervalo fictício;
- mover entre dias preserva identidade e origem;
- recorrência altera somente ocorrência ou série conforme escolha;
- desfazer restaura movimento, duração e conclusão.

### 16.2 Visual e responsiva

- validar 1440×900, 1280×800, 1024×768, 768×1024, 390×844 e 360×800;
- validar semanas vazias, densas e com conflitos;
- validar blocos de 15 minutos até várias horas;
- validar títulos longos e várias sessões da mesma tarefa;
- não haver rolagem horizontal da página no celular;
- gaveta e navegação inferior não se sobreporem;
- formulário móvel usar a largura correta;
- os sete dias continuarem alcançáveis no desktop e celular.

### 16.3 Regressão

- Hoje unificado e revisão de pendências;
- conclusão e desfazer de `DailyExecutionItem`;
- agenda de compromissos recorrentes e exceções;
- filtros por frente;
- comandos de WhatsApp ligados ao plano diário;
- restrições de frente em standby/manutenção;
- autenticação e isolamento por usuário;
- jobs de início e fim de bloco.

## 17. Fora do escopo

- sincronização com Google Calendar, Apple Calendar ou Outlook;
- planejamento automático por IA;
- redesign completo de Tarefas, Projetos, Frentes ou Hábitos;
- substituição global da identidade visual;
- relatório avançado de horas realizado versus planejado;
- colaboração multiusuário no calendário.

## 18. Critérios de sucesso

O design será considerado bem-sucedido quando:

- o usuário distribuir tarefas e compromissos sem trocar de sistema mental;
- Hoje e Agenda parecerem duas lentes do mesmo planejamento;
- adicionar algo a Hoje não exigir inventar horário ou duração;
- tarefas complexas puderem ser divididas de forma natural;
- o celular permitir planejamento real sem miniaturizar a semana desktop;
- mais conteúdo útil couber na tela com menos cards e contornos;
- os horários exibidos representarem intenção ou execução observável, nunca suposição;
- as referências forem reconhecíveis nas decisões sem transformar o Operis numa cópia.
