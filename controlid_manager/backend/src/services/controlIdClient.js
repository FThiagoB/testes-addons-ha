const { getAddonConfig } = require('../config/addonConfig');
const { DeviceApiError } = require('../errors/DeviceApiError');
const { log } = require('../utils/logger');

let cachedSession = null;

function invalidateSession() {
  cachedSession = null;
}

function getCachedSession(){
  return cachedSession;
}

async function getValidSession(config = getAddonConfig()) {
  const baseUrl = `http://${config.device_ip}`;

  if (cachedSession) {
    try {
      const checkRes = await fetch(
        `${baseUrl}/session_is_valid.fcgi?session=${cachedSession}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(4000),
        }
      );
      const checkData = await checkRes.json();
      if (checkData.session_is_valid === true) {
        return cachedSession;
      }
    } catch {
      cachedSession = null;
    }
  }

  let loginRes;
  try {
    loginRes = await fetch(`${baseUrl}/login.fcgi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: config.device_login,
        password: config.device_password,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    const detail = err.cause
      ? `${err.cause.code} (${err.cause.message})`
      : err.message;
    log('ERROR', `Falha de socket no login.fcgi (${baseUrl}): ${detail}`);

    throw new DeviceApiError(
      `Não foi possível conectar ao equipamento em ${config.device_ip}. Verifique o IP e a rede.`,
      502,
      'CONNECTION_ERROR'
    );
  }

  if (loginRes.status === 401) {
    throw new DeviceApiError(
      'Credenciais inválidas no Control iD. Verifique o login e a senha na aba Configuração do Add-on.',
      401,
      'AUTH_ERROR'
    );
  }

  if (!loginRes.ok) {
    throw new DeviceApiError(
      `Erro HTTP ${loginRes.status} ao autenticar no Control iD.`,
      502,
      'LOGIN_HTTP_ERROR'
    );
  }

  const loginData = await loginRes.json();
  if (!loginData.session) {
    throw new DeviceApiError(
      'O equipamento não retornou uma sessão válida. Verifique login e senha.',
      401,
      'AUTH_ERROR'
    );
  }

  cachedSession = loginData.session;
  return cachedSession;
}

async function callDeviceApi(
  endpoint,
  payload,
  params = '',
  exit_on_error = true,
  timeout_ms = 6000
) {
  const config = getAddonConfig();
  const session = await getValidSession(config);
  let url = `http://${config.device_ip}/${endpoint}?session=${encodeURIComponent(session)}`;

  if (params) {
    url += `&${params}`;
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout_ms),
    });
  } catch (err) {
    log('ERROR', `Erro ao chamar ${endpoint}: ${err.message}`);
    if (exit_on_error) {
      throw new DeviceApiError(
        `Falha de comunicação ao chamar ${endpoint} no equipamento.`,
        502,
        'REQUEST_ERROR'
      );
    }
    return {
      error: 502,
      message: `Falha de comunicação ao chamar ${endpoint} no equipamento.`,
    };
  }

  if (!response.ok) {
    if (response.status === 401) cachedSession = null;
    if (exit_on_error) {
      throw new DeviceApiError(
        `O equipamento recusou a requisição em ${endpoint} (HTTP ${response.status}).`,
        response.status,
        'DEVICE_HTTP_ERROR'
      );
    }
    return {
      error: response.status,
      message: `O equipamento recusou a requisição em ${endpoint} (HTTP ${response.status}).`,
    };
  }

  return response.json();
}

module.exports = { getValidSession, invalidateSession, callDeviceApi, getCachedSession};