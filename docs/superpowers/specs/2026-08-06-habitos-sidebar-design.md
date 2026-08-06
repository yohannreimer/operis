# Hábitos e sidebar — ritual diário e navegação silenciosa

**Data:** 2026-08-06

**Status:** Aguardando revisão final do usuário

**Escopo:** redesign da página Hábitos, nova página Evolução, sidebar desktop e navegação mobile

**Base visual aprovada:** direção A, “Livro de execução”

## 1. Contexto

O Operis já possui as funções centrais de Hábitos: hábitos binários, quantitativos e de vício, frequência, registros diários, sequências, XP por área e heatmap de consistência. O problema principal é de hierarquia e uso:

- a tela mistura ritual diário, RPG e análise no mesmo nível;
- áreas, chips, cards e ações repetidas tornam a interface mais pesada que o trabalho;
- a sidebar ocupa espaço demais, repete descrições óbvias e destaca o item ativo como um card com contorno forte;
- Hábitos é uma ação diária, mas fica escondido em “Mais” no celular;
- símbolos e emojis não formam um sistema iconográfico consistente.

O redesign não altera a promessa funcional. Ele reorganiza o produto para que o usuário marque o dia rapidamente e consulte evolução quando quiser.

## 2. Decisões aprovadas

1. Hábitos será um **ritual diário primeiro**; RPG e análise serão uma segunda camada.
2. A sidebar usará **grupos discretos**: Planejar, Organizar e Evoluir.
3. A lista principal mostrará primeiro os hábitos previstos para a data selecionada; hábitos não previstos ficarão em **Outros hábitos**, recolhido por padrão.
4. O RPG aparecerá num **resumo compacto abaixo do ritual**, com acesso a uma página completa de Evolução.
5. A direção visual é **Livro de execução**: compacta, adulta, silenciosa, com referências de densidade e hierarquia em Linear e Notion.
6. Hábitos quantitativos terão **incremento rápido e entrada de valor exato**.
7. Recaídas serão registradas imediatamente e terão **Desfazer temporário**, sem confirmação modal.
8. Todo o shell usará a biblioteca já instalada **Lucide React**, sem glyphs, caracteres decorativos ou emojis como ícones de navegação.

## 3. Objetivos

- Permitir compreender e atualizar o ritual do dia em poucos segundos.
- Manter toda ação diária visível e previsível, sem menus escondidos.
- Separar execução de análise sem separar os dados.
- Fazer a sidebar orientar sem competir com o conteúdo.
- Preservar a mesma hierarquia em desktop e celular.
- Manter o sistema visual operacional, calmo e tátil, sem estética de dashboard gerado por IA.

## 4. Não objetivos

- Alterar as regras de XP, níveis ou cálculo de sequência.
- Criar competição, ranking, conquistas ou celebrações adicionais.
- Redesenhar Dashboard, Projetos, Frentes, Tarefas ou Notas neste bloco.
- Remover tipos de hábito ou configurações existentes.
- Refazer autenticação, API ou persistência além do necessário para suportar as visões aprovadas.

## 5. Arquitetura de navegação

### 5.1 Sidebar desktop expandida

Largura alvo: **210 px**.

Ordem e grupos:

```text
Operis                         [recolher]
[+] Capturar                         Q

PLANEJAR
Hoje                                  4
Agenda

ORGANIZAR
Tarefas                              12
Projetos
Frentes
Notas

EVOLUIR
Hábitos
Dashboard

Configurações
```

Regras:

- títulos de grupo usam texto pequeno, caixa alta e contraste secundário;
- grupos são apenas orientação visual, não accordions;
- itens não exibem subtítulos como “Execução diária” ou “RPG de vida”;
- o item ativo usa fundo sutil, texto principal e ícone laranja;
- não usar borda laranja completa, barra lateral decorativa ou brilho;
- contadores aparecem apenas quando têm valor operacional, como pendências de Hoje e Tarefas;
- Configurações fica no rodapé, separada por uma linha discreta;
- Capturar permanece disponível perto do topo e mantém atalho de teclado.

### 5.2 Sidebar desktop recolhida

Largura alvo: **62 px**.

- mostra marca Operis, Capturar e apenas os ícones das rotas;
- conserva os mesmos agrupamentos por espaçamento, sem títulos;
- cada ícone possui tooltip com nome e, quando aplicável, contador;
- o estado ativo usa fundo sutil e cor de destaque;
- a preferência expandida/recolhida continua persistida localmente;
- o botão usa `PanelLeftClose` quando expandido e `PanelLeftOpen` quando recolhido.

### 5.3 Navegação mobile

A barra inferior terá cinco destinos:

1. Hoje
2. Agenda
3. Tarefas
4. Hábitos
5. Mais

O menu Mais contém Projetos, Frentes, Notas, Dashboard e Configurações, preservando os grupos Organizar e Evoluir dentro do sheet. Captura rápida permanece disponível num botão flutuante acima da navegação.

### 5.4 Mapeamento de ícones

Todos os ícones vêm de `lucide-react`, com tamanho e `strokeWidth` consistentes por contexto.

| Destino/ação | Ícone Lucide |
| --- | --- |
| Hoje | `CalendarCheck2` |
| Agenda | `CalendarClock` |
| Tarefas | `ListTodo` |
| Projetos | `BriefcaseBusiness` |
| Frentes | `Building2` |
| Notas | `NotebookPen` |
| Hábitos | `Target` |
| Dashboard | `LayoutDashboard` |
| Configurações | `Settings` |
| Capturar/Novo | `Plus` |
| Mais | `Menu` |
| Recolher/expandir | `PanelLeftClose` / `PanelLeftOpen` |

Não usar emojis, caracteres Unicode ou SVGs próprios para essas funções.
Emojis escolhidos pelo usuário como identidade de um hábito continuam permitidos; essa exceção não se aplica ao shell nem às ações do sistema.

## 6. Página Hábitos — ritual diário

### 6.1 Cabeçalho

O cabeçalho contém:

- overline com data completa;
- título **Hábitos de hoje** quando a data selecionada é hoje;
- título equivalente para datas anteriores;
- navegação de dia anterior/próximo com ícones Lucide;
- próximo dia desabilitado quando a data já é hoje;
- ação principal **Novo hábito**;
- resumo textual `6 de 9 concluídos` e uma linha fina de progresso.

Não repetir “Hábitos” e “RPG de vida” em um card superior. O cabeçalho ocupa apenas o espaço necessário.

### 6.2 Lista principal

A lista é uma superfície única, sem um card por área. Cada linha contém:

1. controle de conclusão ou estado;
2. nome do hábito;
3. metadado curto: área, frequência, meta ou sequência;
4. uma ação diária principal;
5. menu de três pontos para manutenção.

As áreas aparecem como metadado, não como contêineres coloridos. Cor de área pode ser usada apenas como sinal pequeno e acessível, nunca como única forma de identificação.

Hábitos concluídos ficam visualmente mais silenciosos, mas continuam legíveis. A lista não deve reordenar uma linha imediatamente após a conclusão, evitando perda de contexto.

### 6.3 Hábitos previstos e Outros hábitos

- **Para hoje** contém os hábitos cuja frequência prevê execução na data selecionada.
- **Outros hábitos** contém hábitos ativos não previstos para a data.
- Outros hábitos fica recolhido por padrão e informa a quantidade escondida.
- Ao expandir, as mesmas ações de registro permanecem disponíveis; um registro extra não altera a frequência configurada.
- Se não houver hábitos previstos, a tela explica isso e oferece expandir Outros hábitos ou criar um hábito.

### 6.4 Tipos e interações

#### Binário

- círculo e botão Marcar executam a mesma ação;
- conclusão e desfazer são imediatos;
- o estado concluído usa `Check` e texto “Concluído”;
- a linha inteira não alterna o estado, evitando cliques acidentais quando o usuário tenta abrir detalhes.

#### Quantitativo

- exibe valor atual, meta, unidade e progresso linear;
- a ação rápida soma o incremento já definido pela regra atual do produto;
- tocar no valor, por exemplo `12/30`, abre um popover ou sheet para informar o valor exato;
- o valor exato representa o total do dia, não um incremento adicional;
- a interface esclarece essa semântica no rótulo do campo;
- zerar/desfazer fica no popover de valor, não ocupa a linha principal;
- ao alcançar a meta, a linha assume estado concluído sem impedir registros acima da meta.

#### Vício

- exibe dias sem recair e uma ação explícita **Registrar recaída**;
- a ação registra imediatamente, sem `confirm()` nativo ou modal;
- um toast oferece **Desfazer** por tempo suficiente para corrigir toque acidental;
- depois do prazo, desfazer continua disponível no menu da linha para a data atual;
- a mensagem é neutra e factual; não usa culpa, punição ou celebração infantil.

### 6.5 Menu de manutenção

O menu de três pontos contém apenas ações não diárias:

- Editar
- Arquivar
- Excluir

Excluir mantém confirmação explícita por ser destrutivo. Arquivar pode usar confirmação leve ou toast reversível conforme o padrão global do app. Nenhuma ação de marcar, incrementar ou registrar recaída fica escondida neste menu.

## 7. Resumo de evolução no ritual

Abaixo de Outros hábitos aparece **Sua evolução**:

- até três áreas relevantes em desktop e uma prévia compacta no celular;
- nome da área, nível, XP atual e progresso para o próximo nível;
- link **Ver evolução completa**;
- sem chips multicoloridos, radar obrigatório ou coleção de mini-cards concorrentes.

O resumo é informativo e secundário. Ele nunca empurra os hábitos previstos para fora da primeira viewport em tamanhos comuns de desktop.

## 8. Página Evolução

Rota proposta: `/habitos/evolucao`.

A análise deixa de expandir dentro da página do ritual e passa a ser uma página própria. O retorno para Hábitos é sempre visível.

### 8.1 Estrutura

- título **Sua evolução**;
- períodos 30 dias, 90 dias e 1 ano;
- abas **Visão geral** e **Consistência por hábito**;
- ritmo geral em tipografia de destaque;
- progresso por área em linhas horizontais;
- heatmap de consistência com seletor de hábito;
- uma leitura textual curta baseada nos dados, quando houver evidência suficiente.

### 8.2 Ritmo geral

Ritmo geral é a proporção entre ocorrências previstas e ocorrências cumpridas no período. Hábitos não previstos para um dia não entram no denominador. Registros extras aparecem no histórico individual, mas não inflam o percentual acima de 100%.

### 8.3 Heatmap

- usa os registros históricos já existentes;
- distingue sem registro, registro parcial, meta atingida e recaída;
- não depende apenas de cor: tooltip/descrição contém data e valor;
- hoje recebe indicação discreta;
- o seletor permite trocar de hábito sem sair da página;
- no celular, a grade reduz colunas mantendo células tocáveis e rolagem horizontal apenas se necessário.

### 8.4 Leitura de tendência

A leitura textual só aparece quando houver amostra suficiente. Exemplos:

- “Leitura ganhou ritmo nas últimas três semanas.”
- “Terças-feiras concentram mais registros ausentes.”

Não apresentar causalidade, julgamento ou recomendação não sustentada pelos dados. Quando a amostra for insuficiente, mostrar apenas o histórico.

## 9. Criação e edição de hábitos

O fluxo atual de criação e edição continua funcional neste bloco, mas recebe a mesma linguagem visual:

- usar ícones Lucide para tipos e áreas sempre que houver equivalente;
- manter nomes e descrições textuais ao lado de ícones;
- preservar os tipos binário, quantitativo e vício;
- campos quantitativos deixam claro unidade, meta diária e incremento rápido;
- frequência continua definindo quando um hábito aparece em Para hoje;
- modais respeitam foco, Escape, retorno de foco e áreas tocáveis mínimas.

Uma reformulação profunda do fluxo de criação pode ser feita depois, durante o ajuste fino, sem bloquear este redesign.

## 10. Responsividade

### Desktop amplo

- sidebar de 210 px expandida ou 62 px recolhida;
- conteúdo de Hábitos usa largura legível e não estica linhas indefinidamente;
- ações permanecem alinhadas à direita.

### Tablet e desktop estreito

- metadados podem reduzir antes de esconder ações;
- o resumo de evolução reduz o número de áreas visíveis;
- a sidebar pode iniciar recolhida conforme o breakpoint atual, sem sobrescrever preferência explícita do usuário.

### Celular

- barra inferior fixa com cinco destinos;
- conteúdo possui espaço inferior suficiente para navegação e Capturar;
- ações quantitativas podem quebrar para uma segunda linha;
- Registrar recaída usa rótulo curto quando necessário, sem virar apenas um ícone;
- Evolução abre como página completa, não modal ou drawer estreito;
- alvos de toque têm no mínimo 44 × 44 px quando isolados ou área equivalente na linha.

## 11. Estados e feedback

- carregamento usa skeletons com a geometria da lista final;
- ações diárias usam atualização otimista quando houver rollback confiável;
- durante uma mutação, somente a linha afetada fica ocupada;
- erro restaura o estado anterior e informa o que não foi salvo;
- estado vazio distingue “nenhum hábito criado” de “nenhum hábito previsto hoje”;
- mudança de nível pode ser informada por toast calmo; sem confete;
- toasts têm texto acessível e ação Desfazer por teclado.

## 12. Acessibilidade

- conformidade alvo: WCAG 2.2 AA;
- navegação completa por teclado;
- foco visível em sidebar, linhas, popovers, sheets e abas;
- `aria-current="page"` na rota ativa;
- botões apenas com ícone recebem `aria-label` e tooltip;
- progresso possui valor e rótulo acessíveis;
- cores de área, conclusão e recaída são acompanhadas de texto ou ícone;
- `prefers-reduced-motion` elimina transições não essenciais;
- contraste de texto secundário não pode reproduzir o cinza excessivamente apagado da tela atual.

## 13. Dados e compatibilidade

Reutilizar:

- consulta de estatísticas da data selecionada;
- consulta de todos os hábitos ativos;
- radar/estatísticas de XP por área;
- histórico/heatmap por hábito;
- endpoints atuais de registrar, desfazer, recaída, editar, arquivar e excluir.

### 13.1 Classificação Para hoje versus Outros hábitos

O serviço atual filtra hábitos `specific_days`, mas devolve os hábitos semanais e mensais em todos os dias. Para alimentar as duas seções sem perder estatísticas, ampliar `GET /habits/stats/today` com o parâmetro opcional `includeUnscheduled=true` e o campo `isScheduledForDate` em cada item. Sem o parâmetro, manter o contrato atual para não alterar consumidores como o briefing e o WhatsApp.

Com `includeUnscheduled=true`, o serviço retorna todos os hábitos ativos e classifica:

- `daily`: previsto na data;
- `specific_days`: previsto quando o dia da semana corresponde;
- `weekly`: previsto enquanto a quantidade de ocorrências concluídas no período, até a data selecionada, for menor que a meta semanal;
- `monthly`: previsto enquanto a quantidade de ocorrências concluídas no período, até a data selecionada, for menor que a meta mensal.

Depois de atingir uma meta semanal ou mensal, o hábito passa para Outros hábitos nos dias seguintes do mesmo período. Se houver registro na própria data selecionada, ele continua em Para hoje para que o usuário veja e possa desfazer o que acabou de fazer. Registrar um hábito em Outros hábitos cria uma ocorrência extra, mas não altera sua configuração.

O progresso semanal/mensal de uma data histórica deve ser calculado até essa data, e não com registros posteriores dentro do mesmo período.

### 13.2 Valor quantitativo absoluto

O endpoint atual `POST /habits/:id/log` acumula valores e continua sendo usado pelo incremento rápido. Adicionar uma operação absoluta:

```http
PUT /habits/:id/log
Content-Type: application/json

{ "date": "YYYY-MM-DD", "value": 20, "note": null }
```

- aceita apenas hábito quantitativo e valor positivo;
- cria ou substitui o total da data de forma atômica;
- mantém o processamento de XP idempotente;
- valor zero usa o `DELETE` existente em vez do `PUT`;
- impede que informar total `20` transforme um registro existente `12` em `32`.

### 13.3 Dados de Evolução

O heatmap atual já aceita `days` e atende 30, 90 e 365 dias por hábito. Para o ritmo geral, adicionar:

```http
GET /habits/stats/evolution?days=30|90|365
```

Resposta mínima:

```json
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "expectedOccurrences": 90,
  "completedOccurrences": 66,
  "rhythmPct": 73,
  "areas": [
    {
      "lifeArea": "corpo",
      "level": 4,
      "totalXp": 840,
      "progressPct": 70,
      "nextLevelXp": 1200
    }
  ]
}
```

O denominador segue as regras de frequência descritas acima. Recaídas não contam como ocorrência cumprida. Um hábito do tipo vício conta como mantido nos dias previstos sem recaída, preservando a semântica atual do produto.

A leitura textual de um hábito pode ser calculada no cliente a partir do heatmap e da frequência atual. Ela só compara janelas equivalentes com amostra mínima de 14 ocorrências previstas. Caso contrário, fica oculta.

## 14. Critérios de aceitação

- A sidebar expandida não excede aproximadamente 210 px e não mostra captions por rota.
- A sidebar recolhida preserva acesso, tooltips, rota ativa e preferência persistida.
- Hábitos aparece na navegação mobile principal.
- Nenhum ícone de navegação é emoji, glyph ou SVG próprio; todos vêm de Lucide React.
- A primeira viewport prioriza hábitos previstos, não XP ou análise.
- Outros hábitos inicia recolhido e pode ser expandido.
- Os três tipos de hábito podem ser atualizados sem abrir o menu de manutenção.
- Valor quantitativo aceita incremento rápido e total exato sem dupla contagem.
- Recaída não pede confirmação e oferece Desfazer.
- Evolução abre em rota própria e funciona em desktop e celular.
- Heatmap e níveis preservam dados existentes.
- Layout não fica coberto pela barra mobile ou pelo botão Capturar.
- Testes existentes continuam passando e novos testes cobrem agrupamento, navegação e interações críticas.

## 15. Validação proposta

### Testes unitários e de componente

- agrupamento de rotas da sidebar;
- links primários e Mais no mobile;
- hábitos previstos versus Outros hábitos;
- binário marcar/desmarcar;
- quantitativo incremento e definição de total;
- recaída, toast e desfazer;
- períodos e seletor do heatmap;
- estados vazios e de erro.

### Verificação visual e funcional

- desktop amplo, 1280 px, 1024 px, 390 px e 360 px;
- sidebar expandida e recolhida;
- páginas Hábitos e Evolução;
- menus, popovers, sheets e modais;
- navegação por teclado;
- console sem erros;
- conteúdo sem sobreposição com navegação mobile e Capturar.

## 16. Referências visuais aprovadas

Os mockups do companion foram mantidos no workspace em `.superpowers/brainstorm/75864-1786025753/content/`:

- `direcoes-habitos-sidebar.html` — comparação das três direções;
- `sidebar-responsiva-a.html` — sidebar expandida, recolhida e mobile;
- `habitos-interacoes-desktop-mobile.html` — ritual e tipos de hábito;
- `evolucao-analise-habitos.html` — página Evolução.

Esses arquivos são referência de hierarquia e sensação, não uma especificação pixel-perfect. O código final deve reutilizar tokens e componentes do Operis e a biblioteca Lucide React já instalada.
