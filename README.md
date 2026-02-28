# Execution OS

Execution OS é um sistema operacional pessoal de execução estratégica, focado em transformar planejamento em execução mensurável.

## Escopo deste MVP

Este repositório inicial entrega a espinha dorsal técnica para:

- Workspaces (`empresa`, `pessoal`, `geral`)
- Projetos com dependências
- Tarefas com timeline, janela e campo `waiting_on_person`
- Planejamento diário (`day_plans` + `day_plan_items`)
- Inbox GTD simplificada
- Gamificação (score, streak, dívida de execução)
- Pipeline de eventos com RabbitMQ
- Endpoint webhook para integração WhatsApp (via n8n ou Evolution API direta)

## Arquitetura

- `apps/api`: API Fastify + Prisma/PostgreSQL
- `apps/worker`: Worker Node para eventos assíncronos (RabbitMQ)
- `apps/web`: Frontend React com páginas iniciais dos épicos
- `docker-compose.yml`: PostgreSQL + RabbitMQ

## Setup rápido

1. Copie variáveis:
   - `cp .env.example .env`
2. Suba infra local:
   - `docker compose up -d`
   - Requisito: Docker Desktop (ou Colima) instalado no host
3. Instale dependências:
   - `npm install`
4. Rode migração Prisma:
   - `npm run prisma:migrate --workspace @execution-os/api`
5. Rode seed inicial:
   - `npm run seed --workspace @execution-os/api`
6. Inicie serviços:
   - API: `npm run dev:api`
   - Worker: `npm run dev:worker`
   - Web: `npm run dev:web`

## Deploy em VPS (Portainer)

Arquivos de produção:

- `docker-compose.prod.yml`
- `.env.production.example` (copie para `.env.production`)
- `Dockerfile.api`
- `Dockerfile.worker`
- `Dockerfile.web`

Passos:

1. Ajuste variáveis:
   - `cp .env.production.example .env.production`
   - atualize `VITE_API_URL`, `WHATSAPP_TRANSPORT` e webhooks do n8n.
2. Suba stack:
   - `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`
3. Verifique saúde:
   - API: `GET /health` na porta `3000`
   - Web: `GET /health` na porta `8080`

## Deploy em Swarm + Traefik

Para stack no Portainer com domínio único (`/` + `/api`), use:

- `docker-compose.swarm.yml`
- `.env.swarm.example`
- Guia completo: `docs/deploy-swarm-portainer.md`

## Integração WhatsApp (n8n como gateway)

Recomendado para produção:

1. `worker` envia para webhook de saída do seu n8n.
2. n8n encaminha para Evolution API.
3. Evolution envia eventos para n8n.
4. n8n normaliza e envia para `POST /webhooks/whatsapp` da API.

Variáveis importantes:

- `WHATSAPP_TRANSPORT=n8n`
- `WHATSAPP_OUTBOUND_WEBHOOK_URL=<url webhook de saída no n8n>`
- `WHATSAPP_OUTBOUND_WEBHOOK_SECRET=<segredo compartilhado com n8n>` (opcional)
- `WHATSAPP_WEBHOOK_SECRET=<segredo para inbound n8n -> api>` (opcional)

Payload inbound aceito no endpoint `/webhooks/whatsapp`:

```json
{
  "from": "5511999999999",
  "message": "fiz a1b2c3d4",
  "externalMessageId": "wamid.XXX"
}
```

Também aceita variações (`phone/text`) e payload aninhado, mas a recomendação é o n8n normalizar nesse formato.

## Fluxo Git (casa/trabalho)

Use o script abaixo para sincronizar com segurança:

- `./scripts/git-sync.sh`
  - Atualiza `main` e, se você estiver em uma branch de feature, atualiza essa branch também.
- `./scripts/git-sync.sh codex/minha-feature`
  - Atualiza `main` e a branch informada.

Regras do script:

- Exige árvore limpa (sem mudanças locais não commitadas).
- Usa `git fetch --prune` e `git pull --rebase`.
- Se a branch de feature não existir no remoto, ele avisa e segue sem falhar.

## Eventos planejados (RabbitMQ)

- `schedule_block_start`
- `schedule_block_end`
- `send_whatsapp_message`
- `process_whatsapp_reply`
- `update_gamification`
- `waiting_followup_check`

## Próximas entregas

- Drag-and-drop completo na timeline
- Regras de não sobreposição no frontend em tempo real
- Fluxo completo de check-in/check-out WhatsApp com estado conversacional
- Motor de agendamento recorrente por timezone
- Relatório semanal comparativo (4 semanas)

## Documentação complementar

- Arquitetura: `docs/architecture.md`
- Endpoints: `docs/api-endpoints.md`
