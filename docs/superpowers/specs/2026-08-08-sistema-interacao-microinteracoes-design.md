# Operis: sistema de interação e microinterações

**Data:** 2026-08-08

**Status:** design aprovado em conversa; aguardando revisão deste documento

**Escopo:** botões, controles, criação, campos, menus, modais, painéis, feedback e movimento em todas as rotas do frontend web, no desktop e no celular

**Referência comportamental principal:** Superlist

## 1. Objetivo

Substituir os estilos de interação isolados do Operis por um sistema transversal, calmo, compacto e previsível.

O trabalho não é uma troca cosmética do laranja. O objetivo é fazer cada ação comunicar com clareza:

1. o que pode ser feito;
2. qual ação é principal;
3. qual estado o objeto possui;
4. o que mudou após a interação;
5. como desfazer quando a mudança for reversível.

O sistema deve preservar a identidade do Operis sem usar grandes fundos coloridos, glows ou componentes inflados. A interface serve ao trabalho e desaparece durante o uso.

## 2. Contexto e diagnóstico

O frontend possui uma regra global em `apps/web/src/styles.css` que aplica fundo laranja a todo `button` e glow a qualquer botão sem classe. Como cada rota também possui estilos próprios, a aparência final depende de exceções locais.

Esse modelo provoca:

- botões de criar, confirmar, fechar e tentar novamente com a mesma ênfase;
- fundos marrons e bordas laranja em compositores;
- sombras laranja em ações neutras;
- controles diferentes para a mesma ação em telas distintas;
- botões de conclusão muito maiores que o conteúdo;
- duplicação de pontos de criação no celular;
- estados de hover, toque, foco e loading inconsistentes;
- confusão entre área de toque e tamanho visual.

Os exemplos enviados nesta sessão mostram quatro ocorrências prioritárias:

1. compositor de nova tarefa com fundo marrom, contorno laranja e botão `Criar` colorido;
2. captura global expandida com borda grossa e glow laranja;
3. conclusão da linha do tempo representada por grandes quadrados à direita;
4. revisão de pendências de ontem com `Manter em Hoje` e `Concluir` dentro de caixas pesadas.

No celular, o checkbox de uma tarefa ocupa visualmente toda a área mínima de toque. O alvo deve continuar com no mínimo 44 px, mas o círculo desenhado deve possuir apenas 18 a 20 px.

### 2.1 Evidências visuais fornecidas

Os arquivos originais permanecem no diretório temporário do Macshot do usuário:

- `Screenshot 2026-08-08 at 11-55-16.png`: criação de tarefa no celular;
- `Screenshot 2026-08-08 at 11-55-49.png`: captura e Hoje no desktop;
- `Screenshot 2026-08-08 at 11-56-16.png`: controles de conclusão na linha do tempo;
- `Screenshot 2026-08-08 at 11-56-28.png`: bandeja do Inbox;
- `Screenshot 2026-08-08 at 12-04-03.png`: pendências de ontem e checkbox inflado.

O arquivo visual consolidado de Inbox e Hoje, com referências de Things, Linear, Sunsama e Notion Calendar, continua em `docs/superpowers/specs/assets/2026-08-05-operis-inbox-hoje/`.

## 3. Decisões aprovadas

1. O laranja será um sinal, não uma massa visual.
2. Botões não usarão glow ou sombra colorida.
3. A criação será progressiva: simples inline, detalhes sob demanda.
4. O feedback de conclusão será visual e tátil, sem som.
5. Checkboxes terão 18 a 20 px visuais dentro de alvos móveis de 44 px.
6. Ações secundárias aparecerão no contexto, com alternativa acessível a hover, gesto e pressionar.
7. Modais centrais serão reservados para decisões bloqueantes.
8. Detalhes usarão painel lateral no desktop e tela cheia no celular.
9. A captura global permanecerá disponível no celular, identificada como `Capturar` e com ícone de Inbox.
10. Ações contextuais serão nomeadas, como `Nova tarefa`, `Novo projeto` e `Nova frente`.
11. Configurações será escondida da navegação, busca e atalhos, sem remover a rota.
12. Dashboard não será redesenhado estruturalmente nesta etapa.
13. Todas as rotas serão auditadas no desktop e no celular.

## 4. Referência Superlist

O Operis não copiará a identidade visual do Superlist. A referência será o comportamento:

- criação rápida por teclado e confirmação com `Enter`;
- várias entradas de captura que preservam o contexto;
- ações secundárias reveladas no hover;
- clique direito no desktop e pressionar no celular;
- gestos como aceleradores, nunca como única forma de agir;
- detalhes abertos a partir do próprio item;
- feedback imediato que confirma a mudança sem dominar a tela.

Fontes oficiais consultadas:

- [Create tasks and subtasks](https://help.superlist.com/en/articles/23853-create-tasks-and-subtasks)
- [Superlist for iPhone & Android](https://help.superlist.com/en/articles/40689-superlist-for-iphone-android-capture-tasks-anywhere)
- [Superlist basics](https://help.superlist.com/en/articles/10050-superlist-basics-lists-tasks-sections-meetings-explained)

O Operis adapta esses princípios ao seu domínio próprio: captura rápida, tarefa complexa, Hoje, Agenda, hábitos, Frentes, Projetos e Notas.

## 5. Direção visual

### 5.1 Cena de uso

Uma pessoa abre o Operis várias vezes durante o dia, no computador e no celular, para capturar, decidir e concluir rapidamente. O ambiente pode ter pouca luz, mas o usuário não deseja uma interface dramática. O tema escuro atual permanece, com contraste calmo e superfícies táteis.

### 5.2 Estratégia de cor

A estratégia é restrita:

- neutros quentes e levemente tingidos dominam a interface;
- laranja ocupa menos de 10% da superfície e identifica foco, seleção, navegação ativa e pequenos sinais;
- sucesso, aviso, erro e informação mantêm cores semânticas próprias;
- nenhum estado depende somente de cor;
- `#000` e `#fff` puros não serão usados nos novos tokens.

Papéis semânticos mínimos:

| Token | Papel |
| --- | --- |
| `--ui-canvas` | fundo principal |
| `--ui-surface` | toolbar, sidebar e campos |
| `--ui-surface-raised` | popover, sheet e modal |
| `--ui-border` | separação padrão |
| `--ui-border-strong` | hover e agrupamento importante |
| `--ui-text` | texto principal |
| `--ui-text-muted` | metadados e ações secundárias |
| `--ui-action` | fundo claro neutro da ação primária |
| `--ui-action-text` | texto escuro da ação primária |
| `--ui-accent` | laranja de foco, seleção e navegação ativa |
| `--ui-success` | conclusão e confirmação persistida |
| `--ui-warning` | atenção temporal, como pendência de ontem |
| `--ui-danger` | erro e ação destrutiva |

Os valores finais serão expressos em OKLCH e mapeados a partir das cores atuais para preservar a identidade da marca.

## 6. Hierarquia de ações

### 6.1 Botão primário

- fundo claro neutro e texto escuro;
- usado somente para confirmar uma decisão, como `Criar projeto`, `Salvar` ou `Agendar`;
- no máximo uma ação primária por contexto visível;
- sem glow, gradiente, elevação colorida ou deslocamento no hover.

### 6.2 Botão secundário

- fundo transparente ou superfície discreta;
- borda neutra;
- usado para cancelar, revelar contexto e oferecer alternativa à ação principal.

### 6.3 Ação terciária

- texto ou ícone sem fundo permanente;
- usada para editar, mover, fechar, adicionar item e abrir mais ações;
- recebe superfície sutil apenas em hover, foco ou toque.

### 6.4 Ação destrutiva

- vermelho semântico, sem competir com a ação principal antes da confirmação;
- exclusões importantes exigem confirmação explícita;
- arquivar, remover de uma lista e excluir dados continuam semanticamente diferentes.

### 6.5 Botão de ícone

- ícone padrão de 16 a 18 px;
- área visual de 32 a 36 px no desktop;
- alvo de toque mínimo de 44 px no celular;
- `aria-label` obrigatório quando não houver texto.

### 6.6 Estados obrigatórios

Todos os botões implementam:

- default;
- hover quando aplicável;
- focus-visible;
- pressed;
- disabled;
- loading;
- error quando a ação falha;
- success transitório quando a confirmação precisa ser percebida.

O loading mantém a largura do botão e substitui o conteúdo sem deslocar elementos vizinhos.

## 7. Controles de conclusão

### 7.1 Aparência e alvo

- círculo ou quadrado visual de 18 a 20 px;
- alvo interativo de 44 px no celular;
- o espaço adicional permanece transparente;
- a forma não aumenta no hover;
- foco visível possui contorno externo sem alterar o layout.

### 7.2 Sequência de conclusão

1. o controle responde imediatamente ao toque;
2. o check é desenhado em aproximadamente 120 ms;
3. título e metadados reduzem contraste;
4. o item se move para a seção de concluídos em até 200 ms;
5. um toast oferece `Desfazer` por cinco segundos;
6. em dispositivos compatíveis, uma vibração curta confirma a ação;
7. nenhum som é reproduzido.

Se a API falhar, o item retorna à posição anterior, o checkbox reabre e o erro explica que a conclusão não foi salva.

### 7.3 Linha do tempo de Hoje

Os grandes botões quadrados à direita serão removidos. A conclusão acontecerá no controle próximo ao título. Compromissos não recebem checkbox de tarefa.

### 7.4 Pendências de ontem

- amarelo somente como pequeno indicador de atenção;
- sem fundo ou borda colorida dominante;
- `Manter em Hoje` e `Concluir` como ações textuais compactas;
- a escolha fecha ou reduz o bloco suavemente;
- `Desfazer` disponível para mudanças reversíveis.

## 8. Tarefas, listas e ações contextuais

- clicar ou tocar no corpo da linha abre detalhes;
- o controle de conclusão permanece separado da abertura;
- no desktop, ações secundárias aparecem no hover e no foco interno;
- no celular, deslizar pode revelar ações rápidas e pressionar abre menu contextual;
- menus visíveis permanecem disponíveis para quem não usa gestos;
- arrastar gera apenas elevação discreta e indicação de destino;
- loading preserva posição e altura;
- erros revertem alterações otimistas.

`Adicionar item` começa como ação terciária. Ao ativar, transforma-se no compositor inline sem abrir modal.

## 9. Criação e captura

### 9.1 Captura global

No desktop, a captura abre uma command bar compacta e neutra. No celular, existe uma ação persistente identificada como `Capturar`, com ícone de Inbox. Ela não usa apenas um `+` genérico.

- título criado com `Enter`;
- contexto opcional revelado progressivamente;
- botão de envio aparece somente quando agrega clareza;
- foco usa o laranja apenas no anel acessível;
- não há faixa laranja, fundo marrom ou glow.

### 9.2 Criação contextual

As ações usam rótulos específicos:

- `Nova tarefa`;
- `Novo projeto`;
- `Nova frente`;
- `Nova nota`;
- `Novo hábito`.

No desktop, o texto pode acompanhar o ícone. No celular, o rótulo visível é preferível quando houver mais de um ponto de criação na tela.

### 9.3 Nova tarefa

- compositor inline no topo da lista;
- título como único campo inicial;
- `Adicionar contexto` revela Frente, Projeto e prazo;
- `Enter` cria;
- `Esc` cancela no desktop;
- falha preserva o texto digitado.

### 9.4 Projetos e Frentes

Os fluxos aprovados permanecem. Eles recebem a nova hierarquia de ações, campos, foco, loading e fechamento, sem mudar a arquitetura de criação.

## 10. Superfícies temporárias

| Necessidade | Superfície |
| --- | --- |
| captura e item simples | inline |
| filtro, data e menu curto | popover |
| detalhe no desktop | painel lateral |
| Inbox no desktop | painel lateral temporário |
| escolha curta no celular | bottom sheet |
| edição estruturada no celular | tela cheia |
| confirmação crítica | modal central |

Regras:

- modal não é a escolha inicial;
- não há modal dentro de modal;
- cabeçalho contém título claro e fechar discreto;
- o primeiro campo recebe foco;
- `Esc` fecha superfícies não destrutivas no desktop;
- o teclado móvel não cobre o campo ou ação principal;
- fechar com alterações não salvas pede confirmação;
- fechar sem alterações é imediato;
- o foco retorna ao elemento que abriu a superfície.

## 11. Movimento e resposta

### 11.1 Duração

| Interação | Duração alvo |
| --- | --- |
| hover e pressed | 100 a 120 ms |
| check e seleção | 120 a 160 ms |
| popover e toast | 150 a 180 ms |
| sheet, painel e modal | 180 a 220 ms |
| reorganização de lista | até 200 ms |

Transições usam curvas de saída exponencial, como `cubic-bezier(0.22, 1, 0.36, 1)`. Propriedades de layout não serão animadas diretamente quando `transform` e `opacity` resolverem o mesmo feedback.

### 11.2 Proibições

- bounce;
- elasticidade decorativa;
- glow;
- sombra colorida;
- botão que sobe no hover;
- mudança de tamanho para indicar hover;
- animações de entrada em cascata;
- movimento que bloqueia a próxima ação.

### 11.3 Movimento reduzido e háptica

`prefers-reduced-motion` reduz ou remove transições não essenciais. A vibração curta usa a API disponível no dispositivo como aprimoramento, nunca como único feedback. Falta de suporte não altera a funcionalidade.

## 12. Componentes e limites técnicos

O frontend terá primitivas únicas para:

| Componente | Responsabilidade |
| --- | --- |
| `Button` | hierarquia, estados e loading |
| `IconButton` | ação compacta acessível |
| `CompletionControl` | concluir, reabrir e feedback otimista |
| `Field` | label, descrição, erro e foco |
| `InlineComposer` | criação progressiva em listas |
| `Popover` | menu e escolha contextual curta |
| `Modal` | confirmação crítica e foco bloqueado |
| `Sheet` | painel lateral e bottom sheet responsivo |
| `Toast` | confirmação, erro e desfazer |

A implementação removerá o fundo laranja padrão de `button` e o seletor global de glow. Componentes de rota não devem redefinir a hierarquia completa de botões; podem somente ajustar composição, largura e posicionamento.

## 13. Navegação e escopo por rota

### 13.1 Configurações

- remover da sidebar;
- remover do menu móvel `Mais`;
- remover da paleta de comandos e atalhos de navegação;
- preservar `/configuracoes` e seu código para acesso direto durante esta etapa.

### 13.2 Dashboard

Não recebe redesign estrutural. Botões, campos e superfícies tocados pela migração devem usar as novas primitivas.

### 13.3 Matriz de auditoria

| Rota ou superfície | Desktop | Celular | Prioridades |
| --- | --- | --- | --- |
| Shell e navegação | sim | sim | captura, ícones, Configurações, foco |
| Hoje | sim | sim | rollover, conclusão, adicionar item, Inbox |
| Agenda | sim | sim | criação, menus, controles temporais |
| Tarefas | sim | sim | compositor, checkbox, detalhe, filtros |
| Hábitos | sim | sim | conclusão, edição, criação |
| Frentes | sim | sim | criação e ações contextuais |
| Projetos | sim | sim | wizard, tarefas e ações contextuais |
| Notas | sim | sim | captura, menus, blocos e fullscreen |
| Inbox | sim | sim | captura, processamento e agenda |
| Dashboard | compatibilidade | compatibilidade | novas primitivas onde aplicável |

## 14. Fluxo de dados e erros

Interações reversíveis podem usar atualização otimista:

1. atualizar a interface imediatamente;
2. enviar a mutação à API;
3. confirmar silenciosamente em sucesso;
4. reverter exatamente o estado anterior em falha;
5. manter a ação disponível para nova tentativa.

Conclusão, reordenação, mover entre grupos e manter em Hoje precisam preservar posição, seleção e rolagem durante erro. Criações mantêm o conteúdo digitado. A ação principal mostra loading sem alterar largura.

`Desfazer` executa uma mutação inversa explícita. Não é apenas uma reversão visual local.

## 15. Acessibilidade

- WCAG 2.2 AA como alvo;
- foco visível sem depender de glow;
- contraste adequado em texto, bordas e estados;
- alvos móveis mínimos de 44 px;
- `aria-label` em ações somente com ícone;
- ordem de foco compatível com a ordem visual;
- foco preso apenas em modais realmente bloqueantes;
- menus e popovers navegáveis por teclado;
- gesto, hover e vibração sempre possuem alternativa;
- estados de sucesso e erro anunciados por região viva quando necessário.

## 16. Validação

### 16.1 Testes de componentes

- variantes e estados de `Button` e `IconButton`;
- área interativa e tamanho visual de `CompletionControl`;
- loading sem mudança de largura;
- foco, `Esc` e retorno de foco;
- `Desfazer` com mutação inversa;
- rollback em falha da API;
- movimento reduzido.

### 16.2 Testes de integração

- capturar no desktop e celular;
- criar tarefa inline e revelar contexto;
- concluir e desfazer;
- processar pendência de ontem;
- abrir e fechar Inbox;
- abrir painel de detalhe e preservar rolagem;
- abrir bottom sheet com teclado móvel;
- confirmar que Configurações não aparece na navegação.

### 16.3 Verificação visual

Capturas em pelo menos:

- desktop largo;
- desktop compacto;
- celular de 390 px;
- celular estreito de 360 px.

Cada rota da matriz será verificada nos estados default, hover ou foco, superfície aberta, loading e erro relevante.

## 17. Critérios de aceitação

1. Nenhum botão neutro possui fundo ou glow laranja.
2. Nenhuma tela mostra dois `+` indistinguíveis com funções diferentes.
3. Toda ação de criação contextual comunica o objeto criado.
4. Checkboxes móveis têm alvo mínimo de 44 px e forma visual máxima de 20 px.
5. A linha do tempo não possui grandes botões de conclusão à direita.
6. Pendências de ontem usam ações compactas e indicador de atenção discreto.
7. Captura rápida funciona com `Enter` e preserva texto em falha.
8. Ações reversíveis importantes oferecem `Desfazer` funcional.
9. Hover e gestos possuem alternativa por foco, toque ou menu.
10. Configurações não aparece em navegação, paleta ou atalhos.
11. Todas as rotas da matriz foram verificadas no desktop e celular.
12. Testes existentes continuam passando.
13. O build de produção e a verificação de tipos passam.

## 18. Fora de escopo

- redesenho estrutural do Dashboard;
- alteração funcional de Projetos ou Frentes já aprovados;
- criação de sons de interface;
- remoção da rota ou do código de Configurações;
- mudança de regras de negócio de Hoje, Agenda ou Tarefas;
- novo sistema de gamificação;
- substituição da biblioteca de ícones Lucide já adotada.
