# Recuperação do Clerk sob CSP

## Contexto

O frontend publicado responde normalmente, assim como `/api/health`, mas a aplicação autenticada não conclui a inicialização. O commit `7abfcff` adicionou ao Nginx a diretiva `script-src 'self'`. O bundle publicado usa `@clerk/react` e a chave atual aponta para `discrete-peacock-45.clerk.accounts.dev`, de onde o Clerk carrega seu runtime. Esse carregamento remoto é bloqueado pela CSP.

## Solução aprovada

Manter a política restritiva e autorizar somente os hosts necessários ao Clerk:

- o Frontend API atual, `https://discrete-peacock-45.clerk.accounts.dev`;
- `https://challenges.cloudflare.com`, usado pela proteção contra abuso;
- `https://*.protect.clerk.com`, usado pelas proteções do Clerk;
- workers de mesma origem e `blob:`;
- frames de mesma origem e dos hosts de proteção.

Não serão adicionados `unsafe-inline`, `unsafe-eval` nem uma permissão genérica para scripts HTTPS.

## Arquivos e responsabilidades

- `ops/nginx-web.conf`: define a CSP enviada pelo container do frontend.
- `apps/web/src/security-headers.test.ts`: impede regressões na integração entre a CSP e o Clerk.

## Verificação

O teste deve falhar contra a configuração atual, passar após a correção e confirmar tanto as permissões necessárias quanto a ausência de permissões amplas para scripts. O build completo do frontend deve continuar passando. Após o deploy, o cabeçalho publicado deve conter as novas fontes e a tela de autenticação deve deixar o estado permanente de carregamento.

