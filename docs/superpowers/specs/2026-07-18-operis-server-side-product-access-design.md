# Operis: validação de acesso no servidor

## Objetivo

Evitar o redirecionamento ao Hub antes que o Operis faça uma requisição ao
próprio backend, sem reduzir a validação de permissão da Prymeira Account.

## Diagnóstico

O frontend do Operis chama `access-check` ao concluir o login e redireciona
imediatamente quando recebe uma negação. Esse fluxo antecede a primeira
requisição protegida do produto.

O padrão usado pelo Prymeira Talk é diferente: o frontend só aguarda o Clerk;
o backend consulta `access-check` em cada rota protegida. Uma negação produz
`403`, que o cliente trata como redirecionamento ao Hub.

## Decisão

O Operis seguirá o padrão do Talk:

1. `AuthSync` continuará apenas registrando o fornecedor de token Clerk para
   o cliente HTTP.
2. Rotas protegidas do frontend serão exibidas após o login Clerk, sem uma
   consulta direta do navegador à Prymeira Account.
3. `requireAuth` continuará validando o token Clerk e chamando
   `checkPrymeiraProductAccess` para todas as rotas não públicas.
4. Quando o backend responder `403` com `productAccessRequired`, o cliente
   HTTP continuará redirecionando para a página de acesso do Hub.

## Segurança e erros

Não haverá acesso a dados ou ações protegidas sem uma resposta permitida do
Hub: todas elas passam pelo middleware do backend. Falhas da Prymeira Account
continuam retornando `503`, sem conceder acesso.

## Verificação

- Atualizar testes do fluxo de autenticação do frontend para garantir que a
  montagem autenticada não consulta nem redireciona via `access-check`.
- Manter ou adicionar cobertura para o `403` de acesso de produto do backend
  e para o redirecionamento disparado pelo cliente HTTP.
- Executar os testes direcionados e a verificação de tipos/build disponível.
