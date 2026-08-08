# Tarefas: backlog operacional de trabalho complexo

**Data:** 2026-08-08

**Status:** aprovado pelo usuário em conversa

**Escopo:** redesign da rota `/tarefas`, criação progressiva, backlog agrupado, visões acionáveis, painel de detalhe, comportamento responsivo e reorganização técnica do frontend

**Direção aprovada:** lista única e densa, organizada por movimento, com painel lateral no desktop e detalhe em tela cheia no celular

## 1. Contexto

O Operis distingue dois tipos de trabalho:

- capturas rápidas, que pertencem ao Inbox e à execução de Hoje;
- tarefas complexas, que possuem contexto, resultado esperado, etapas, prazo, projeto, bloqueios ou acompanhamento.

A rota atual de Tarefas preserva muitas capacidades importantes, mas apresenta todas elas numa superfície pesada. `apps/web/src/pages/tarefas.tsx` possui aproximadamente 2.395 linhas e mistura carregamento, filtros, criação, análise, gráficos, acompanhamento externo, subtarefas, restrições, propriedades e quatro abas de detalhe. `apps/web/src/components/task-intelligence-table.tsx` adiciona aproximadamente 1.217 linhas e cria um segundo modo de visualização com vocabulário próprio.

O resultado é uma tela funcional, porém semelhante a um painel administrativo. Lista, tabela, métricas, gráficos e modais competem pela mesma pergunta. A aba não responde rapidamente: “quais trabalhos complexos existem e qual deles precisa de uma decisão agora?”.

O redesign transforma Tarefas no backlog operacional de todo trabalho complexo. Hoje continua sendo a lente diária de execução. Agenda continua sendo a lente temporal. Projetos continuam organizando uma mudança finita. Tarefas passa a ser o lugar para organizar, estruturar e acompanhar unidades complexas de trabalho.

## 2. Decisões aprovadas

1. Tarefas contém somente tarefas complexas. Capturas rápidas permanecem no Inbox e em Hoje.
2. A função principal da rota é organizar o backlog complexo, não executar o dia nem exibir análises decorativas.
3. A lista padrão é agrupada por movimento: Em andamento, Próximas, Aguardando e Futuro.
4. Hoje é uma marca de planejamento independente. Planejar uma tarefa para Hoje não altera seu estado operacional.
5. Criar uma tarefa exige somente título. Frente, projeto e prazo são opcionais no primeiro momento.
6. O desktop usa lista com painel lateral. A lista permanece visível enquanto a tarefa é revisada ou editada.
7. O celular abre o detalhe em tela cheia e restaura a posição da lista ao voltar.
8. Gráficos e cartões de métricas deixam a rota. A inteligência aparece como visões acionáveis.
9. As visões acionáveis iniciais são Aguardando, Bloqueadas, Atrasadas e Sem próximo passo.
10. O painel começa por definição de pronto, próximo passo, progresso e bloqueio. Propriedades administrativas ficam compactas.
11. Existe uma única lista densa e adaptável. Não haverá alternância entre lista e tabela.
12. Subtarefas, restrições, dependências externas, acompanhamento, multibloco e histórico permanecem disponíveis por profundidade progressiva.
13. Arrastar é um atalho, nunca a única forma de mover uma tarefa.
14. Busca, filtros, seleção, grupos e retorno mobile preservam contexto.

## 3. Objetivos

- Fazer a rota responder em segundos o que está em movimento, o que vem depois e o que precisa de decisão.
- Separar estado operacional de planejamento diário e agendamento.
- Reduzir a carga visual sem remover capacidades de tarefas complexas.
- Tornar criação e organização rápidas, deixando estrutura profunda para depois da captura.
- Preservar contexto ao alternar entre backlog e detalhe.
- Substituir gráficos passivos por filas de decisão acionáveis.
- Unificar o vocabulário visual com Hoje, Agenda, Projetos, Frentes e Notas.
- Decompor o frontend atual em unidades menores e testáveis.

## 4. Não objetivos

- Transformar capturas rápidas em `Task` automaticamente.
- Substituir Hoje como espaço de execução diária.
- Substituir Agenda como espaço de planejamento temporal.
- Substituir Projetos como estrutura de resultados finitos.
- Criar colaboração, responsáveis multiusuário ou permissões por tarefa.
- Adicionar IA generativa para ordenar ou alterar tarefas sem confirmação.
- Remover dados ou recursos atuais de subtarefas, restrições, dependências, histórico ou multibloco.
- Manter os gráficos atuais apenas porque os dados já existem.
- Fazer uma migração destrutiva de tarefas com status legado `hoje`.

## 5. Modelo conceitual

### 5.1 Captura rápida

Pendência curta que pode ser registrada e concluída sem estrutura adicional. Continua representada por `InboxItem` e pode ser alocada em Hoje sem virar tarefa complexa.

### 5.2 Tarefa complexa

Unidade de trabalho que termina, mas pode exigir um ou mais dos seguintes elementos:

- definição de pronto;
- próximo passo;
- etapas;
- Frente ou Projeto;
- prazo ou estimativa;
- restrição;
- dependência externa;
- várias sessões de execução.

### 5.3 Estado operacional

Descreve o movimento real da tarefa, independentemente de sua presença em Hoje ou na Agenda.

| Grupo exibido | Regra conceitual |
| --- | --- |
| Em andamento | trabalho iniciado e ainda não concluído |
| Próximas | backlog ativo, pronto ou quase pronto para avançar |
| Aguardando | depende de uma pessoa, entrega ou evento externo |
| Futuro | trabalho válido fora do horizonte ativo |

Concluídas e arquivadas ficam fora do fluxo padrão e são acessadas por filtro.

A projeção usa a seguinte precedência para impedir que uma tarefa apareça em dois grupos:

1. tarefas concluídas ou arquivadas ficam fora do backlog padrão;
2. dependência externa ativa coloca a tarefa em Aguardando sem apagar seu status subjacente;
3. `horizon = future` coloca a tarefa em Futuro;
4. `status = andamento` coloca a tarefa em Em andamento;
5. `status = backlog` ou o legado `status = hoje` coloca a tarefa em Próximas.

Arrastar para Aguardando preenche a dependência externa e preserva `backlog` ou `andamento`. Resolver a dependência limpa os campos de espera e revela novamente o grupo subjacente, sem precisar armazenar um estado anterior separado.

### 5.4 Planejamento diário e temporal

`Hoje` não é um estado operacional. É uma alocação diária representada pelo modelo de execução aprovado em `2026-08-05-inbox-hoje-unificado-design.md`.

- planejar para Hoje cria ou preserva um `DailyExecutionItem` de origem `task`;
- retirar de Hoje remove a alocação diária, sem apagar a tarefa;
- agendar cria ou atualiza blocos de `DayPlanItem`;
- concluir uma sessão planejada não conclui automaticamente toda a tarefa;
- concluir a tarefa continua sendo uma ação explícita.

O status legado `hoje` permanece aceito durante compatibilidade. A projeção do backlog deve interpretá-lo junto da alocação diária e não apresentá-lo como um quinto grupo. A implementação deve reutilizar o backfill e a transição já definidos para Hoje, sem migração destrutiva adicional.

## 6. Arquitetura da tela principal

### 6.1 Cabeçalho

O cabeçalho é compacto e contém:

- título `Tarefas`;
- busca;
- ação `Nova tarefa`;
- acesso aos filtros;
- acesso às visões acionáveis.

Não há subtítulo repetindo o propósito da rota. Não há cartões de métricas acima da lista.

### 6.2 Visões acionáveis

As visões são filtros derivados, não novos estados:

- **Todas:** backlog operacional padrão;
- **Aguardando:** tarefas com dependência externa ativa;
- **Bloqueadas:** tarefas com ao menos uma restrição aberta;
- **Atrasadas:** tarefas abertas com prazo vencido;
- **Sem próximo passo:** tarefas abertas sem ação concreta definida.

Cada visão mostra somente tarefas que permitem uma ação. Não existe uma visualização separada de gráficos ou distribuição de prioridade na primeira versão.

### 6.3 Lista por movimento

A visão padrão contém quatro seções na ordem:

1. Em andamento;
2. Próximas;
3. Aguardando;
4. Futuro.

Cada seção possui título, quantidade e controle de recolhimento. A preferência de grupos abertos é preservada localmente. Se uma visão acionável estiver selecionada, o resultado pode permanecer agrupado por movimento quando houver mais de um grupo relevante.

Cada linha pode apresentar:

- controle de conclusão;
- título;
- Frente e Projeto como contexto compacto;
- progresso de etapas quando existir;
- próximo passo quando houver espaço;
- marca `Hoje` quando houver alocação diária ativa;
- prazo, bloqueio ou dependência quando exigirem atenção;
- prioridade apenas quando ela diferenciar a decisão atual.

A linha não é um card. Metadados ausentes não geram rótulos vazios. O mesmo ícone, estado e vocabulário usado em outras rotas deve ser reutilizado.

### 6.4 Ordenação

Dentro de cada grupo, a ordem padrão considera:

1. atenção acionável, como atraso ou bloqueio;
2. prioridade;
3. prazo mais próximo;
4. atualização mais recente.

Ordenação explícita por prazo, prioridade, projeto ou atualização pode ser escolhida nos filtros. Reordenação manual dentro de um grupo fica fora deste escopo; arrastar serve apenas para mudar o movimento operacional.

## 7. Lista e detalhe

### 7.1 Desktop

O backlog ocupa aproximadamente 60% da área útil. O painel lateral ocupa aproximadamente 40%, com largura mínima suficiente para texto e propriedades.

Ao selecionar uma tarefa:

- a linha permanece visível e selecionada;
- o painel abre sem modal e sem remover a lista;
- a URL reflete a seleção por sub-rota ou parâmetro estável;
- fechar o painel preserva busca, filtros, grupos e rolagem;
- `Esc` fecha o painel e devolve foco à linha que o abriu.

### 7.2 Celular

No celular, lista e detalhe são níveis separados:

```text
Backlog de Tarefas -> Detalhe da tarefa
```

O detalhe usa toda a viewport disponível. Voltar restaura:

- a posição da rolagem;
- a visão acionável;
- a busca;
- os filtros;
- os grupos recolhidos;
- a linha previamente selecionada.

Não será usado painel lateral comprimido, expansão extensa dentro da lista ou folha inferior para o detalhe completo.

## 8. Criação progressiva

### 8.1 Entrada

`Nova tarefa` abre um compositor no topo da lista, próximo ao contexto em que o resultado aparecerá. Não abre um modal.

Campo obrigatório:

- título.

Campos opcionais disponíveis sem ocupar a superfície inicial:

- Frente;
- Projeto;
- prazo.

Se a Frente ativa do shell for específica, ela pode ser sugerida. Projeto nunca é inventado automaticamente.

Como `Task.workspaceId` permanece obrigatório no domínio, o frontend resolve a Frente de forma determinística sem torná-la um pedágio visual:

1. Frente específica ativa no shell;
2. Frente preferida do usuário;
3. primeira Frente ativa disponível.

Se o usuário ainda não possuir Frente, o compositor explica a dependência e oferece criar a primeira antes de salvar. A Frente resolvida aparece no painel logo após a criação e pode ser alterada.

### 8.2 Confirmação

Ao confirmar:

1. a tarefa é criada no horizonte ativo;
2. entra em Próximas;
3. aparece imediatamente na lista;
4. seu painel de detalhe abre;
5. o foco vai para definição de pronto ou próximo passo;
6. falha preserva o título e os campos opcionais para nova tentativa.

`Enter` confirma. `Shift+Enter` permite título multilinha apenas se o componente suportar composição explícita; caso contrário, título permanece em uma linha. `Esc` cancela sem criar.

## 9. Painel de detalhe

O painel é um documento vertical. Não usa as abas permanentes `Visão geral`, `Checklist`, `Restrições` e `Histórico` da implementação atual.

Ordem do conteúdo:

1. estado operacional e marca Hoje;
2. título;
3. definição de pronto;
4. próximo passo;
5. etapas e progresso;
6. bloqueio ou dependência atual;
7. propriedades compactas;
8. histórico recolhido.

### 9.1 Clareza de execução

Definição de pronto responde qual resultado encerra a tarefa. Próximo passo responde qual ação concreta permite avançar agora. Eles são independentes e editáveis em linha.

Uma tarefa sem próximo passo aparece na visão correspondente. Definição de pronto não é obrigatória na criação, mas a interface recomenda preenchê-la antes de marcar a tarefa Em andamento.

### 9.2 Etapas

Subtarefas existentes são apresentadas como etapas. O usuário pode:

- criar;
- reordenar;
- concluir e reabrir;
- remover;
- acompanhar progresso.

Concluir todas as etapas não conclui automaticamente a tarefa. A interface pode oferecer a ação explícita `Concluir tarefa`.

### 9.3 Bloqueios e dependências

- restrições abertas representam bloqueios internos ou condições não atendidas;
- `waitingOnPerson`, `waitingType`, `waitingPriority` e `waitingDueDate` representam dependência externa;
- mover para Aguardando solicita de quem ou do que a tarefa depende;
- registrar acompanhamento atualiza o histórico e a próxima decisão sem alterar silenciosamente o prazo principal;
- resolver a dependência devolve a tarefa ao estado operacional anterior quando conhecido; na ausência dessa informação, retorna para Próximas.

### 9.4 Propriedades compactas

Propriedades ficam em uma área secundária e recolhível:

- Frente;
- Projeto;
- prazo;
- prioridade;
- estimativa;
- energia;
- tipo de execução;
- horizonte;
- configuração multibloco.

Campos avançados aparecem quando usados. A interface não exibe uma grade vazia de propriedades.

### 9.5 Ações

Ações principais:

- Planejar para Hoje ou retirar de Hoje;
- Agendar;
- Mover estado;
- Concluir.

Ações secundárias:

- duplicar quando suportado;
- arquivar;
- excluir;
- copiar referência;
- abrir Projeto ou Frente vinculada.

Excluir exige confirmação contextual e informa o impacto sobre etapas, restrições e sessões relacionadas.

## 10. Movimentação e interação

### 10.1 Mudança de grupo

No desktop, arrastar pode mover uma tarefa entre grupos. A mesma operação sempre está disponível no menu da linha e no painel.

Movimentos são otimistas:

1. a linha muda de grupo imediatamente;
2. a API persiste a alteração;
3. sucesso confirma sem interromper o fluxo;
4. falha devolve a linha à posição anterior e mostra erro com `Tentar novamente`.

### 10.2 Planejar para Hoje

Planejar para Hoje não muda o grupo. A linha recebe a marca `Hoje` e a entrada aparece na lente diária. Retirar de Hoje remove somente a alocação diária.

### 10.3 Agendar

Agendar abre o fluxo de escolha de data, horário e duração já conectado à Agenda. Uma tarefa complexa pode possuir várias sessões. A ação não altera automaticamente Em andamento ou Próximas.

### 10.4 Conclusão

Concluir usa o fluxo existente de conclusão de tarefa, incluindo campos de reflexão quando forem obrigatórios pela regra atual. A tarefa sai da visão padrão após confirmação e pode ser reaberta pela visão Concluídas.

## 11. Busca, filtros e URL

Busca cobre título, definição de pronto, próximo passo, Frente e Projeto.

Filtros iniciais:

- Frente;
- Projeto;
- prioridade;
- prazo;
- marca Hoje;
- horizonte;
- concluídas.

A URL preserva ao menos:

- visão acionável;
- busca;
- filtros compartilháveis;
- tarefa selecionada no desktop ou detalhe aberto no celular.

Rolagem e grupos recolhidos podem permanecer em estado de navegação ou armazenamento local por usuário. Parâmetros inválidos são ignorados e não quebram a rota.

## 12. Estados de interface

### 12.1 Carregamento

Skeletons preservam a geometria da lista e do painel. Abrir uma tarefa já presente não limpa a lista enquanto detalhes complementares carregam.

### 12.2 Vazio

- **Sem tarefas:** explica o papel da tarefa complexa e oferece criar a primeira.
- **Sem resultados:** oferece limpar busca e filtros.
- **Aguardando vazio:** explica dependências externas e oferece voltar para Todas.
- **Bloqueadas vazio:** informa que não existem restrições abertas.
- **Sem próximo passo vazio:** confirma que todas as tarefas ativas possuem direção.

### 12.3 Erro

- falha inicial mostra mensagem e `Tentar novamente` sem desmontar o shell;
- falha de detalhe mantém lista utilizável;
- falha de criação preserva o compositor;
- falha de mutação reverte o estado otimista;
- ações concorrentes na mesma tarefa ficam bloqueadas até a resposta;
- erros aparecem próximos da ação e também possuem anúncio acessível.

## 13. Teclado e acessibilidade

Atalhos quando não houver campo de texto ativo:

- `/`: focar busca;
- `N`: nova tarefa;
- `J` e `K`: percorrer tarefas visíveis;
- `Enter`: abrir detalhe;
- `Esc`: fechar painel ou cancelar compositor.

Requisitos:

- WCAG 2.2 AA;
- foco visível;
- alvos de toque de pelo menos 44 px no celular;
- nomes acessíveis para ações baseadas em ícones;
- estado não comunicado apenas por cor;
- alternativas de teclado e menu para arrastar;
- movimento reduzido respeitado;
- foco restaurado ao fechar detalhe ou diálogo;
- leitor de tela anuncia criação, movimentação, conclusão, erro e rollback.

## 14. Arquitetura técnica do frontend

A implementação deve substituir a concentração atual por módulos com responsabilidade única.

| Unidade | Responsabilidade |
| --- | --- |
| `TaskBacklogPage` | compor a rota e sincronizar estado navegável |
| `useTaskBacklog` | carregar projeção, filtrar, agrupar e executar mutações otimistas |
| `TaskBacklogToolbar` | busca, filtros, visões e criação |
| `TaskGroupList` | renderizar grupos e movimentação |
| `TaskRow` | linha densa, seleção e ações rápidas |
| `TaskCreateComposer` | criação progressiva |
| `TaskDetailPanel` | conteúdo compartilhado do detalhe desktop e mobile |
| `TaskExecutionClarity` | definição de pronto e próximo passo |
| `TaskSteps` | subtarefas e progresso |
| `TaskConstraints` | restrições e dependências externas |
| `TaskProperties` | propriedades secundárias |
| `TaskHistory` | histórico sob demanda |
| `task-backlog-model` | grupos, visões derivadas, ordenação e mapeamento legado |

Um único controlador mantém coleção, seleção e mutações. O detalhe pode buscar subtarefas, restrições, histórico e progresso sob demanda, com cache por tarefa. Trocar entre tarefas não deve repetir requisições já concluídas durante a sessão, salvo invalidação após mutação.

`TaskIntelligenceTable` e os gráficos deixam de ser dependências da rota. Código ou transformações úteis podem ser extraídos antes da remoção. Não manter dois renderizadores completos para a mesma lista.

## 15. Contratos e compatibilidade

As operações existentes permanecem disponíveis:

- criar, editar, concluir, reabrir, arquivar e excluir tarefa;
- criar, atualizar, concluir e remover subtarefas;
- criar, resolver e remover restrições;
- registrar e resolver dependência externa;
- consultar histórico e progresso multibloco;
- planejar para Hoje;
- agendar sessões na Agenda.

Antes de criar novo endpoint, o plano de implementação deve auditar os contratos atuais. Um novo read model é aceitável se reduzir requisições e centralizar a projeção do backlog, mas não deve duplicar regras de domínio já existentes.

A projeção precisa fornecer ou derivar:

- grupo operacional;
- marca Hoje;
- próximo passo;
- quantidade e progresso de etapas;
- quantidade de restrições abertas;
- estado de dependência externa;
- atraso;
- contexto de Frente e Projeto.

O modelo atual não possui um campo independente para próximo passo. A implementação adiciona `nextStep String?` a `Task`, com migração somente aditiva e nullable. `description` continua sendo descrição livre e não será reutilizado silenciosamente como próximo passo. API, tipos do cliente, criação, edição, busca e histórico devem aceitar `nextStep`.

Não é necessário criar um novo status para Aguardando. A projeção usa os campos existentes de dependência externa e preserva o status operacional subjacente. Também não é necessário criar um campo de ordem manual nesta fase.

## 16. Estratégia de testes

### 16.1 Modelo e controlador

- mapear backlog, andamento, dependência externa e horizonte para os quatro grupos;
- interpretar status legado `hoje` sem criar grupo próprio;
- derivar Aguardando, Bloqueadas, Atrasadas e Sem próximo passo;
- preservar ordenação determinística e filtros;
- executar mutação otimista, sucesso e rollback.

### 16.2 Componentes

- renderizar linha com metadados progressivos;
- criar tarefa somente com título;
- preservar compositor após erro;
- editar definição de pronto e próximo passo;
- gerenciar etapas, restrições e dependências;
- oferecer alternativa ao arrastar;
- restaurar foco ao fechar painel.

### 16.3 Integração

- abrir backlog, selecionar tarefa e manter lista visível no desktop;
- abrir detalhe em tela cheia e voltar à posição anterior no celular;
- planejar para Hoje sem mudar grupo;
- agendar sem concluir ou iniciar automaticamente;
- mover entre grupos;
- concluir e reabrir;
- preservar busca, filtros e seleção na URL;
- validar compatibilidade de tarefas legadas.

### 16.4 Verificação visual

- desktop na largura normal do shell;
- desktop com sidebar recolhida;
- celular em 390 por 844 px;
- lista cheia, títulos longos e propriedades ausentes;
- painel com muitas etapas e restrições;
- vazios, skeletons, erros e foco de teclado;
- ausência de overflow horizontal e conteúdo coberto pela navegação móvel.

## 17. Critérios de aceite

O redesign está concluído quando:

- a rota padrão mostra tarefas complexas numa lista agrupada por movimento;
- Hoje aparece como marca independente e não como grupo;
- criação com somente título funciona sem modal;
- clicar numa tarefa mantém backlog visível no desktop;
- detalhe mobile usa tela cheia e restaura contexto ao voltar;
- definição de pronto e próximo passo aparecem antes das propriedades;
- visões acionáveis substituem métricas e gráficos;
- capacidades atuais de etapas, restrições, dependências, multibloco e histórico continuam funcionais;
- arrastar possui alternativa explícita;
- falhas otimistas revertem corretamente;
- teclado, foco e nomes acessíveis são validados;
- testes, typecheck e build passam;
- inspeção visual desktop e mobile não encontra regressões críticas.

## 18. Métricas de sucesso

Sinais qualitativos:

- o usuário entende o backlog sem abrir análise ou documentação;
- fica claro por que uma tarefa está em cada grupo;
- planejar para Hoje não parece mover ou duplicar a tarefa;
- tarefas bloqueadas e sem próximo passo conduzem a uma decisão;
- editar uma tarefa não faz o usuário perder a lista.

Sinais quantitativos futuros, quando analytics estiver disponível:

- tempo entre abrir Tarefas e realizar a primeira ação;
- proporção de tarefas ativas com próximo passo;
- quantidade de tarefas aguardando sem data de acompanhamento;
- taxa de abandono do compositor;
- frequência de rollback ou falha por tipo de mutação.
