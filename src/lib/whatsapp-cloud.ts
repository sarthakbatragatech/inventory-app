type SendWhatsAppDocumentInput = {
  pdfBytes: Uint8Array;
  filename: string;
  caption: string;
};

type MetaMediaUploadResponse = {
  id?: string;
  error?: {
    message?: string;
  };
};

type MetaMessageSendResponse = {
  messages?: Array<{
    id?: string;
  }>;
  error?: {
    message?: string;
  };
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getWhatsAppConfig() {
  return {
    accessToken: requireEnv('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: requireEnv('WHATSAPP_PHONE_NUMBER_ID'),
    recipientPhone: requireEnv('WHATSAPP_RECIPIENT_PHONE'),
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v23.0',
  };
}

async function uploadDocumentMedia(
  input: SendWhatsAppDocumentInput,
  config: ReturnType<typeof getWhatsAppConfig>
) {
  const pdfArrayBuffer = new ArrayBuffer(input.pdfBytes.byteLength);
  new Uint8Array(pdfArrayBuffer).set(input.pdfBytes);
  const formData = new FormData();
  formData.set('messaging_product', 'whatsapp');
  formData.set('type', 'application/pdf');
  formData.set(
    'file',
    new Blob([pdfArrayBuffer], { type: 'application/pdf' }),
    input.filename
  );

  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
      },
      body: formData,
    }
  );

  const payload = (await response.json()) as MetaMediaUploadResponse;
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || 'Failed to upload WhatsApp media.');
  }

  return payload.id;
}

export async function sendWhatsAppDocument(input: SendWhatsAppDocumentInput) {
  const config = getWhatsAppConfig();
  const mediaId = await uploadDocumentMedia(input, config);

  const response = await fetch(
    `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: config.recipientPhone,
        type: 'document',
        document: {
          id: mediaId,
          filename: input.filename,
          caption: input.caption,
        },
      }),
    }
  );

  const payload = (await response.json()) as MetaMessageSendResponse;
  const messageId = payload.messages?.[0]?.id;

  if (!response.ok || !messageId) {
    throw new Error(
      payload.error?.message || 'Failed to send WhatsApp document message.'
    );
  }

  return {
    mediaId,
    messageId,
  };
}
