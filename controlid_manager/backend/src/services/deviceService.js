const { getAddonConfig } = require('../config/addonConfig');
const {
  getValidSession,
  invalidateSession,
  callDeviceApi,
} = require('./controlIdClient');
const { DeviceApiError } = require('../errors/DeviceApiError');

function getDeviceStatus() {
  const config = getAddonConfig();
  return { device_ip: config.device_ip };
}

async function captureScreenshot() {
  const config = getAddonConfig();
  const session = await getValidSession(config);
  const url = `http://${config.device_ip}/save_screenshot.fcgi?session=${encodeURIComponent(session)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format_type: 'base64' }),
    signal: AbortSignal.timeout(8000),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) invalidateSession();
    throw new DeviceApiError(
      `Erro HTTP ${response.status} ao capturar screenshot da câmera.`,
      response.status,
      'SCREENSHOT_ERROR'
    );
  }

  const rawText = data.image_base64 || '';
  let imageBase64 = rawText.trim();

  try {
    const parsed = JSON.parse(rawText);
    imageBase64 = parsed.image || parsed.screenshot || parsed.data || '';
  } catch {
    // Mantém rawText caso já seja base64 direto
  }

  if (!imageBase64) {
    throw new DeviceApiError(
      'O equipamento não retornou dados de imagem na captura.',
      502,
      'EMPTY_SCREENSHOT'
    );
  }

  return {
    image: imageBase64,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

async function remoteEnrollCard() {
  const data = await callDeviceApi(
    'remote_enroll.fcgi',
    { type: 'card', save: false, sync: true },
    '',
    true,
    25000
  );

  const rawCard = data?.card_value ?? data?.value;
  if (!rawCard) {
    return {
      success: false,
      error: data?.error || 'Nenhum cartão foi detectado ou tempo esgotado.',
    };
  }

  return { success: true, card: String(rawCard) };
}

async function cancelRemoteEnroll() {
  await callDeviceApi('cancel_remote_enroll.fcgi', {}, '', false, 3000);
  return { success: true };
}

module.exports = {
  getDeviceStatus,
  captureScreenshot,
  remoteEnrollCard,
  cancelRemoteEnroll,
};