const axios = require('axios');

function getWhatsAppConfig() {
  return {
    enabled: process.env.WHATSAPP_ENABLED === 'true',
    apiUrl: process.env.WHATSAPP_API_URL || '',
    apiKey: process.env.WHATSAPP_API_KEY || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || ''
  };
}

async function sendWhatsAppMessage(to, message) {
  try {
    const { enabled, apiUrl, apiKey, phoneNumberId } = getWhatsAppConfig();
    if (!enabled || !apiUrl || !apiKey) return;

    await axios.post(`${apiUrl}/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: message }
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  } catch (err) {
    console.error('WhatsApp error:', err.message);
  }
}

async function sendWhatsAppTemplate(to, templateName, langCode, params) {
  try {
    const { enabled, apiUrl, apiKey, phoneNumberId } = getWhatsAppConfig();
    if (!enabled || !apiUrl || !apiKey) return;

    await axios.post(`${apiUrl}/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: langCode || 'id' },
        components: params ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: p })) }] : []
      }
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  } catch (err) {
    console.error('WhatsApp template error:', err.message);
  }
}

async function notifyTicketWhatsApp(ticket, teknisi) {
  const config = getWhatsAppConfig();
  if (!config.enabled || !teknisi || !teknisi.whatsapp_number) return;

  const msg = `[SIMRS CareTrack] Tiket Baru ${ticket.no_tiket}\n\n`
    + `Subjek: ${ticket.subjek}\n`
    + `Kategori: ${ticket.kategori}\n`
    + `Prioritas: ${ticket.prioritas}\n`
    + `Sumber: ${ticket.sumber}\n\n`
    + `Silakan buka aplikasi untuk detail lengkap.`;

  await sendWhatsAppMessage(teknisi.whatsapp_number, msg);
}

async function notifyReportWhatsApp(report, teknisi) {
  const config = getWhatsAppConfig();
  if (!config.enabled || !teknisi || !teknisi.whatsapp_number) return;

  const msg = `[SIMRS CareTrack] Laporan Baru #${report.id}\n\n`
    + `Perangkat: ${report.nama_perangkat}\n`
    + `Prioritas: ${report.prioritas.toUpperCase()}\n`
    + `Deskripsi: ${report.deskripsi || '-'}\n\n`
    + `Silakan buka aplikasi untuk detail lengkap.`;

  await sendWhatsAppMessage(teknisi.whatsapp_number, msg);
}

module.exports = { sendWhatsAppMessage, sendWhatsAppTemplate, notifyTicketWhatsApp, notifyReportWhatsApp, getWhatsAppConfig };
