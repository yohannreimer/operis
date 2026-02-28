# Deploy no Portainer (Swarm + Traefik)

Este guia sobe o app em:

- Frontend: `https://pluris.yrdnegocios.com.br`
- API: `https://pluris.yrdnegocios.com.br/api`

## Pré-requisitos

1. Swarm ativo.
2. Rede externa Traefik já criada:
   - `network_swarm_public`
3. DNS `A` de `pluris.yrdnegocios.com.br` apontando para o servidor Traefik.

## 1) Imagens no GHCR

As imagens são publicadas pelo workflow:

- `.github/workflows/docker-publish.yml`

Após push no `main`, confira no GitHub Actions se o job concluiu e gerou:

- `ghcr.io/yohannreimer/pluris-api:latest`
- `ghcr.io/yohannreimer/pluris-worker:latest`
- `ghcr.io/yohannreimer/pluris-frontend:latest`

## 2) Stack no Portainer

1. `Stacks` -> `Add stack`
2. Nome: `pluris`
3. Build method: `Repository`
4. Repository URL:
   - `https://github.com/yohannreimer/operis.git`
5. Reference:
   - `main`
6. Compose path:
   - `docker-compose.swarm.yml`
7. Environment variables:
   - copie de `.env.swarm.example`
   - ajuste `DOMAIN`, `DEFAULT_PHONE_NUMBER` e webhooks do n8n
8. Deploy

## 3) Testes

1. Front:
   - `https://pluris.yrdnegocios.com.br`
2. API:
   - `https://pluris.yrdnegocios.com.br/api/health`
3. n8n inbound -> app:
   - URL no node `Forward to Execution OS`:
   - `https://pluris.yrdnegocios.com.br/api/webhooks/whatsapp`

## Observações

1. O middleware Traefik remove o prefixo `/api` antes de chegar na API.
2. `WHATSAPP_WEBHOOK_SECRET` e `WHATSAPP_OUTBOUND_WEBHOOK_SECRET` podem ficar vazios no modo single-user.
