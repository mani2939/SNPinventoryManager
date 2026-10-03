import type { Invoice } from "./types";
export class WhatsAppError extends Error {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export function whatsappConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim(),
    phoneId = env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
    template = env.WHATSAPP_INVOICE_TEMPLATE?.trim(),
    language = env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en_GB",
    version = env.WHATSAPP_API_VERSION?.trim() || "v26.0";
  if (!token || !phoneId || !template) return null;
  if (
    !/^\d+$/.test(phoneId) ||
    !/^v\d+\.0$/.test(version) ||
    !/^\w+$/.test(template) ||
    !/^\w+$/.test(language)
  )
    return null;
  return { token, phoneId, template, language, version };
}
export function invoiceTemplatePayload(
  invoice: Invoice,
  recipient: string,
  mediaId: string,
  template: string,
  language: string,
) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient.replace(/^\+/, ""),
    type: "template",
    template: {
      name: template,
      language: { code: language },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "document",
              document: {
                id: mediaId,
                filename: `${invoice.invoice_number}.pdf`,
              },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: invoice.customer_name },
            { type: "text", text: invoice.invoice_number },
            { type: "text", text: `£${invoice.total_gbp.toFixed(2)}` },
          ],
        },
      ],
    },
  };
}
async function parseResponse(response: Response, uncertain = true) {
  try {
    return await response.json();
  } catch {
    throw new WhatsAppError(
      "WhatsApp returned an unreadable response.",
      uncertain,
    );
  }
}
export async function sendInvoiceWhatsApp(
  invoice: Invoice,
  recipient: string,
  pdf: Uint8Array,
  fetcher: typeof fetch = fetch,
) {
  const config = whatsappConfiguration();
  if (!config)
    throw new WhatsAppError(
      "Configure the WhatsApp access token, phone number ID and approved invoice template in Vercel.",
    );
  const base = `https://graph.facebook.com/${config.version}/${config.phoneId}`;
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("type", "application/pdf");
  form.set(
    "file",
    new Blob([new Uint8Array(pdf)], { type: "application/pdf" }),
    `${invoice.invoice_number}.pdf`,
  );
  let upload: Response;
  try {
    upload = await fetcher(base + "/media", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new WhatsAppError(
      "PDF upload to WhatsApp failed. No message was sent.",
    );
  }
  const media = await parseResponse(upload, false);
  if (!upload.ok || !media.id)
    throw new WhatsAppError(
      "WhatsApp rejected the PDF upload. Check the configured account and media permissions.",
    );
  let response: Response;
  try {
    response = await fetcher(base + "/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        invoiceTemplatePayload(
          invoice,
          recipient,
          media.id,
          config.template,
          config.language,
        ),
      ),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new WhatsAppError(
      "WhatsApp did not confirm the send. Check WhatsApp before attempting another send to avoid a duplicate.",
      true,
    );
  }
  const result = await parseResponse(response);
  if (!response.ok) {
    const code = Number(result.error?.code);
    throw new WhatsAppError(
      code === 132001 || code === 132000
        ? "WhatsApp rejected the invoice template. Check its approval, language and three body parameters."
        : `WhatsApp rejected the message${Number.isInteger(code) ? ` (code ${code})` : ""}. Check the account, template and recipient.`,
    );
  }
  const messageId = result.messages?.[0]?.id;
  if (!messageId)
    throw new WhatsAppError(
      "WhatsApp accepted the request without a message identifier. Check WhatsApp before retrying.",
      true,
    );
  return String(messageId);
}
