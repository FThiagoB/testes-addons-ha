const express = require('express');
const path = require('path');
const apiRoutes = require('./routes');
const { ingressGuard } = require('./middlewares/ingressGuard');

const app = express();

// app.use(ingressGuard);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', apiRoutes);

// SPA fallback para o frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;