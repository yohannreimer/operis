# Workflows n8n prontos (Execution OS + Evolution)

Esta pasta traz os fluxos necessários para usar **n8n como intermediador**:

1. `workflow-whatsapp-outbound.json`
   - Recebe envio do `worker` do Execution OS
   - Encaminha para Evolution API
2. `workflow-whatsapp-inbound.json`
   - Recebe eventos da Evolution API
   - Normaliza payload
   - Encaminha para `POST /webhooks/whatsapp` da API do Execution OS
3. `workflow-notes-transcription.json`
   - Recebe áudio base64 da API (`POST /notes/transcribe-audio`)
   - Faz transcrição + estruturação de nota com IA
   - Retorna JSON no contrato esperado pela aba de Notas

## Variáveis de ambiente no n8n

Configure no ambiente/container do n8n:

- `EVOLUTION_API_URL`
- `EVOLUTION_INSTANCE`
- `EVOLUTION_API_KEY`
- `EXECUTION_OS_API_URL`
- `N8N_OUTBOUND_SECRET` (opcional; se vazio, outbound não valida segredo)
- `EXECUTION_OS_WEBHOOK_SECRET` (opcional; se vazio, a API não valida segredo)
- `N8N_INBOUND_SECRET` (opcional; se vazio, inbound não valida segredo)
- Para o workflow de notas: configurar `CONFIG` dentro do node `Normalize Notes Payload`:
  - `openaiApiKey`
  - `openaiBaseUrl` (ex.: `https://api.openai.com/v1`)
  - `transcriptionModel` (ex.: `gpt-4o-mini-transcribe`)
  - `structuringModel` (ex.: `gpt-4o-mini`)
  - `webhookSecret` (opcional)

## Variáveis no Execution OS (`.env`)

- `WHATSAPP_TRANSPORT=n8n`
- `WHATSAPP_OUTBOUND_WEBHOOK_URL=https://SEU-N8N/webhook/execution-os-outbound`
- `WHATSAPP_OUTBOUND_WEBHOOK_SECRET=<igual ao N8N_OUTBOUND_SECRET>` (opcional)
- `WHATSAPP_WEBHOOK_SECRET=<igual ao EXECUTION_OS_WEBHOOK_SECRET>` (opcional)
- `NOTES_TRANSCRIBE_WEBHOOK_URL=https://SEU-N8N/webhook/execution-os-notes-transcribe`
- `NOTES_TRANSCRIBE_WEBHOOK_SECRET=<igual ao webhookSecret do workflow de notas>` (opcional)
- `NOTES_TRANSCRIBE_TIMEOUT_MS=45000`

## Importação no n8n

1. Abra `Workflows` -> `Import from file`.
2. Importe os workflows necessários desta pasta.
3. Ative os workflows.
4. No painel da Evolution, configure o webhook para:
   - `POST https://SEU-N8N/webhook/execution-os-inbound`
   - Header `x-webhook-secret: <N8N_INBOUND_SECRET>` (se você usar validação inbound)
5. Para notas/transcrição:
   - Edite o node `Normalize Notes Payload` no workflow `workflow-notes-transcription.json`
   - Configure as chaves/modelos em `CONFIG`
   - Ative o workflow

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

### Notes transcription (Execution OS -> n8n -> IA)

A API envia para o n8n:

```json
{
  "source": "execution-os-notes",
  "requestedAt": "2026-03-04T18:30:00.000Z",
  "mode": "note",
  "context": "Título atual da nota",
  "audio": {
    "base64": "<audio_base64>",
    "mimeType": "audio/webm",
    "bytesEstimate": 842312,
    "language": "pt-BR"
  }
}
```

O workflow deve responder:

```json
{
  "ok": true,
  "provider": "n8n-openai",
  "transcript": "texto transcrito...",
  "titleSuggestion": "Sugestão de título",
  "structuredContent": "## Resumo\\n...",
  "tags": ["tag1", "tag2"],
  "confidence": 0.87,
  "durationMs": 9210
}
```

## Disparos de lembrete (n8n -> API do Execution OS)

Além do inbound/outbound, você pode criar workflows cron no n8n para chamar estes endpoints da API:

- `POST /webhooks/whatsapp/dispatch/morning`
- `POST /webhooks/whatsapp/dispatch/due-dates`
- `POST /webhooks/whatsapp/dispatch/followups`
- `POST /webhooks/whatsapp/dispatch/upcoming-blocks`

Header opcional:

- `x-webhook-secret: <WHATSAPP_WEBHOOK_SECRET>`  
  (só obrigatório se `WHATSAPP_WEBHOOK_SECRET` estiver preenchido no Execution OS)

### 1) Briefing da manhã (Top foco + digests)

```json
{
  "to": "5547999999999",
  "date": "2026-03-08",
  "workspaceId": null,
  "includeDueDigest": true,
  "includeFollowupDigest": true,
  "includeUpcomingDigest": false,
  "upcomingWithinMinutes": 20
}
```

### 2) Alertas de prazo (D-3 / D-1 / D0)

```json
{
  "to": "5547999999999",
  "date": "2026-03-08",
  "daysBefore": [3, 1, 0]
}
```

### 3) Follow-ups pendentes (restrições/dependências)

```json
{
  "to": "5547999999999"
}
```

### 4) Blocos próximos da agenda

```json
{
  "to": "5547999999999",
  "date": "2026-03-08",
  "withinMinutes": 20
}
```

## Comandos WhatsApp suportados (usuário final)

- `ajuda`
- `foco` / `top3`
- `foco confirmar`
- `foco confirmar <id1> <id2> [id3]`
- `foco trocar <1|2|3> <id>`
- `deep iniciar <id> [min]`
- `deep parar`
- `deep concluir`
- `alocar <id> HH:mm`
- `tarefas`
- `backlog`
- `projetos`
- `prazos`
- `followups`
- `status`
- `fiz <id>`
- `adiar <id>`
- `reagendar <id> HH:mm`
- `inbox`
- `inbox: <texto>`
- `capturar <texto>`
