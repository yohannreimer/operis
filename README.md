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
- Endpoint webhook para integração WhatsApp (Evolution API)

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
- Integração real com Evolution API (envio/recebimento)
- Motor de agendamento recorrente por timezone
- Relatório semanal comparativo (4 semanas)

## Documentação complementar

- Arquitetura: `docs/architecture.md`
- Endpoints: `docs/api-endpoints.md`
