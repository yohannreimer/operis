# Workflows n8n prontos (Execution OS + Evolution)

Esta pasta traz os 2 fluxos necessários para usar **n8n apenas como intermediador**:

1. `workflow-whatsapp-outbound.json`
   - Recebe envio do `worker` do Execution OS
   - Encaminha para Evolution API
2. `workflow-whatsapp-inbound.json`
   - Recebe eventos da Evolution API
   - Normaliza payload
   - Encaminha para `POST /webhooks/whatsapp` da API do Execution OS

## Variáveis de ambiente no n8n

Configure no ambiente/container do n8n:

- `EVOLUTION_API_URL`
- `EVOLUTION_INSTANCE`
- `EVOLUTION_API_KEY`
- `EXECUTION_OS_API_URL`
- `N8N_OUTBOUND_SECRET` (opcional; se vazio, outbound não valida segredo)
- `EXECUTION_OS_WEBHOOK_SECRET` (opcional; se vazio, a API não valida segredo)
- `N8N_INBOUND_SECRET` (opcional; se vazio, inbound não valida segredo)

## Variáveis no Execution OS (`.env`)

- `WHATSAPP_TRANSPORT=n8n`
- `WHATSAPP_OUTBOUND_WEBHOOK_URL=https://SEU-N8N/webhook/execution-os-outbound`
- `WHATSAPP_OUTBOUND_WEBHOOK_SECRET=<igual ao N8N_OUTBOUND_SECRET>` (opcional)
- `WHATSAPP_WEBHOOK_SECRET=<igual ao EXECUTION_OS_WEBHOOK_SECRET>` (opcional)

## Importação no n8n

1. Abra `Workflows` -> `Import from file`.
2. Importe os dois JSON desta pasta.
3. Ative os dois workflows.
4. No painel da Evolution, configure o webhook para:
   - `POST https://SEU-N8N/webhook/execution-os-inbound`
   - Header `x-webhook-secret: <N8N_INBOUND_SECRET>` (se você usar validação inbound)

## Contratos

### Outbound (Execution OS -> n8n)

O worker envia:

```json
{
  "to": "5511999999999",
  "message": "texto",
  "source": "execution-os",
  "sentAt": "2026-02-28T18:30:00.000Z"
}
```

Header opcional:

- `x-webhook-secret: <N8N_OUTBOUND_SECRET>`

### Inbound (n8n -> Execution OS)

O workflow inbound envia para a API já normalizado:

```json
{
  "from": "5511999999999",
  "message": "fiz abc12345",
  "externalMessageId": "wamid.xxx"
}
```
