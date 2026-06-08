// src/index.js — versão EasyPanel
// Detecta automaticamente se deve usar Mosquitto externo ou Aedes embutido
require('dotenv').config();
const fs        = require('fs');
const path      = require('path');
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const logger              = require('./utils/logger');
const { testMySQL, testInflux } = require('../config/database');
const heartbeat           = require('./rules/heartbeat');
const apiRoutes           = require('./api/routes/index');

// Pasta de logs
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir);

async function bootstrap() {
  logger.info('Iniciando CPD Monitor...');
  logger.info(`Modo MQTT: ${process.env.MQTT_BROKER_HOST ? 'Mosquitto externo' : 'Aedes embutido'}`);

  await testMySQL();
  await testInflux();

  // ── Express ───────────────────────────────────────────────
  const app = express();
  app.set('trust proxy', 1); // Confia no proxy reverso (EasyPanel/Caddy/Traefik)
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*', methods: ['GET','POST','PUT','DELETE'] }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '../public')));

  app.use(rateLimit({
    windowMs: 60 * 1000, max: 200,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'Muitas requisições' },
  }));
  app.use('/api/auth/login', rateLimit({
    windowMs: 15 * 60 * 1000, max: 10,
    message: { error: 'Muitas tentativas de login' },
  }));

  app.use('/api', apiRoutes);
  app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date() }));
  app.use((err, req, res, _next) => {
    logger.error('API: erro', { error: err.message });
    res.status(500).json({ error: 'Erro interno' });
  });

  const PORT = parseInt(process.env.PORT) || 3000;
  app.listen(PORT, () => logger.info(`API REST na porta ${PORT}`));

  // ── MQTT: Mosquitto externo ou Aedes embutido ─────────────
  if (process.env.MQTT_BROKER_HOST) {
    // EasyPanel: conecta no Mosquitto como cliente
    const mqttClient = require('./mqtt/client');
    mqttClient.connect();
  } else {
    // Dev local: sobe o Aedes embutido
    const { createBroker } = require('./mqtt/broker');
    createBroker();
  }

  // ── Heartbeat checker ─────────────────────────────────────
  heartbeat.start();

  logger.info('CPD Monitor iniciado ✓');
}

bootstrap().catch(err => {
  logger.error('Erro fatal', { error: err.message, stack: err.stack });
  process.exit(1);
});

// Encerramento gracioso. Em container, o Node roda como PID 1 e, sem um
// handler próprio, IGNORA o SIGTERM — fazendo a instância antiga sobreviver
// ao deploy e rodar o heartbeat/MQTT em paralelo (instâncias zumbis).
// Registrar o handler garante que ela saia imediatamente ao receber o sinal.
function shutdown(signal) {
  logger.info(`Sinal ${signal} recebido — encerrando processo`);
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
