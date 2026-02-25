import { env } from './config.js';

export async function sendWhatsappMessage(to: string, message: string) {
  const response = await fetch(`${env.EVOLUTION_API_URL}/message/sendText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.EVOLUTION_API_KEY
    },
    body: JSON.stringify({
      number: to,
      text: message
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao enviar WhatsApp: ${response.status} - ${text}`);
  }
}
