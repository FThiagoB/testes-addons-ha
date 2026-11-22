const express = require('express');
const fs = require('fs');
const path = require('path');

// DEBUG: IP é alcançável?
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function log(level, msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}\n`;

  // Escrita síncrona direta em stdout (1) e stderr (2) sem buffer
  fs.writeSync(level === 'ERROR' ? 2 : 1, line);
}

process.on('uncaughtException', (err) => {
  log('ERROR', `Erro fatal na inicialização: ${err.stack || err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('ERROR', `Promise rejeitada: ${reason?.stack || reason}`);
});

// Cria uma API para o frontend chamar, normalizando o acesso à API do controlid
const app = express();
const PORT = 8099;

// Todo: Remover o mock depois do teste
const FORCE_MOCK_MODE = null;

// pela documentação da API, normalmente é tudo JSON
app.use(express.json());
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
    use_mock:
      FORCE_MOCK_MODE !== null ? FORCE_MOCK_MODE : Boolean(fileConfig.use_mock),
  };
}


let cachedSession = null;

// Alguns dados para testar fora do lab
// TODO: Remover depois dos testes
let mockUsers = [
  {
    id: 1001,
    name: 'Carlos Eduardo Silva',
    last_access: Math.floor(Date.now() / 1000) - 3600,
    user_type_id: null,
    registration: 'MAT-2026-01',
  },
  {
    id: 1002,
    name: 'Mariana Costa',
    last_access: Math.floor(Date.now() / 1000) - 86400,
    user_type_id: null,
    registration: 'MAT-2026-02',
  },
  {
    id: 1003,
    name: 'Roberto Almeida',
    last_access: Math.floor(Date.now() / 1000) - 7200,
    user_type_id: 1,
    registration: 'VIS-904',
  },
];

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

  // TODO: Verificar se o equipamento retorna HTTP status de erro ou é apenas o JSON de erro com HTTP 200
  if (loginRes.status === 401 || loginRes.status === 403) {
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
async function callDeviceApi(endpoint, payload) {
  const config = getAddonConfig();
  const session = await getValidSession(config);
  const url = `http://${config.device_ip}/${endpoint}?session=${session}`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(6000),
    });
  } catch (err) {
    throw new DeviceApiError(
      `Falha de comunicação ao chamar ${endpoint} no equipamento.`,
      502,
      'REQUEST_ERROR'
    );
  }

  if (!response.ok) {
    if (response.status === 401) cachedSession = null;
    throw new DeviceApiError(
      `O equipamento recusou a requisição em ${endpoint} (HTTP ${response.status}).`,
      response.status,
      'DEVICE_HTTP_ERROR'
    );
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

app.get('/api/status', (req, res) => {
  const config = getAddonConfig();
  res.json({
    device_ip: config.device_ip,
    use_mock: config.use_mock,
  });
});

app.get('/api/users', async (req, res) => {
  const config = getAddonConfig();

  if (config.use_mock) {
    // pequeno atraso quando se usa mock
    await new Promise((r) => setTimeout(r, 250));
    return res.json(mockUsers);
  }

  try {
    // https://www.controlid.com.br/docs/access-api-pt/objetos/carregar-objetos/
    const data = await callDeviceApi('load_objects.fcgi', { object: 'users' });
    const usersList = Array.isArray(data) ? data : data.users || [];
    res.json(usersList);
  } catch (error) {
    handleApiError(res, error);
  }
});

app.put('/api/users/:id', async (req, res) => {
  const config = getAddonConfig();
  const userId = Number(req.params.id);
  const { name, registration, user_type_id } = req.body;

  if (config.use_mock) {
    const idx = mockUsers.findIndex((u) => u.id === userId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Usuário não encontrado no mock.' });
    }
    mockUsers[idx] = {
      ...mockUsers[idx],
      name,
      registration,
      user_type_id: user_type_id === 1 ? 1 : null,
    };
    return res.json(mockUsers[idx]);
  }

  try {
    // https://www.controlid.com.br/docs/access-api-pt/objetos/modificar-objetos/
    const result = await callDeviceApi('modify_objects.fcgi', {
      object: 'users',
      values: {
        name,
        registration,
        user_type_id: user_type_id === 1 ? 1 : null,
      },
      where: {
        users: { id: userId },
      },
    });
    res.json(result);
  } catch (error) {
    handleApiError(res, error);
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const config = getAddonConfig();
  const userId = Number(req.params.id);

  if (config.use_mock) {
    mockUsers = mockUsers.filter((u) => u.id !== userId);
    return res.json({ success: true });
  }

  try {
    // https://www.controlid.com.br/docs/access-api-pt/objetos/destruir-objetos/
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
  log('INFO', `ControlID Addon rodando na porta ${PORT} | Modo: ${cfg.use_mock ? 'MOCK' : 'REAL'}`);
  runNetworkDiagnostics(cfg);
});

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