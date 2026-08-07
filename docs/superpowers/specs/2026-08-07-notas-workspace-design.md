# Redesign de Notas — Workspace de pensamento

**Status:** aprovado em conversa em 7 de agosto de 2026  
**Escopo:** Biblioteca, captura rápida, editor de documentos, artefatos embutidos e experiência responsiva de Notas  
**Fora do escopo:** redesign fino das ferramentas internas de diagrama, mapa mental e quadro livre

## 1. Objetivo

Transformar Notas de uma tela tecnicamente capaz, porém carregada e fragmentada, em um espaço que seja agradável de abrir todos os dias para:

1. capturar rapidamente uma ideia;
2. desenvolver um raciocínio ou texto;
3. guardar e reencontrar conhecimento.

Notas deve parecer parte natural do Operis, mas não deve obrigar o usuário a transformar cada pensamento em Frente, Projeto ou Tarefa. Esses vínculos continuam disponíveis como contexto opcional.

## 2. Problema atual

A implementação atual concentra aproximadamente 6.900 linhas em `apps/web/src/pages/notas.tsx` e apresenta muitas capacidades ao mesmo tempo: navegador de pastas, coleções inteligentes, editor, templates, metadados, histórico, ditado, exportação e quatro modos de canvas.

O problema não é falta de funcionalidade. É falta de uma ação dominante. A interface exige que o usuário compreenda a arquitetura interna antes de simplesmente registrar ou desenvolver uma ideia.

Os quatro modos fixos — texto, diagrama, mapa mental e quadro branco — também dividem artificialmente um único assunto. Uma reunião pode conter texto, um funil desenhado e um diagrama. O usuário pensa nisso como uma nota, não como três documentos paralelos.

## 3. Princípios aprovados

- **Captura antes de classificação:** nenhuma pasta, tag ou título é obrigatório no momento da captura.
- **Profundidade progressiva:** Biblioteca → documento → artefato em foco.
- **Um assunto, vários modos de pensar:** elementos visuais são blocos vivos do documento.
- **Pastas continuam básicas:** são uma estrutura familiar e opcional, não um pedágio.
- **Trabalho antes do chrome:** menus, metadados e ferramentas aparecem somente quando necessários.
- **Alta densidade legível:** listas comparáveis substituem mosaicos de cards.
- **Mesmo modelo no desktop e no celular:** o mobile reduz colunas, não capacidades essenciais.
- **Preservação de dados:** o redesign reorganiza recursos existentes sem descartar conteúdo.

## 4. Referências visuais e o que aproveitar

As referências abaixo sustentam decisões específicas. O objetivo não é clonar um aplicativo inteiro.

### 4.1 Craft — documento como superfície principal

![Interface oficial do Craft](https://www.craft.do/craft_og.png)

Fonte: [Craft — Productivity App for Notes, Tasks, and Docs](https://www.craft.do/) e [Craft Quick Actions](https://support.craft.do/en/introduction/mobile-features/quick-actions).

O que aproveitar:

- foco tipográfico quando o documento está aberto;
- ferramentas progressivas em vez de uma barra sempre carregada;
- captura rápida que evita trocar de contexto;
- experiência coerente entre desktop e mobile.

### 4.2 Apple Notes — estrutura familiar e recuperação imediata

![Apple Notes na App Store](https://is1-ssl.mzstatic.com/image/thumb/Features122/v4/a7/0f/28/a70f28a5-22c2-efef-7c4a-41404f6c9c33/b256cbaa-d9cc-40dc-ac66-e8aa9af8107a.png/800x450MC.ApSCFB01.webp)

Fonte: [Apple Notes na App Store](https://apps.apple.com/us/app/notes/id1110145109) e [guia oficial de Quick Note](https://support.apple.com/en-gb/guide/notes/apdf028f7034/mac).

O que aproveitar:

- pastas como conceito básico e compreensível;
- captura separada da organização posterior;
- lista de notas com título, trecho e atualização;
- navegação previsível no celular.

### 4.3 Capacities — caixa de entrada para pensamentos

![Daily note e inbox de pensamentos no Capacities](https://capacities.io/_ipx/w_1792&f_webp&q_85&fit_inside/landing-page-screenshots/inbox-for-thoughts.jpg)

Fonte: [Capacities — Product](https://capacities.io/product).

O que aproveitar:

- um ponto de entrada rápido para pensamentos ainda não organizados;
- conteúdo rico sem exigir classificação antecipada;
- busca e relações como apoio à memória, sem substituir a estrutura simples.

### 4.4 Excalidraw — espaço visual realmente utilizável

![Canvas oficial do Excalidraw](https://excalidraw.com/og-image-3.png)

Fonte: [Excalidraw Whiteboard](https://excalidraw.com/).

O que aproveitar:

- o canvas precisa de praticamente toda a viewport;
- controles ficam nas bordas e o conteúdo ocupa o centro;
- voltar ao documento deve preservar o artefato e o contexto de edição.

## 5. Arquitetura da experiência

### 5.1 Nível 1 — Biblioteca

A rota `/notas` abre a Biblioteca dentro do shell normal do Operis. Ela possui:

1. título e busca global em Notas;
2. caixa de captura rápida;
3. filtros compactos de pasta;
4. lista densa de notas recentes;
5. ação secundária de criar uma nota vazia ou a partir de template.

Não existe uma segunda sidebar permanente. O shell do Operis já ocupa esse papel. Pastas aparecem como uma faixa compacta na Biblioteca e, quando selecionadas, filtram a lista no mesmo espaço.

As visualizações sintéticas `Inbox`, `Fixadas` e `Recentes` permanecem. Coleções especializadas como `Longas` viram filtros da busca avançada e deixam de ocupar a navegação principal.

### 5.2 Nível 2 — Documento

Ao abrir uma nota, o conteúdo principal vira o documento. A Biblioteca deixa de competir visualmente com ele.

O cabeçalho contém apenas:

- voltar para a Biblioteca;
- caminho ou pasta atual;
- estado de salvamento;
- menu de ações secundárias.

O documento usa largura confortável de leitura. Título, data e chips essenciais aparecem no início; propriedades completas ficam em `Detalhes`.

Texto, listas, tabelas, arquivos e artefatos visuais convivem na mesma sequência de blocos. O botão `+` e o comando `/` abrem o menu de inserção no ponto atual.

### 5.3 Nível 3 — Artefato em foco

Um diagrama, mapa mental ou quadro livre aparece no documento como um bloco com:

- título;
- tipo;
- prévia somente leitura;
- ação `Abrir em foco`.

Ao abrir, o artefato ocupa a página inteira. Apenas uma barra superior discreta permanece para mostrar o nome, o estado de salvamento e a ação de voltar.

O shell, a sidebar e a navegação inferior do Operis ficam ocultos durante esse modo. Isso é obrigatório, não uma preferência responsiva.

Ao voltar:

- a nota reaparece usando o identificador do bloco como âncora de rolagem;
- o foco retorna ao bloco que abriu o artefato; se esse bloco tiver sido removido em outra aba, o foco vai para o bloco válido mais próximo;
- a prévia do artefato reflete a versão salva mais recente;
- o artefato continua exatamente na posição em que foi inserido.

Não será usado um modal pequeno ou um editor apenas ligeiramente maior que a prévia.

## 6. Captura rápida

### 6.1 Comportamento

- `Enter` captura.
- `Shift+Enter` cria uma nova linha.
- Enquanto um método de composição de texto estiver ativo, `Enter` não envia.
- Cada envio cria uma nota independente.
- A nota nasce na visualização sintética `Inbox`, representada por `folderId = null`.
- A primeira frase ou primeira linha não vazia, limitada a 96 caracteres, vira o título.
- O conteúdo que exceder o título vira o corpo. Uma captura curta pode resultar em uma nota somente com título.
- Após sucesso, o campo é limpo e mostra `Capturado · Abrir` por alguns segundos.
- `Abrir` leva diretamente ao documento recém-criado.

### 6.2 Falha de captura

Se a requisição falhar, o texto permanece no campo e também é guardado como rascunho local. A interface mostra `Não foi possível capturar · Tentar novamente`. Um novo envio não pode sobrescrever o rascunho anterior.

## 7. Organização e recuperação

### 7.1 Pastas

- Pastas existentes e aninhadas são preservadas.
- A Biblioteca mostra primeiro as pastas de nível superior.
- Pastas aninhadas aparecem ao abrir ou gerenciar a pasta pai; não ficam expandidas permanentemente.
- Mover uma nota de Inbox para uma pasta é uma ação posterior e opcional.

### 7.2 Busca

A busca cobre título, texto extraído, tags, pasta e títulos dos artefatos. Resultados aparecem em lista e destacam o trecho correspondente.

Filtros avançados incluem:

- pasta;
- tipo da nota;
- tags;
- período de atualização;
- fixadas;
- notas longas;
- vínculo opcional com Frente, Projeto ou Tarefa.

### 7.3 Relações com o Operis

Vínculos com Frente, Projeto ou Tarefa continuam disponíveis em `Detalhes`. Eles não aparecem como requisito da captura nem como protagonista do editor.

Notas relacionadas e backlinks aparecem no final do documento ou em painel sob demanda, nunca no topo da escrita.

## 8. Hierarquia dos recursos existentes

### Sempre visível

- captura;
- busca;
- Inbox;
- pastas;
- recentes;
- editor;
- inserção de blocos.

### Sob demanda

- fixar;
- mover;
- tags;
- ditado e gravação;
- anexos;
- templates;
- exportação e compartilhamento;
- histórico e checkpoints;
- detalhes e vínculos;
- notas relacionadas.

### Incorporado ao documento

- diagrama;
- mapa mental;
- quadro livre;
- futuros artefatos visuais.

As abas fixas `Texto`, `Diagrama`, `Mapa mental` e `Whiteboard` deixam de existir. Esses recursos passam a ser blocos do documento.

## 9. Comportamento responsivo

### Desktop

- O shell principal e sua sidebar permanecem.
- A Biblioteca usa uma única área principal; não há navegador, lista e editor permanentes ao mesmo tempo.
- A nota aberta mantém a sidebar do Operis, mas usa todo o restante da largura.
- O artefato em foco oculta a sidebar e o restante do chrome do Operis para maximizar o canvas.

### Mobile

- Biblioteca, documento e artefato são três telas de uma coluna.
- Cada toque avança um nível; voltar retorna exatamente ao nível e posição anteriores.
- A captura permanece no topo da Biblioteca.
- Busca e nova nota ficam no cabeçalho.
- O menu de inserção fica alcançável próximo à parte inferior do editor.
- O artefato usa toda a viewport disponível, com controles adaptados para toque.

## 10. Arquitetura técnica

### 10.1 Estado atual aproveitado

O modelo `Note` já armazena `contentBlocks`, texto extraído, HTML derivado e versão do conteúdo. O editor BlockNote e o menu `/` também já existem.

Atualmente, `Diagram`, `MindMap` e `Whiteboard` possuem relação um-para-um com `Note`. Isso impede múltiplos artefatos do mesmo tipo e não registra sua posição dentro do documento.

### 10.2 Modelo de domínio alvo

`Note` permanece como raiz do agregado. Um novo modelo `NoteArtifact` possui relação um-para-muitos com a nota:

- `id`;
- `noteId`;
- `kind`: `diagram`, `mindmap` ou `whiteboard`;
- `title`;
- `data` em JSON;
- `createdAt`;
- `updatedAt`.

Um bloco customizado `operisArtifact` é adicionado ao schema do editor. Suas propriedades mínimas são:

- `artifactId`;
- `artifactKind`;
- `title`.

A posição do bloco em `contentBlocks` define a posição do artefato na nota. O JSON pesado do canvas não é duplicado dentro do documento.

A prévia usa o renderer do próprio artefato em modo somente leitura e é carregada somente quando o bloco entra ou se aproxima da viewport.

Um modelo `NoteArtifactRevision` guarda os snapshots necessários para checkpoints e restaurações. Cada registro referencia `noteRevisionId` e `artifactId`, além de copiar tipo, título e dados do artefato naquele instante.

### 10.3 Histórico

Autosaves atualizam o conteúdo corrente e não criam revisões a cada tecla, preservando o comportamento atual.

Um checkpoint manual cria, em uma única operação lógica:

1. `NoteRevision` para documento e metadados;
2. snapshots dos `NoteArtifact` vinculados naquele instante.

Uma restauração primeiro cria um backup do estado corrente e depois restaura documento e artefatos. Falha parcial deve reverter a transação.

### 10.4 Migração compatível

Na migração inicial:

1. cada registro existente de `Diagram`, `MindMap` e `Whiteboard` gera um `NoteArtifact` correspondente;
2. um bloco `operisArtifact` é anexado ao final da nota quando não houver referência equivalente;
3. a ordem de anexação é diagrama, mapa mental e quadro livre;
4. tabelas e relações legadas permanecem disponíveis como fallback durante toda a primeira versão de produção deste redesign;
5. a remoção definitiva do legado será uma mudança posterior e separada.

O processo precisa ser idempotente: executá-lo novamente não pode duplicar artefatos nem blocos.

## 11. Componentes e limites de responsabilidade

A página monolítica será dividida em unidades com propósito único:

- `NotesLibraryPage`: coordena estado da Biblioteca e rota selecionada;
- `QuickCapture`: controla rascunho, envio, confirmação e retry;
- `FolderFilterStrip`: navegação compacta de pastas;
- `NotesList`: lista, ordenação e estados vazios;
- `NoteWorkspacePage`: coordena uma nota aberta;
- `NoteDocumentEditor`: integra BlockNote, seleção e autosave textual;
- `ArtifactBlock`: prévia, título e abertura em foco;
- `ArtifactWorkspace`: carrega a ferramenta visual apropriada e controla retorno;
- `NoteDetailsPanel`: pasta, tags, tipo e vínculos opcionais;
- `NoteHistoryPanel`: checkpoints, comparação e restauração;
- hooks de dados separados para Biblioteca, rascunho da nota e rascunho do artefato.

O arquivo de rota apenas compõe esses módulos e trata navegação. Estado de edição não deve ficar concentrado novamente em um único componente.

## 12. Fluxos de dados

### 12.1 Abrir e editar uma nota

1. A Biblioteca carrega metadados e trechos, não todos os documentos completos.
2. Ao abrir, a nota e seus artefatos referenciados são buscados.
3. O editor mantém um rascunho local e agenda autosave com debounce.
4. O servidor normaliza blocos e deriva texto e HTML para busca e exportação.
5. A confirmação do servidor atualiza o estado para `Salvo`.

### 12.2 Inserir um artefato

1. O usuário escolhe `/diagrama`, `/mapa mental` ou `/quadro`.
2. O servidor cria um `NoteArtifact` vazio.
3. O editor insere o bloco de referência no ponto atual.
4. Se uma das duas operações falhar, a interface oferece retry e não deixa uma referência quebrada.
5. O clique no bloco abre `ArtifactWorkspace` com o `artifactId`.

### 12.3 Salvar um artefato

1. A ferramenta visual mantém seu próprio rascunho.
2. Alterações são salvas com debounce independente do documento.
3. Ao voltar, um último flush é solicitado.
4. A nota é restaurada na posição anterior e a prévia é invalidada.
5. Se o flush falhar, o rascunho local é mantido e a nota exibe o bloco com estado `Alterações pendentes`.

## 13. Estados de erro e recuperação

- **Biblioteca indisponível:** mantém o shell e oferece retry; não simula lista vazia.
- **Nota não encontrada:** volta à Biblioteca com aviso claro.
- **Autosave textual falhou:** preserva rascunho local, mostra estado persistente e tenta novamente sem duplicar revisões.
- **Autosave do artefato falhou:** mantém canvas local e bloqueia descarte silencioso.
- **Referência quebrada:** o bloco mostra `Artefato indisponível`, com retry e opção de remover somente a referência.
- **Conteúdo excede o limite:** informa o bloco ou anexo responsável quando identificável; o restante do documento permanece editável.
- **Conflito entre abas:** compara a versão base; não sobrescreve silenciosamente uma versão mais nova.
- **Restauração falhou:** a transação é revertida e o estado corrente continua acessível.

## 14. Acessibilidade e comandos

- Toda ação possui nome acessível e ícone da biblioteca já adotada pelo Operis.
- `Enter` e `Shift+Enter` seguem o comportamento definido da captura.
- `/` abre o menu de blocos; setas navegam; `Enter` confirma; `Esc` fecha.
- `Esc` também volta do artefato em foco quando não houver diálogo aberto.
- O foco retorna ao bloco que abriu o artefato.
- Contraste, foco visível e alvos de toque seguem os padrões globais do aplicativo.
- Animações respeitam `prefers-reduced-motion`.

## 15. Estratégia de testes

### Unidade

- derivação de título e corpo da captura;
- serialização do bloco `operisArtifact`;
- idempotência da conversão do legado;
- reducers ou hooks de estados de autosave;
- busca e filtros de pasta.

### Integração da API

- criação de captura em Inbox;
- criação de múltiplos artefatos do mesmo tipo;
- validação de propriedade da nota e do artefato;
- checkpoint e restauração transacional;
- migração sem duplicação;
- conflitos de versão e limites de payload.

### Componente e interação

- captura com Enter, Shift+Enter e composição de texto;
- abertura da nota e retorno à mesma lista e rolagem;
- inserção, reordenação e exclusão de referência de artefato;
- abertura em tela cheia e retorno ao mesmo bloco;
- estados `Salvando`, `Salvo`, `Falhou` e retry;
- menus e navegação por teclado.

### Fluxo ponta a ponta

- desktop e mobile;
- captura → abrir → desenvolver → inserir quadro → editar em foco → voltar;
- falha de rede durante documento e canvas;
- restauração de checkpoint com artefatos;
- abertura de uma nota migrada do modelo antigo.

## 16. Critérios de aceite

O redesign está concluído quando:

1. uma ideia pode ser capturada sem título, pasta ou modal;
2. a Biblioteca não mantém três painéis permanentes;
3. abrir uma nota transforma a área principal em documento;
4. múltiplos artefatos, inclusive do mesmo tipo, podem existir na mesma nota;
5. cada artefato aparece no ponto correto e abre em uma superfície de edição de tela inteira;
6. voltar restaura nota, posição e foco sem perder alterações;
7. pastas continuam disponíveis, porém opcionais;
8. recursos secundários não competem com captura e escrita;
9. dados e canvases existentes são preservados pela migração compatível;
10. os fluxos essenciais passam nos testes de desktop e mobile.

## 17. Fora do escopo desta entrega

- redesign interno completo do Excalidraw ou dos editores de diagrama e mapa mental;
- colaboração simultânea entre usuários;
- sincronização offline completa entre dispositivos;
- grafo de conhecimento como navegação principal;
- remoção definitiva das tabelas legadas de canvas;
- IA como protagonista da Biblioteca ou do editor;
- redesign fino de tipografia, cores e microanimações de todo o Operis.
