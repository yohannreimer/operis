# Notas: artefatos visuais abertos e continuação de escrita

## Problema

O documento atual representa diagramas, mapas mentais e quadros livres como pequenos cartões de anexo com a ação “Abrir”. Isso esconde o conteúdo visual e quebra a ideia aprovada de uma nota formada por diferentes maneiras de pensar sobre o mesmo assunto. Também não existe uma continuação textual evidente depois do último artefato: o botão `+` isolado não comunica onde o próximo texto será inserido.

## Resultado esperado

Um artefato visual participa do fluxo do documento como conteúdo aberto, não como arquivo anexado. O usuário lê a prévia no lugar em que ela foi inserida, abre a edição em tela cheia quando precisa manipulá-la e continua escrevendo imediatamente abaixo ao retornar.

## Bloco visual aberto

Cada bloco `operisArtifact` renderiza:

1. Um cabeçalho compacto com o tipo, o título e a ação “Editar em tela cheia”.
2. Uma prévia real e atualizada do artefato, ocupando toda a largura útil do documento.
3. A ação de exclusão como controle secundário, disponível por foco ou hover, sem competir com o conteúdo.

A prévia usa o mesmo dado persistido pelo editor em foco e é somente leitura. Diagramas, mapas mentais e quadros livres não podem capturar edição, atalhos ou gestos de criação dentro da nota. Clicar na área visual ou em “Editar em tela cheia” abre a rota de foco existente. Ao retornar, o bloco busca a versão atualizada e mantém o foco próximo ao artefato de origem.

No desktop, a prévia terá entre 280 e 340 px de altura. No celular, terá uma altura menor, mas continuará aberta e legível. Barras de ferramentas, minimapas e controles próprios do editor em foco não aparecem na prévia.

## Continuação do documento

Todo artefato deve ter um bloco de parágrafo editável imediatamente depois dele. Quando vazio, esse parágrafo exibe o placeholder “Continue escrevendo…”. O usuário pode clicar diretamente nessa linha e digitar; Enter cria o próximo bloco seguindo o comportamento normal do BlockNote.

Ao inserir um novo artefato pelo menu de barra ou pela ação de inserção:

- o artefato ocupa a posição atual do documento;
- um parágrafo vazio é criado logo depois;
- o cursor é movido para esse parágrafo após a criação;
- abrir o modo foco é opcional e não elimina o ponto de continuação.

Na hidratação de notas antigas, cada artefato que não tenha um parágrafo imediatamente depois receberá um. Isso também separa artefatos antigos que estejam adjacentes. O processo deve ser idempotente para não criar novos parágrafos a cada abertura.

## Ação de inserção

O `+` externo deixa de aparecer isolado abaixo do documento. A criação de diagramas, mapas mentais, quadros livres e ditado permanece disponível pelo menu `/` do editor e por uma ação discreta associada ao ponto de escrita atual. No celular, a ação pode continuar flutuante, mas deve se identificar como “Inserir” e operar sobre a posição atual do cursor.

## Dados e carregamento

O bloco recebe o `noteId` pelo contexto do documento e carrega o detalhe do artefato pelo endpoint existente. A prévia apresenta um esqueleto silencioso durante o carregamento e uma falha compacta com “Tentar novamente” quando necessário. O detalhe carregado fica em cache durante a sessão do documento para evitar requisições repetidas.

Ao retornar do modo foco, o cache do artefato aberto é invalidado para que a prévia reflita a edição recém-salva.

## Acessibilidade

- A prévia possui nome acessível com tipo e título.
- A ação principal anuncia “Editar [tipo] [título] em tela cheia”.
- O parágrafo posterior é um bloco textual normal do editor, com navegação por teclado preservada.
- A prévia somente leitura não entra na sequência de foco com controles internos ocultos.
- Estados de carregamento e falha usam semântica de status sem interromper a escrita.

## Validação

Os testes devem comprovar:

1. Artefatos existentes carregam uma prévia real em vez do cartão de anexo.
2. A prévia abre o editor em foco e atualiza ao retornar.
3. Inserir um artefato cria exatamente um parágrafo posterior e move o cursor para ele.
4. Reabrir uma nota antiga não duplica o parágrafo de continuação.
5. A prévia é somente leitura e não dispara autosave ao montar.
6. O fluxo funciona em desktop e em 390 px sem esconder o conteúdo ou o ponto de continuação.

## Fora de escopo

- Edição direta do canvas dentro do documento.
- Colaboração simultânea dentro da prévia.
- Geração e armazenamento de thumbnails no servidor.
- Mudanças nos editores de tela cheia além do necessário para oferecer uma renderização compacta e somente leitura.
