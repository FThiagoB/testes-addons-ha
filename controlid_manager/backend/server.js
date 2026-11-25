const express = require('express');
const fs = require('fs');
const path = require('path');

// DEBUG: IP é alcançável?
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;

  try {
    fs.writeSync(level === 'ERROR' ? 2 : 1, line);
  } catch {
    console.log(line.trim());
  }
}

process.on('uncaughtException', (err) => {
  log('ERROR', `Erro fatal na inicialização: ${err.stack || err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', `Promise rejeitada: ${reason?.stack || reason}`);
});

log('INFO', 'Processo Node.js iniciado. Carregando configurações...');

////////////////////////////////////////////////////////////////////////////////////////////

// Cria uma API para o frontend chamar, normalizando o acesso à API do controlid
const app = express();
const PORT = 8099;

// https://www.controlid.com.br/docs/access-api-pt/reconhecimento-facial/cadastro-facial/
const FACE_ERROR_MESSAGES = {
  1: 'Parâmetros inválidos ou formato de imagem não reconhecido (use JPG ou PNG).',
  2: 'Nenhum rosto foi identificado na imagem enviada.',
  3: 'Este rosto já está cadastrado para outro usuário.',
  4: 'Rosto muito descentralizado na imagem.',
  5: 'Rosto muito pequeno / distante da câmera.',
  6: 'Rosto muito grande / próximo demais da câmera.',
  7: 'Rosto inclinado ou mal posicionado em relação à câmera.',
  8: 'Nitidez insuficiente na imagem para reconhecimento facial.',
  9: 'Rosto muito próximo das bordas da imagem.',
};

// https://stackoverflow.com/questions/19917401/error-request-entity-too-large
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb'}));

app.use(express.static(path.join(__dirname, 'public')));

// Obtendo os dados de configuração do addon
function getAddonConfig() {
  const optionsPath = '/data/options.json';
  let fileConfig = {
    device_ip: process.env.DEVICE_IP || '192.168.1.100',
    device_login: process.env.DEVICE_LOGIN || 'root',
    device_password: process.env.DEVICE_PASSWORD || '',
    use_mock: process.env.USE_MOCK !== 'false',
  };

  if (fs.existsSync(optionsPath)) {
    fileConfig = {
      ...fileConfig,
      ...JSON.parse(fs.readFileSync(optionsPath, 'utf8')),
    };
  }

  return {
    ...fileConfig,
  };
}

function enrichFaceErrors(errors = []) {
  return errors.map((err) => {
    let friendlyMessage = FACE_ERROR_MESSAGES[err.code] || err.message || 'Erro ao validar face.';
    if (err.code === 3 && err.info?.match_user_id) {
      friendlyMessage = `Este rosto já pertence ao usuário ID ${err.info.match_user_id}.`;
    }
    return {
      ...err,
      friendlyMessage,
    };
  });
}

let cachedSession = null;

// classe customizada para o error
class DeviceApiError extends Error {
  constructor(message, statusCode = 502, code = 'DEVICE_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function getValidSession(config) {
  const baseUrl = `http://${config.device_ip}`;

  if (cachedSession) {
    try {
      // https://www.controlid.com.br/docs/access-api-pt/primeiros-passos/realizar-login/
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
    // https://www.controlid.com.br/docs/access-api-pt/primeiros-passos/realizar-login/
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
    const detail = err.cause ? `${err.cause.code} (${err.cause.message})` : err.message;
    log('ERROR', `Falha de socket no login.fcgi (${baseUrl}): ${detail}`);
      
    // Lança o erro customizado
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

  // https://en.wikipedia.org/wiki/List_of_HTTP_status_codes
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

// Função generica para chamar uma rota
async function callDeviceApi(endpoint, payload, params="", exit_on_error = true) {
  const config = getAddonConfig();
  const session = await getValidSession(config);
  var url = `http://${config.device_ip}/${endpoint}?session=${session}`;
  
  if(params)
    url = `http://${config.device_ip}/${endpoint}?session=${session}&${params}`;
  
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    console.log( err );
    if (exit_on_error)
      throw new DeviceApiError(
        `Falha de comunicação ao chamar ${endpoint} no equipamento.`,
        502,
        'REQUEST_ERROR'
      );
    else
      return express.json({error: 502, message: `Falha de comunicação ao chamar ${endpoint} no equipamento.`})
  }

  if (!response.ok) {
    if (response.status === 401) cachedSession = null;
    if (exit_on_error)
      throw new DeviceApiError(
        `O equipamento recusou a requisição em ${endpoint} (HTTP ${response.status}).`,
        response.status,
        'DEVICE_HTTP_ERROR'
      );
    else
      return express.json({error: response.status, message: `O equipamento recusou a requisição em ${endpoint} (HTTP ${response.status}).`})
  }

  return response.json();
}

function handleApiError(res, error) {
  console.error('[ControlID API Error]:', error.message);
  const status = error.statusCode || 500;
  res.status(status).json({
    error: error.message || 'Erro interno ao comunicar com o Control iD.',
    code: error.code || 'INTERNAL_ERROR',
  });
}

// =========================================================================================================
async function syncUserCredentialObject({objectName, originalId, targetUserId, newValue}){
  const searchIds = originalId === targetUserId ? [targetUserId] : [originalId, targetUserId];

  const existingRes = await callDeviceApi('load_objects.fcgi', {
    object: objectName,
    where: {
      [objectName]: { user_id: searchIds },
    },
  });

  const existingList = existingRes?.[objectName] || [];
  const hasNewValue = newValue !== null && newValue !== undefined && String(newValue).trim() !== '';

  // Campo foi limpo no formulário
  if (!hasNewValue) {
    if (existingList.length > 0) {
      await callDeviceApi('destroy_objects.fcgi', {
        object: objectName,
        where: {
          [objectName]: { user_id: searchIds },
        },
      });
    }
    return;
  }

  if (existingList.length > 0) {
    const primaryRecord = existingList[0];

    await callDeviceApi('modify_objects.fcgi', {
      object: objectName,
      values: {
        value: newValue,
        user_id: targetUserId,
      },
      where: {
        [objectName]: { id: primaryRecord.id },
      },
    });

    if (existingList.length > 1) {
      const extraIds = existingList.slice(1).map((item) => item.id);
      await callDeviceApi('destroy_objects.fcgi', {
        object: objectName,
        where: {
          [objectName]: { id: extraIds },
        },
      });
    }
    return;
  }

  await callDeviceApi('create_objects.fcgi', {
    object: objectName,
    values: [
      {
        value: newValue,
        user_id: targetUserId,
      },
    ],
  });
}

async function syncUserAdminRole({ originalId, targetUserId, isAdmin }) {
  const searchIds = originalId === targetUserId ? [targetUserId] : [originalId, targetUserId];

  const rolesRes = await callDeviceApi('load_objects.fcgi', {
    object: 'user_roles',
    where: {
      user_roles: { user_id: searchIds, role: 1 },
    },
  });

  const existingRoles = rolesRes?.user_roles || [];

  if (!isAdmin) {
    if (existingRoles.length > 0) {
      await callDeviceApi('destroy_objects.fcgi', {
        object: 'user_roles',
        where: {
          user_roles: { user_id: searchIds, role: 1 },
        },
      });
    }
    return;
  }

  if (existingRoles.length === 0) {
    await callDeviceApi('create_objects.fcgi', {
      object: 'user_roles',
      values: [
        {
          user_id: targetUserId,
          role: 1,
        },
      ],
    });
  } else if (originalId !== targetUserId) {
    await callDeviceApi('modify_objects.fcgi', {
      object: 'user_roles',
      values: { user_id: targetUserId, role: 1 },
      where: {
        user_roles: { user_id: originalId, role: 1 },
      },
    });
  }
}
// =========================================================================================================

app.get('/api/status', (req, res) => {
  const config = getAddonConfig();
  res.json({
    device_ip: config.device_ip
  });
});

app.get('/api/get_screenshot', async (req, res) => {
  const config = getAddonConfig();

  try {
    const session = await getValidSession(config);
    const url = `http://${config.device_ip}/save_screenshot.fcgi?session=${encodeURIComponent(session)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format_type: 'base64',
      }),
      signal: AbortSignal.timeout(8000),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) cachedSession = null;
      throw new DeviceApiError(
        `Erro HTTP ${response.status} ao capturar screenshot da câmera.`,
        response.status,
        'SCREENSHOT_ERROR'
      );
    }

    if (response.status === 400) {
      return res.status(400).json({
        error: data.error || 'User does not have an image',
        code: data.code ?? 1,
      });
    }

    const rawText = data.image_base64;
    let imageBase64 = rawText.trim();

    try {
      const parsed = JSON.parse(rawText);
      imageBase64 = parsed.image || parsed.screenshot || parsed.data || '';
    } catch {
    }

    if (!imageBase64) {
      throw new DeviceApiError(
        'O equipamento não retornou dados de imagem na captura.',
        502,
        'EMPTY_SCREENSHOT'
      );
    }

    return res.json({
      image: imageBase64,
      timestamp: Math.floor(Date.now() / 1000),
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

app.post("/api/users", async (req, res) => {
  const config = getAddonConfig();
  const { id, name, card, pin, admin } = req.body;

  if (
    typeof id !== 'number' ||
    !Number.isFinite(id) ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    typeof admin !== 'boolean' ||
    (pin !== undefined && pin !== null && typeof pin !== 'string') ||
    (card !== undefined && card !== null && typeof card !== 'number')
  ) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }

  let newCard = null;
  let newPin = null;

  try {
    // Cria o usuário
    const userResult = await callDeviceApi('create_objects.fcgi', {
      object: "users",
      values: [{ id, name: name.trim(), registration: "" }]
    });

    // Vincula o cartão, se informado
    if (card !== undefined && card !== null && card !== '') {
      newCard = await callDeviceApi('create_objects.fcgi', {
        object: "cards",
        values: [{ user_id: id, value: card }]
      }, "", false);
    }

    // Vincula o PIN, se informado
    if (pin !== undefined && pin !== null && pin !== '') {
      newPin = await callDeviceApi('create_objects.fcgi', {
        object: "pins",
        values: [{ user_id: id, value: pin }]
      }, "", false);
    }

    // Vincula a role
    const newRole = await callDeviceApi('create_objects.fcgi', {
      object: "user_roles",
      values: [{ user_id: id, role: admin ? 1 : 0 }]
    }, "", false);

    // Vincula ao grupo de usuários
    // Vincula o usuário a um usergroup
    const newGroup = await callDeviceApi('create_objects.fcgi', {
      object: "user_groups",
      values: [{ user_id: id, group_id: 1 }]
    }, "", false);

    return res.status(201).json({
      success: true
    });

  } catch (error) {
    handleApiError(res, error);
  }
});

app.get('/api/users', async (req, res) => {
  const config = getAddonConfig();

  try {
    // https://www.controlid.com.br/docs/access-api-pt/objetos/carregar-objetos/
    const dataUsers = await callDeviceApi('load_objects.fcgi', { object: 'users' });
    const dataCards = await callDeviceApi('load_objects.fcgi', { object: 'cards' });
    const dataPins = await callDeviceApi('load_objects.fcgi', { object: 'pins' });
    const dataUserRoles = await callDeviceApi('load_objects.fcgi', { object: 'user_roles' });
    const dataUserListImage = await callDeviceApi('user_list_images.fcgi', { object: 'user_roles' });

    // Combina os campos [https://stackoverflow.com/questions/49915304/how-to-join-two-arrays-conditionally]
    dataCards.cards?.forEach( card => {
      let idx = dataUsers.users?.findIndex( ({ id }) => card.user_id == id );  
      
      // Se o cartão não está vinculado à um usuário, ignora (em teoria não acontece)
      if( idx !== -1 ){
        dataUsers.users[ idx ].card = card.value;
      }
    });

    dataPins.pins?.forEach( pin => {
      let idx = dataUsers.users?.findIndex( ({ id }) => pin.user_id == id );  
      
      if( idx !== -1 ){
        dataUsers.users[ idx ].pin = pin.value;
      }
    });

    dataUserRoles.user_roles?.forEach( user_role => {
      let idx = dataUsers.users?.findIndex( ({ id }) => user_role.user_id == id );  
      
      if( idx !== -1 ){
        dataUsers.users[ idx ].admin = user_role.role;
      }
    });

    dataUserListImage.user_ids?.forEach( user_id => {
      let idx = dataUsers.users?.findIndex( ({ id }) => user_id == id );  
      
      if( idx !== -1 ){
        dataUsers.users[ idx ].has_image = true;
      }
    });

    const usersList = Array.isArray(dataUsers) ? dataUsers : dataUsers.users || [];
    res.json(usersList);
  } catch (error) {
    handleApiError(res, error);
  }
});

app.put('/api/users/:id', async (req, res) => {
  const config = getAddonConfig();
  const originalId = Number(req.params.id);
  const { id, name, registration, user_type_id, card, pin, admin } = req.body;
  const targetUserId = id !== undefined && id !== null ? Number(id) : originalId;

  try {
    const userValues = {
      id: targetUserId,
      name,
      user_type_id: user_type_id === 1 ? 1 : null,
    };
    if (registration !== undefined) {
      userValues.registration = registration;
    }

    const userResult = await callDeviceApi('modify_objects.fcgi', {
      object: 'users',
      values: userValues,
      where: {
        users: { id: originalId },
      },
    });

    if (card !== undefined) {
      const parsedCard =
        card !== null && String(card).trim() !== '' ? Number(card) : null;

      await syncUserCredentialObject({
        objectName: 'cards',
        originalId,
        targetUserId,
        newValue: parsedCard,
      });
    }

    if (pin !== undefined) {
      const parsedPin =
        pin !== null && String(pin).trim() !== '' ? String(pin).trim() : null;

      await syncUserCredentialObject({
        objectName: 'pins',
        originalId,
        targetUserId,
        newValue: parsedPin,
      });
    }

    if (admin !== undefined) {
      await syncUserAdminRole({
        originalId,
        targetUserId,
        isAdmin: Boolean(admin),
      });
    }

    res.json({
      success: true,
      user: userResult,
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const config = getAddonConfig();
  const userId = Number(req.params.id);

  try {
    await Promise.allSettled([
      callDeviceApi('destroy_objects.fcgi', {
        object: 'cards',
        where: { cards: { user_id: userId } },
      }),
      callDeviceApi('destroy_objects.fcgi', {
        object: 'pins',
        where: { pins: { user_id: userId } },
      }),
      callDeviceApi('destroy_objects.fcgi', {
        object: 'user_roles',
        where: { user_roles: { user_id: userId } },
      }),
      callDeviceApi('user_destroy_image.fcgi', {
        user_id: userId,
      }),
    ]);

    const result = await callDeviceApi('destroy_objects.fcgi', {
      object: 'users',
      where: {
        users: { id: userId },
      },
    });

    res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
});

app.get('/api/user_get_image', async (req, res) => {
  const config = getAddonConfig();
  const rawUserId = req.query.user_id;

  if (!rawUserId || Number.isNaN(Number(rawUserId))) {
    return res.status(400).json({
      error: 'Invalid user_id',
      code: 1,
    });
  }

  const userId = Number(rawUserId);

  try {
    const session = await getValidSession(config);
    const url = `http://${config.device_ip}/user_get_image.fcgi?session=${encodeURIComponent(
      session
    )}&user_id=${userId}&get_timestamp=1`;

    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(6000),
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 400) {
      return res.status(400).json({
        error: data.error || 'User does not have an image',
        code: data.code ?? 1,
      });
    }

    if (!response.ok) {
      if (response.status === 401) cachedSession = null;
      throw new DeviceApiError(
        `Erro HTTP ${response.status} ao buscar imagem do usuário.`,
        response.status,
        'DEVICE_HTTP_ERROR'
      );
    }

    return res.json({
      timestamp: Number(data.timestamp) || 0,
      image: data.image || '',
    });
  } catch (error) {
    handleApiError(res, error);
  }
});

app.post('/api/set_userimage', async (req, res) => {
  const config = getAddonConfig();
  const { user_id, image, timestamp } = req.body;

  console.log("Recebeu as informações. ");
  if (Number.isNaN(Number(user_id))) {
    return res.status(400).json({
      user_id: null,
      success: false,
      errors: enrichFaceErrors([{ code: 1, message: 'Invalid user_id' }]),
    });
  }

  const uid = Number(user_id);
  const ts = timestamp ? Number(timestamp) : Math.floor(Date.now() / 1000);

  // Exclusão de foto
  if (!image) {
    if (config.use_mock) {
      delete mockUserImages[uid];
      return res.json({ user_id: uid, success: true, errors: [], timestamp: 0 });
    }
    try {
      await callDeviceApi('user_destroy_image.fcgi', { user_id: uid });
      return res.json({ user_id: uid, success: true, errors: [], timestamp: 0 });
    } catch (error) {
      return handleApiError(res, error);
    }
  }

  // Remove o prefixo "data:image/...;base64,"
  const cleanBase64 = image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  const binaryBuffer = Buffer.from(cleanBase64, 'base64');

  if (!binaryBuffer.length) {
    return res.status(400).json({
      user_id: uid,
      success: false,
      errors: enrichFaceErrors([
        {
          code: 1,
          message: 'Image file not recognized. Image should be either JPG or PNG.',
        },
      ]),
    });
  }

  try {
    const session = await getValidSession(config);
    const query = new URLSearchParams({
      session,
      user_id: String(uid),
      timestamp: String(ts),
      match: '1',
    });

    const url = `http://${config.device_ip}/user_set_image.fcgi?${query.toString()}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(binaryBuffer.length),
      },
      body: binaryBuffer,
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json().catch(() => null);

    if (!data) {
      if (response.status === 401) cachedSession = null;
      throw new DeviceApiError(
        `Resposta inválida do Control iD em user_set_image.fcgi (HTTP ${response.status}).`,
        response.status || 502,
        'SET_IMAGE_ERROR'
      );
    }

    const enrichedErrors = enrichFaceErrors(data.errors || []);
    const payload = {
      user_id: data.user_id ?? uid,
      scores: data.scores || null,
      success: Boolean(data.success),
      errors: enrichedErrors,
    };

    if (!payload.success) {
      return res.status(422).json(payload);
    }

    return res.json(payload);
  } catch (error) {
    handleApiError(res, error);
  }
});

// Redireciona para um arquivo estático
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// TODO: Pesquisar sobre isso
app.use((req, res, next) => {
  const remoteIp = req.socket.remoteAddress || '';
  const isAllowed =
    remoteIp.includes('172.30.32.2') || // IP oficial do proxy Ingress no HAOS
    remoteIp.includes('127.0.0.1') ||   // Testes locais (IPv4)
    remoteIp.includes('::1');           // Testes locais (IPv6)

  if (!isAllowed) {
    log('ERROR', `Acesso direto bloqueado fora do Ingress vindo de: ${remoteIp}`);
    return res.status(403).json({ error: 'Acesso permitido apenas via Home Assistant Ingress.' });
  }
  next();
});

// Inicializa o servidor
const server =  app.listen(PORT, () => {
  const cfg = getAddonConfig();
  log('INFO', `ControlID Addon rodando na porta ${PORT}`);
  runNetworkDiagnostics(cfg);
});

// ==============================================================================================

// Encerramento
function shutdown(signal) {
  log('INFO', `Sinal ${signal} recebido. Encerrando servidor ControlID...`);
  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }
  server.close(() => {
    log('INFO', 'Servidor encerrado com sucesso.');
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

//////////////////////////////////////////////////////////////////////////////////////

async function runCommand(cmd, args) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 10000 });
    return (stdout || stderr).trim();
  } catch (err) {
    return (err.stdout || err.stderr || err.message).trim();
  }
}

async function runNetworkDiagnostics(config) {
  log('INFO', `Alvo configurado -> IP: ${config.device_ip} | Login: ${config.device_login} | Mock: ${config.use_mock}`);

  // Interfaces e tabela de rotas do container
  const routes = await runCommand('ip', ['route']);
  log('DEBUG', `Tabela de rotas do container:\n${routes}`);

  // Teste de Ping no Gateway
  const parts = config.device_ip.split('.');
  if (parts.length === 4) {
    const gatewayIp = `${parts[0]}.${parts[1]}.${parts[2]}.1`;
    const pingGw = await runCommand('ping', ['-c', '2', '-W', '2', gatewayIp]);
    log('DEBUG', `Ping Gateway (${gatewayIp}):\n${pingGw}`);
  }

  const pingDevice = await runCommand('ping', ['-c', '3', '-W', '2', config.device_ip]);
  log('DEBUG', `Ping Control iD (${config.device_ip}):\n${pingDevice}`);

  // Traceroute sem resolução DNS (-n) para ver onde o pacote para
  const trace = await runCommand('traceroute', ['-n', '-w', '2', '-m', '10', config.device_ip]);
  log('DEBUG', `Traceroute até ${config.device_ip}:\n${trace}`);

  // Teste HTTP na porta 80
  try {
    const res = await fetch(`http://${config.device_ip}:80/`, {
      method: 'GET',
      signal: AbortSignal.timeout(4000),
    });
    log('INFO', `Teste HTTP porta 80 respondeu com status: HTTP ${res.status}`);
  } catch (err) {
    const cause = err.cause ? `${err.cause.code || ''} - ${err.cause.message || ''}` : err.message;
    log('ERROR', `Teste HTTP porta 80 falhou: ${cause}`);
  }

  log('INFO', '================ FIM DO DIAGNÓSTICO DE REDE ==================');
}