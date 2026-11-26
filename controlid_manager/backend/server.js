const app = require('./src/app');
const { log } = require('./src/utils/logger');

const PORT = process.env.PORT || 8099;

const server = app.listen(PORT, () => {
  log('INFO', `ControlID Addon rodando na porta ${PORT}`);
});

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