# API Endpoints (MVP)

## Health
- `GET /health`

## Workspaces
- `GET /workspaces`
- `POST /workspaces`

## Projetos
- `GET /projects?workspaceId=<uuid>`
- `POST /projects`

## Tarefas
- `GET /tasks?workspaceId=<uuid>&projectId=<uuid>&status=hoje&horizon=active&waitingOnly=true`
- `POST /tasks`
- `PATCH /tasks/:taskId`
- `POST /tasks/:taskId/complete`
- `POST /tasks/:taskId/postpone`
- `POST /tasks/:taskId/dependencies`
- `POST /tasks/:taskId/waiting-followup`
- `POST /tasks/archive-completed`

## Planejamento diário
- `GET /day-plans/:date` (`YYYY-MM-DD`)
- `POST /day-plans/:date/items`
- `POST /day-plan-items/:id/confirmation`
- `PATCH /day-plan-items/:id`
- `DELETE /day-plan-items/:id`

## Blocos recorrentes
- `GET /recurring-blocks`
- `POST /recurring-blocks`
- `POST /recurring-blocks/apply/:date`

## Inbox
- `GET /inbox`
- `POST /inbox`
- `POST /inbox/:id/process`

## Gamificação
- `GET /gamification`
- `GET /gamification/details`

## Webhook WhatsApp
- `POST /webhooks/whatsapp`
- Header obrigatório: `x-webhook-secret`
