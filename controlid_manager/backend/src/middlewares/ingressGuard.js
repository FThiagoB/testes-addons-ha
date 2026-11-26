const { log } = require('../utils/logger');

function ingressGuard(req, res, next) {
  const remoteIp = req.socket.remoteAddress || '';
  const isAllowed =
    remoteIp.includes('172.30.32.2') ||
    remoteIp.includes('127.0.0.1') ||
    remoteIp.includes('::1');

  if (!isAllowed) {
    log('ERROR', `Acesso direto bloqueado fora do Ingress vindo de: ${remoteIp}`);
    return res
      .status(403)
      .json({ error: 'Acesso permitido apenas via Home Assistant Ingress.' });
  }

  next();
}

module.exports = { ingressGuard };