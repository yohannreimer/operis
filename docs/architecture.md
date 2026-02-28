# Arquitetura MVP - Execution OS

## Componentes

- Web (`apps/web`): interface para dashboard, planejamento e operação diária.
- API (`apps/api`): regras de negócio, persistência e webhook WhatsApp.
- Worker (`apps/worker`): consumo de eventos RabbitMQ para automações e check-ins.
- n8n (externo): gateway de transporte para WhatsApp (entrada/saída).
- PostgreSQL: persistência principal.
- RabbitMQ: fila de eventos assíncronos.

## Fluxo principal de execução

1. Usuário planeja o dia em `day_plan_items`.
2. API publica `schedule_block_start` e `schedule_block_end`.
3. Worker envia mensagens de início/fim no WhatsApp.
4. Resposta do usuário entra no webhook:
   - comando normal (`fiz`, `adiar`, `capturar`, etc.)
   - resposta de check-in (`1|2|3|4 <dayPlanItemId>`) vira evento `process_whatsapp_reply`
5. Worker atualiza tarefa e gamificação.

## Fluxo de integração recomendado (n8n)

1. `apps/worker` publica outbound para webhook do n8n.
2. n8n entrega para Evolution API.
3. Evolution dispara eventos para n8n.
4. n8n normaliza payload e chama `POST /webhooks/whatsapp` na API.
5. API deduplica inbound por `externalMessageId` (com fallback temporal) e aciona filas.

## Regras implementadas

- Blocos fixos não podem ser sobrepostos.
- Tarefa concluída entra em `feito` com timestamp.
- Endpoint de manutenção arquiva tarefas concluídas há mais de 24h.
- Follow-up "Aguardando Fulano" é disparado via evento com prioridade.

## Limitações deste MVP

- Reagendamento automático avançado ainda não foi implementado.
- Deduplicação inbound de webhook é em memória (suficiente para instância única; para escala horizontal, persistir em banco/cache).
- Comparação histórica de 4 semanas no frontend é placeholder visual (a base de analytics ainda não foi criada).
