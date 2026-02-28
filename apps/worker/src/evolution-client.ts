import { env } from './config.js';

function assertEnvVar(value: string | undefined, message: string) {
  if (!value?.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

async function sendViaN8nWebhook(to: string, message: string) {
  const url = assertEnvVar(
    env.WHATSAPP_OUTBOUND_WEBHOOK_URL,
    'Defina WHATSAPP_OUTBOUND_WEBHOOK_URL para usar transporte n8n.'
  );
  const secret = env.WHATSAPP_OUTBOUND_WEBHOOK_SECRET?.trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (secret) {
    headers['x-webhook-secret'] = secret;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to,
      message,
      source: 'execution-os',
      sentAt: new Date().toISOString()
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao enviar WhatsApp via n8n: ${response.status} - ${text}`);
  }
}

async function sendViaEvolutionApi(to: string, message: string) {
  const baseUrl = assertEnvVar(
    env.EVOLUTION_API_URL,
    'Defina EVOLUTION_API_URL para usar transporte evolution.'
  );
  const apiKey = assertEnvVar(
    env.EVOLUTION_API_KEY,
    'Defina EVOLUTION_API_KEY para usar transporte evolution.'
  );

  const response = await fetch(`${baseUrl}/message/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey
    },
    body: JSON.stringify({
      number: to,
      text: message
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao enviar WhatsApp via Evolution API: ${response.status} - ${text}`);
  }
}

export async function sendWhatsappMessage(to: string, message: string) {
  if (env.WHATSAPP_TRANSPORT === 'n8n') {
    await sendViaN8nWebhook(to, message);
    return;
  }

  await sendViaEvolutionApi(to, message);
}
