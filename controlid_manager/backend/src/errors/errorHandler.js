const { log } = require('../utils/logger');

function handleApiError(res, error) {
  log('ERROR', `[ControlID API Error]: ${error.message}`);
  const status = error.statusCode || 500;
  res.status(status).json({
    error: error.message || 'Erro interno ao comunicar com o Control iD.',
    code: error.code || 'INTERNAL_ERROR',
  });
}

module.exports = { handleApiError };