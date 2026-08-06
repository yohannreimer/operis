# Frentes e Projetos — sistema de execução adaptativo

**Data:** 2026-08-06

**Status:** Aprovado pelo usuário

**Escopo:** redesign das páginas Frentes e Projetos, criação de Responsabilidades contínuas, shell comum de Projeto, motores metodológicos, próximos movimentos e recomendações explicáveis

**Direção visual aprovada:** Frentes em master-detail, Projetos em lista operacional agrupada e metodologia ocupando a área principal do Projeto

## 1. Contexto

O Operis já possui Frentes, Projetos, tarefas vinculadas, métricas, scorecards e diversos motores metodológicos. O problema central não é falta de funcionalidade, mas falta de uma arquitetura de uso coerente:

- Frentes são apresentadas como um portfólio de cards e filtros, sem deixar claro por que entrar em uma delas;
- Projetos aparecem como cards genéricos e não informam imediatamente o que precisa avançar;
- abrir um Projeto expõe muita configuração e variações metodológicas, mas pouca orientação operacional;
- metodologias parecem formulários diferentes, em vez de ferramentas diferentes para executar trabalhos diferentes;
- processos contínuos convivem com Projetos finitos, tornando o conceito de Projeto impreciso;
- a página `projetos.tsx` concentra mais de nove mil linhas e mistura shell, formulários, regras, motores e manutenção;
- um motor com dados incompletos consegue derrubar toda a rota de Projeto;
- o master-detail atual não se adapta naturalmente ao celular.

O redesign transforma Frentes e Projetos num sistema de execução adaptativo. Frentes representam áreas permanentes. Projetos representam mudanças finitas. Responsabilidades representam padrões que precisam ser cuidados continuamente. A metodologia define o motor operacional do Projeto, sem redefinir toda a experiência ao redor dele.

## 2. Decisões aprovadas

1. Uma **Frente** é uma área permanente da vida ou do negócio.
2. Todo Projeto deve pertencer a uma Frente.
3. Abrir Frentes serve para escolher uma área e entrar em sua operação.
4. Abrir Projetos serve para ver Projetos ativos agrupados por Frente e escolher o que avançar.
5. Frentes contêm Projetos, Responsabilidades contínuas e um resumo leve de saúde/capacidade.
6. Uma Responsabilidade é um compromisso permanente com cadência, estado e próximo cuidado.
7. Frentes usam master-detail no desktop e navegação lista → detalhe no celular.
8. O detalhe da Frente coloca o próximo cuidado antes de Projetos e Responsabilidades.
9. Projetos usam lista operacional agrupada por Frente, não grade de cards.
10. O Projeto usa um shell compacto comum, mas a metodologia ocupa a área principal da tela.
11. Tarefas do Projeto ficam num painel lateral no desktop e num painel de altura total no celular.
12. O próximo movimento permanece no cabeçalho e pode virar tarefa ou ser enviado para Hoje.
13. O usuário escolhe diretamente a metodologia pelo trabalho que quer realizar.
14. O catálogo principal terá sete intenções. Tipos especializados ficam em **Ver todos**.
15. A criação de Projeto usa três etapas: Direção, Método e Primeiro movimento.
16. Recomendações são determinísticas, explicáveis e nunca executam ações silenciosamente.
17. Processos recorrentes deixam de ser oferecidos como novos Projetos e passam a ser Responsabilidades.
18. Dados e metodologias legadas permanecem compatíveis e não sofrem migração destrutiva.

## 3. Objetivos

- Fazer Frentes responderem “qual área da minha vida ou negócio precisa de atenção?”.
- Fazer Projetos responderem “o que precisa avançar agora?”.
- Tornar cada metodologia útil durante a execução, e não apenas durante a criação.
- Dar destaque aos Projetos sem transformar a tela em um dashboard de cards.
- Separar mudanças finitas de compromissos permanentes.
- Conectar recomendações a tarefas e Hoje sem duplicar dados.
- Manter a experiência compreensível em desktop e celular.
- Isolar motores metodológicos para reduzir risco técnico e permitir evolução independente.

## 4. Não objetivos

- Remover ou converter automaticamente Projetos existentes.
- Renomear tabelas `Workspace` ou rotas `/workspaces` apenas para refletir o termo Frente.
- Substituir tarefas, Hábitos ou Agenda.
- Usar IA generativa para produzir recomendações livres.
- Criar automações que alterem prioridades, datas ou estados sem confirmação.
- Redesenhar profundamente os motores avançados neste primeiro bloco; eles recebem o novo shell e compatibilidade.
- Refazer Dashboard, Hoje, Agenda, Notas ou Hábitos além das integrações necessárias.
- Criar colaboração multiusuário, permissões por Frente ou atribuição de responsáveis.

## 5. Modelo conceitual

### 5.1 Frente

Área permanente que agrupa o trabalho relacionado. Não possui conclusão.

Exemplos:

- Prymeira Digital
- Yohann empresário
- Vida pessoal

Uma Frente contém:

- Projetos ativos, pausados e encerrados;
- Responsabilidades contínuas;
- tarefas e notas já vinculadas pelo modelo atual;
- leitura agregada de atenção, atividade e capacidade.

### 5.2 Projeto

Mudança finita com resultado esperado, método de execução e condição de encerramento. Um Projeto deve possuir:

- Frente;
- título;
- resultado ou direção;
- metodologia;
- estado;
- próximo movimento inicial;
- prazo quando a metodologia exigir.

### 5.3 Responsabilidade contínua

Padrão permanente que precisa ser revisto e cuidado, mas não concluído.

Exemplos:

- Saúde financeira da empresa
- Qualidade das entregas aos clientes
- Manutenção da marca

Uma Responsabilidade possui padrão esperado, cadência, estado de saúde, próximo cuidado e histórico de revisões.

### 5.4 Tarefa e Hábito

- **Tarefa:** ação concreta que termina.
- **Hábito:** comportamento repetido cuja prática é registrada.
- **Responsabilidade:** área que permanece saudável por meio de revisões e ações.
- **Projeto:** mudança finita produzida por um conjunto de movimentos.

## 6. Arquitetura de navegação

### 6.1 Frentes no desktop

A rota `/frentes` usa master-detail:

- trilho estreito de Frentes à esquerda;
- prévia operacional da Frente ativa à direita;
- seleção inicial preserva a última Frente visitada quando ainda existir;
- na ausência de preferência, usa a primeira Frente com atenção; depois, a primeira Frente disponível;
- URL deve refletir a seleção por parâmetro ou sub-rota para permitir recarregar e compartilhar o estado.

O trilho apresenta nome, quantidade de Projetos ativos e um único indicador de atenção quando necessário. Não usar um card completo por Frente.

### 6.2 Detalhe da Frente

Ordem do conteúdo:

1. nome, modo e ações da Frente;
2. próximo cuidado ou principal sinal de atenção;
3. Projetos em movimento;
4. Responsabilidades contínuas;
5. resumo secundário de saúde e capacidade;
6. Projetos pausados/encerrados sob demanda.

Não haverá cards de “Navegação interna” e “Portfólio”, nem abas duplicando rotas globais.

Saúde da Frente é a maior severidade encontrada entre Projetos e Responsabilidades: normal, atenção ou crítico. Capacidade não recebe uma nota inventada; a primeira versão informa somente a carga observável, como quantidade de Projetos ativos e tarefas abertas em Hoje. O produto não rotula a Frente como “sobrecarregada” sem uma regra de capacidade validada.

### 6.3 Projetos no desktop

A rota `/projetos` usa uma lista operacional agrupada por Frente.

Cada linha apresenta:

- nome do Projeto;
- intenção e método, como `Vender · Pipeline`;
- próximo movimento atual ou sugestão;
- estado operacional;
- prazo ou principal indicador;
- seta para abrir.

Controles superiores permitidos:

- busca;
- estado;
- Frente;
- ação **Novo projeto**.

Filtros secundários não ocupam cards permanentes. Projetos concluídos e arquivados ficam fora da visão padrão.

### 6.4 Projeto

A rota `/projetos/:projectId` contém:

- breadcrumb compacto com Frente;
- título e intenção/metodologia;
- objetivo ou resultado;
- próximo movimento fixo no cabeçalho;
- prazo, progresso/fase e bloqueio quando aplicáveis;
- ação principal específica do motor;
- botão de Tarefas com contador;
- motor metodológico ocupando a área principal.

O motor não fica dentro de um card genérico. A página inteira é a ferramenta do método.

### 6.5 Celular

Frentes usam navegação em níveis:

```text
Lista de Frentes → Detalhe da Frente → Projeto
```

Regras:

- não comprimir master-detail;
- voltar preserva rolagem, seleção e filtros;
- detalhe da Frente usa a mesma ordem semântica do desktop;
- próximo movimento permanece próximo ao topo do Projeto;
- o motor ocupa a tela principal;
- Tarefas abre como painel de altura total, com retorno explícito ao motor;
- ações críticas permanecem rotuladas e têm área tocável adequada.

## 7. Catálogo de Projetos

### 7.1 Intenções principais

| Intenção exibida | Metodologia interna | Motor | Pergunta respondida |
| --- | --- | --- | --- |
| Atingir uma meta | `fourdx` | métrica/cadência | Estamos no ritmo para chegar à meta? |
| Entregar algo | `entrega` | marcos | Qual é o próximo marco concreto? |
| Vender | `pipeline` | pipeline | Qual oportunidade deve avançar? |
| Validar uma ideia | `exploracao` | experimentos/log | Que evidência falta para decidir? |
| Executar um lançamento | `campanha` | tempo/campanha | O que é crítico antes da janela? |
| Tomar uma decisão | `decisao` | matriz | O que falta avaliar para escolher? |
| Coordenar vários resultados | `okr` | KRs compostos | Qual resultado está mais fora do ritmo? |

A intenção é o título principal. O nome do método aparece como explicação e nunca depende de o usuário conhecer 4DX, OKR ou outro jargão.

### 7.2 Tipos avançados

Disponíveis em **Ver todos**:

- Captação
- Funil
- Runway
- Sistema de Receita
- Mentoria
- Autoridade
- Cenário

Esses tipos mantêm seus motores existentes e recebem o shell comum. O redesenho interno profundo pode acontecer em etapas posteriores.

### 7.3 Tipos legados

`delivery`, `launch`, `discovery` e `growth` continuam renderizáveis por adaptadores:

- `delivery` → shell de Entrega;
- `launch` → shell de Campanha;
- `discovery` e `growth` → shell de Exploração.

`processo` continua renderizável para Projetos existentes, mas não aparece no seletor de novos Projetos. A interface oferece transformar manualmente o processo em Responsabilidade numa etapa futura, sem exclusão automática.

## 8. Criação de Projeto

O fluxo usa uma superfície guiada de três etapas.

### 8.1 Etapa 1 — Direção

Campos comuns:

- intenção/metodologia escolhida;
- título;
- Frente obrigatória;
- resultado, objetivo ou pergunta central;
- prazo quando necessário.

O formulário usa linguagem do trabalho, não nomes internos de colunas.

### 8.2 Etapa 2 — Método

Campos variam por motor:

- 4DX: métrica, valor inicial, alvo, prazo e medidas de direção;
- Entrega: padrão de conclusão e marcos iniciais;
- Pipeline: estágios e meta opcional;
- Exploração: hipótese e critério de validação;
- Campanha: data crítica, fim da janela, meta e canal opcional;
- Decisão: opções e critérios;
- OKR: período e resultados-chave.

Campos podem ser editados depois. O passo impede avançar apenas quando faltar informação necessária para o motor funcionar.

### 8.3 Etapa 3 — Primeiro movimento

O usuário define ou confirma uma ação concreta. O Projeto não deve nascer com uma frase metodológica genérica como “gestão ativa do pipeline”.

O primeiro movimento pode:

- permanecer apenas no Projeto;
- virar tarefa no Backlog;
- virar tarefa em Hoje.

Ao concluir, o fluxo abre o Projeto recém-criado no motor correspondente.

### 8.4 Recuperação de rascunho

- fechar o fluxo pede confirmação apenas quando houver dados relevantes;
- o rascunho permanece localmente durante a sessão;
- falha de criação mantém os campos preenchidos;
- clique duplo no envio não cria Projetos duplicados.

## 9. Shell do Projeto

### 9.1 Cabeçalho comum

O cabeçalho contém somente contexto operacional:

- Frente;
- intenção e método;
- título;
- resultado/direção em uma linha curta;
- próximo movimento;
- progresso ou fase;
- prazo;
- bloqueio prioritário;
- Tarefas;
- menu de manutenção.

Não repetir essas informações dentro do motor.

### 9.2 Próximo movimento

O Projeto pode possuir um único próximo movimento ativo. Ele contém:

- texto;
- origem manual ou recomendação adotada;
- motivo opcional;
- tarefa vinculada opcional;
- data de criação;
- estado ativo ou resolvido.

Se estiver ligado a uma tarefa:

- enviar para Hoje altera/cria a tarefa com `status: hoje`;
- concluir a tarefa resolve o movimento;
- arquivar ou desvincular a tarefa não conclui silenciosamente o movimento;
- a interface permite escolher outro movimento e preserva o anterior no histórico.

### 9.3 Painel de tarefas

O painel lista tarefas abertas do Projeto por estado operacional. Permite:

- criar tarefa já vinculada à Frente e ao Projeto;
- mover para Hoje;
- concluir;
- abrir detalhes;
- identificar a tarefa que representa o próximo movimento.

O painel não reproduz toda a página Tarefas. Filtros avançados, dependências e manutenção completa continuam na rota dedicada.

### 9.4 Progresso e fase

Cada motor escolhe a representação correta:

- 4DX: valor atual versus meta e ritmo esperado;
- Entrega: marcos concluídos, com destaque para críticos;
- Pipeline: resultado fechado versus meta quando houver; caso contrário, distribuição por estágio;
- Exploração: fase de evidência e decisão, não porcentagem artificial;
- Campanha: preparação antes da data e resultado durante/depois da janela;
- Decisão: completude da matriz e decisão final, sem fingir avanço linear;
- OKR: progresso agregado dos KRs, acompanhado da confiança.

### 9.5 Estado operacional

O estado mostrado na lista é derivado, sem substituir automaticamente `Project.status`:

- `bloqueado` quando existe bloqueio crítico aberto;
- `em risco` quando existe atraso ou risco de prazo;
- `em movimento` para Projeto ativo sem sinal crítico;
- `parado` quando o Projeto ativo excedeu o limite de estagnação;
- `pausado`, `concluído` ou `arquivado` quando o estado persistido assim determina.

O read model retorna o estado persistido e o estado operacional derivado. Alterar um não muda silenciosamente o outro.

## 10. Responsabilidades contínuas

### 10.1 Campos

Uma Responsabilidade possui:

- Frente;
- título;
- padrão esperado;
- cadência de revisão;
- próxima revisão;
- estado `saudável`, `atenção` ou `crítico`;
- próximo cuidado;
- estado operacional `ativa`, `pausada` ou `arquivada`;
- datas de última revisão e atualização.

### 10.2 Pulso de cuidado

**Cuidar agora** abre uma revisão curta com:

- estado atual;
- observação opcional;
- próximo cuidado;
- data da próxima revisão calculada pela cadência e editável.

Ao salvar:

- cria uma entrada imutável no histórico;
- atualiza o snapshot atual da Responsabilidade;
- recalcula a próxima revisão;
- permite criar uma tarefa no Backlog ou em Hoje.

### 10.3 Sinais na Frente

Uma Responsabilidade entra em atenção quando:

- está em estado `atenção` ou `crítico`;
- a revisão está vencida;
- não possui próximo cuidado;
- ficou sem revisão além da tolerância definida pela cadência.

O principal sinal da Frente considera Responsabilidades e Projetos, escolhendo apenas o item mais prioritário para o topo.

### 10.4 Diferenças de comportamento

- Responsabilidade não tem progresso percentual.
- Responsabilidade não é marcada como concluída.
- Uma revisão não cria tarefa automaticamente.
- Pausar suspende alertas e preserva histórico.
- Arquivar remove da visão ativa e preserva histórico.

## 11. Recomendações explicáveis

### 11.1 Princípios

- regras determinísticas;
- mesma entrada produz a mesma recomendação;
- toda recomendação contém um motivo visível;
- nenhuma recomendação altera dados sozinha;
- no máximo uma recomendação principal por Projeto;
- a escolha explícita do usuário vence a recomendação;
- não usar linguagem de certeza quando a regra apenas indica risco.

### 11.2 Precedência global

1. bloqueio crítico aberto;
2. próximo movimento ativo;
3. item vencido;
4. estagnação;
5. risco de prazo;
6. sinal específico do motor;
7. configuração incompleta.

Quando existe movimento ativo, o sistema o mantém como direção principal. Uma recomendação diferente pode aparecer apenas como alerta secundário se houver bloqueio ou risco crítico.

### 11.3 Regras por motor principal

#### 4DX

- check-in vencido → atualizar placar;
- medida de direção abaixo da cadência → executar a medida mais atrasada;
- resultado abaixo do ritmo esperado → priorizar a medida com menor cumprimento recente;
- sem dados suficientes → completar primeiro check-in.

#### Entrega

- bloqueio crítico aberto → resolver ou esclarecer bloqueio;
- marco crítico vencido → retomar esse marco;
- nenhum marco iniciado → iniciar o primeiro marco ordenado;
- todos os marcos completos → validar padrão de conclusão.

#### Pipeline

- oportunidade estagnada → retomar a mais antiga, considerando valor como desempate;
- próxima ação registrada → executá-la antes de sugerir outra;
- estágio inicial vazio e meta ativa → adicionar/prospectar oportunidades;
- oportunidades fechadas sem resultado atualizado → registrar resultado.

#### Exploração

- sem critério de validação → defini-lo;
- sem evidência → executar o menor teste possível;
- evidências inconclusivas → definir experimento discriminante;
- critério atingido e sem decisão → seguir, pivotar ou descartar.

#### Campanha

- atividade crítica vencida → executá-la;
- data de lançamento próxima → priorizar o ativo obrigatório mais atrasado;
- janela aberta → acompanhar o indicador principal;
- janela encerrada e sem resultado → registrar e revisar resultado.

#### Decisão

- opção sem avaliação → avaliá-la;
- critério sem peso → definir importância;
- prazo próximo com matriz completa → tomar e registrar decisão;
- decisão registrada → definir primeira ação consequente.

#### OKR

- KR sem atualização → fazer check-in;
- KR com menor confiança → revisar risco e próxima iniciativa;
- KR mais abaixo do ritmo → avançar iniciativa vinculada;
- período encerrado → revisar e encerrar ciclo.

### 11.4 Regras mínimas dos tipos avançados

Os tipos avançados também recebem recomendações explicáveis, ainda que seu redesenho visual profundo não faça parte deste bloco:

- Captação reutiliza as regras de Pipeline, priorizando forecast ponderado e meta financeira;
- Funil recomenda atualizar a etapa mais antiga ou investigar a maior queda de conversão;
- Runway recomenda atualizar caixa/burn rate vencidos e sinaliza o evento confirmado mais próximo;
- Sistema de Receita reutiliza as regras de Pipeline linear e prioriza o próximo critério de estágio;
- Mentoria prioriza compromisso pendente ou preparação para a próxima sessão;
- Autoridade prioriza a próxima prova planejada ou atualização do placar;
- Cenário prioriza ação comum aos cenários ou variável sem atualização.

Projetos legados mapeados para Entrega, Campanha e Exploração usam as regras do motor de destino.

### 11.5 Ações da recomendação

- **Adotar:** cria um próximo movimento ativo sem tarefa.
- **Criar tarefa:** cria tarefa no Backlog e a vincula ao movimento.
- **Mandar para Hoje:** cria ou reutiliza a tarefa vinculada e a coloca em Hoje.

A operação usa chave de idempotência. Repetir a ação durante uma resposta lenta devolve o mesmo resultado.

## 12. Contratos de dados

Os nomes abaixo são propostos para o plano de implementação. Podem ser ajustados mantendo a semântica.

### 12.1 `ProjectNextMove`

Campos mínimos:

- `id`
- `projectId`
- `text`
- `source`: `manual` ou `recommendation`
- `reason` opcional
- `ruleKey` opcional
- `taskId` opcional
- `status`: `active` ou `resolved`
- `createdAt`
- `resolvedAt` opcional

Somente um movimento ativo é permitido por Projeto. A troca acontece em transação: resolve o atual e cria o novo.

### 12.2 `Responsibility`

Campos mínimos:

- `id`
- `workspaceId`
- `title`
- `expectedStandard`
- `cadence`
- `cadenceIntervalDays` opcional para personalização
- `health`
- `nextCare`
- `nextReviewAt`
- `lastReviewedAt`
- `status`
- timestamps e `archivedAt`

### 12.3 `ResponsibilityReview`

Campos mínimos:

- `id`
- `responsibilityId`
- `health`
- `note` opcional
- `nextCare`
- `nextReviewAt`
- `createdTaskId` opcional
- `reviewedAt`

O histórico é imutável; correções alteram o snapshot atual por uma nova revisão.

### 12.4 Dados metodológicos

`Project.methodologyData` continua existindo para compatibilidade. Cada motor deve possuir:

- schema Zod próprio;
- normalizador com defaults seguros;
- adaptador de legado;
- cálculo de progresso/fase;
- cálculo de recomendação;
- componente principal;
- formulário do assistente.

Dados desconhecidos são preservados durante updates. O cliente não deve substituir o objeto inteiro quando altera apenas um item.

## 13. API e read models

### 13.1 Visões de Frente

Read models propostos:

- `GET /workspaces/overview`
- `GET /workspaces/:workspaceId/overview`

Devem retornar somente dados necessários para trilho e detalhe, incluindo:

- contadores de Projetos por estado;
- principal sinal de atenção;
- Projetos em movimento com próximo movimento/resumo;
- Responsabilidades ativas;
- saúde/capacidade agregada quando disponível.

Todas as consultas aplicam `clerkUserId` no servidor.

### 13.2 Projeto

- manter `GET /projects` para listagem;
- adicionar/normalizar `GET /projects/:projectId` como read model do cockpit;
- incluir motor normalizado, próximo movimento, recomendação, tarefas resumidas, progresso/fase e bloqueio prioritário;
- manter rotas existentes de métricas e itens para compatibilidade.

Mutações propostas:

- `POST /projects/:projectId/next-moves`
- `POST /projects/:projectId/next-moves/:nextMoveId/to-today`
- `POST /projects/:projectId/next-moves/:nextMoveId/resolve`

### 13.3 Responsabilidades

- `GET /workspaces/:workspaceId/responsibilities`
- `POST /workspaces/:workspaceId/responsibilities`
- `PATCH /responsibilities/:responsibilityId`
- `POST /responsibilities/:responsibilityId/reviews`
- `GET /responsibilities/:responsibilityId/reviews`
- `POST /responsibilities/:responsibilityId/pause`
- `POST /responsibilities/:responsibilityId/archive`

Criar tarefa a partir da revisão e salvar a revisão deve ocorrer numa única operação transacional.

## 14. Arquitetura frontend

A página monolítica de Projetos deve ser desmembrada progressivamente, preservando comportamento durante a transição.

Estrutura conceitual:

```text
features/
  fronts/
    FrontsPage
    FrontRail
    FrontOverview
    ResponsibilitiesList
    ResponsibilityReviewPanel
  projects/
    ProjectsPage
    ProjectList
    ProjectShell
    ProjectHeader
    ProjectTasksPanel
    ProjectWizard
    engines/
      registry
      metric
      milestone
      pipeline
      exploration
      campaign
      decision
      okr
      legacy-adapters
```

O registro de motores expõe um contrato comum:

```ts
type ProjectEngineDefinition = {
  key: ProjectMethodology;
  intentLabel: string;
  methodLabel: string;
  normalize(data: unknown): NormalizedEngineData;
  getProgress(context: ProjectEngineContext): ProjectProgress;
  getRecommendation(context: ProjectEngineContext): ProjectRecommendation | null;
  WizardFields: ComponentType<ProjectWizardStepProps>;
  View: ComponentType<ProjectEngineViewProps>;
};
```

Regras de recomendação devem ser funções puras e compartilháveis com o servidor ou implementadas numa camada de domínio equivalente. O servidor é a fonte final do read model; o cliente pode prever mudanças otimistas sem redefinir as regras.

## 15. Estados de interface

### 15.1 Carregamento

- skeletons seguem a geometria final;
- trilho e detalhe podem carregar separadamente;
- ao trocar de Frente, o trilho permanece interativo;
- ao atualizar um item do motor, apenas a região afetada mostra progresso.

### 15.2 Vazio

- sem Frentes: explicar o conceito e oferecer criar a primeira Frente;
- Frente sem Projetos: oferecer Projeto ou Responsabilidade, explicando a diferença;
- Projetos sem movimento: destacar a recomendação ou solicitar definição;
- motor sem configuração: recuperação orientada, não tela quebrada;
- Responsabilidade sem revisão: oferecer primeiro pulso de cuidado.

### 15.3 Erro e recuperação

- falha no trilho não mostra dados de outro usuário ou cache incorreto;
- falha no detalhe preserva seleção e oferece tentar novamente;
- erro de um motor fica contido no painel do motor;
- dados metodológicos inválidos mostram campos recuperáveis e ação de reparar;
- falha ao criar tarefa não marca recomendação como adotada;
- falha parcial transacional não deixa movimento sem vínculo ou tarefa duplicada;
- Projeto ou Frente excluído em outra aba redireciona para a lista com mensagem clara.

## 16. Linguagem visual e interação

- manter a direção visual adulta, escura e silenciosa adotada nas telas anteriores;
- usar `lucide-react` para ícones do sistema, sem emojis ou glyphs improvisados;
- usar laranja apenas para ação, seleção e atenção operacional;
- evitar bordas laranja completas, gradientes decorativos e coleção de cards;
- usar linhas, alinhamento e tipografia para hierarquia;
- preservar densidade suficiente para leitura operacional;
- não repetir título, subtítulo e contexto em múltiplos contêineres;
- animações são curtas e funcionais, respeitando `prefers-reduced-motion`;
- tooltips nunca carregam informação necessária à decisão.

## 17. Acessibilidade

- navegação completa por teclado no trilho, listas, wizard e painéis;
- foco retorna ao disparador ao fechar painel/modal;
- seleção de Frente e estados de Projeto usam texto além de cor;
- alvos de toque têm ao menos 44 × 44 px ou área equivalente;
- listas e pipelines possuem nomes acessíveis e ordem lógica;
- movimentação de itens por arraste tem alternativa por teclado/menu;
- mensagens de erro são associadas aos campos;
- alterações otimistas e salvamentos importantes são anunciados em região viva;
- contraste respeita WCAG AA para texto e controles essenciais.

## 18. Migração e compatibilidade

1. adicionar novas entidades sem alterar Projetos existentes;
2. criar adaptadores antes de trocar a rota de detalhe;
3. manter enum `processo` e tipos legados enquanto houver registros;
4. ocultar `processo` somente do novo seletor;
5. gerar read models com defaults seguros para `methodologyData` ausente;
6. lançar o novo shell por trás de flag local/configurável durante a migração;
7. validar contagens e relações em ambiente de desenvolvimento antes de remover caminhos antigos;
8. não executar migração automática de Processo para Responsabilidade.

## 19. Testes e critérios de aceite

### 19.1 Domínio

- precedência global das recomendações;
- regras de cada um dos sete motores principais;
- progresso/fase de cada motor;
- normalização de dados vazios, parciais e legados;
- somente um próximo movimento ativo;
- cálculo de próxima revisão por cadência;
- seleção do principal sinal da Frente.

### 19.2 API

- propriedade por `clerkUserId` em todas as leituras e mutações;
- Projeto não pode ser criado sem Frente válida;
- criação idempotente de tarefa/movimento;
- conclusão da tarefa resolve o movimento correspondente;
- revisão de Responsabilidade e criação de tarefa são atômicas;
- arquivamento preserva histórico;
- payload metodológico inválido retorna erro de domínio, sem erro 500 genérico;
- read models não retornam itens arquivados por padrão.

### 19.3 Componentes

- seleção e restauração de Frente;
- filtros da lista de Projetos;
- três etapas do wizard e validação por motor;
- painel de tarefas no desktop e celular;
- adotar, criar tarefa e mandar para Hoje;
- revisão de Responsabilidade;
- estados vazio, carregando, erro e recuperação por motor;
- foco, Escape e retorno de foco.

### 19.4 Navegador

Fluxos mínimos em desktop e larguras mobile de 390 px e 360 px:

1. abrir Frentes, trocar Frente e abrir Projeto;
2. criar Projeto nos sete tipos principais;
3. operar ao menos uma ação de cada motor;
4. adotar recomendação e mandar para Hoje;
5. concluir a tarefa e observar novo estado do movimento;
6. criar, revisar, pausar e arquivar Responsabilidade;
7. abrir Projeto legado com dados incompletos sem tela branca;
8. voltar no celular preservando contexto;
9. recarregar diretamente uma rota de Projeto;
10. simular erro de API e recuperar sem perder formulário.

## 20. Critério de conclusão

O redesign estará concluído quando:

- Frentes e Projetos seguirem a arquitetura aprovada em desktop e celular;
- Projetos ativos forem compreensíveis sem abrir menus ou cards auxiliares;
- cada Projeto possuir motor isolado e próximo movimento utilizável;
- os sete motores principais abrirem, operarem e recomendarem sem falhas;
- Responsabilidades contínuas estiverem integradas à Frente;
- ações para Tarefas e Hoje forem idempotentes e consistentes;
- Projetos legados abrirem sem perda de dados;
- nenhuma falha de um motor derrubar o shell;
- testes de API, frontend, typecheck e build passarem;
- os fluxos críticos forem verificados visualmente em desktop, 390 px e 360 px.
