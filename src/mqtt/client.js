// src/mqtt/client.js
// Usado quando MQTT_BROKER_HOST está definido (EasyPanel com Mosquitto externo).
// Substitui o broker Aedes embutido — conecta como cliente no Mosquitto
// e assina todos os tópicos de dados dos devices.

const mqtt          = require('mqtt');
const deviceModel   = require('../models/device');
const influxService = require('../services/influx.service');
const engine        = require('../rules/engine');
const logger        = require('../utils/logger');

// Cache de devices: mqtt_client_id → info
const deviceCache = new Map();
const CACHE_TTL   = 5 * 60 * 1000; // 5 min

let client = null;

function connect() {
  const host     = process.env.MQTT_BROKER_HOST;
  const port     = parseInt(process.env.MQTT_BROKER_PORT) || 1883;
  const user     = process.env.MQTT_BROKER_USER     || 'cpd-backend';
  const password = process.env.MQTT_BROKER_PASSWORD || '';

  const url = `mqtt://${host}:${port}`;
  logger.info(`MQTT cliente: conectando em ${url}`);

  client = mqtt.connect(url, {
    clientId:           'cpd-backend-' + Math.random().toString(16).slice(2, 8),
    username:           user,
    password,
    clean:              true,
    reconnectPeriod:    5000,   // tenta reconectar a cada 5s
    connectTimeout:     15000,
    keepalive:          60,
  });

  client.on('connect', () => {
    logger.info('MQTT cliente: conectado ao broker');
    // Assina todos os tópicos de dados dos devices
    client.subscribe('cpd/+/data',   { qos: 1 });
    client.subscribe('cpd/+/status', { qos: 0 });
    logger.info('MQTT cliente: inscrito em cpd/+/data e cpd/+/status');
  });

  client.on('message', async (topic, payload) => {
    try {
      await handleMessage(topic, payload.toString());
    } catch (err) {
      logger.error('MQTT cliente: erro ao processar mensagem', { topic, error: err.message });
    }
  });

  client.on('reconnect', () => {
    logger.warn('MQTT cliente: reconectando...');
  });

  client.on('error', (err) => {
    logger.error('MQTT cliente: erro', { error: err.message });
  });

  client.on('offline', () => {
    logger.warn('MQTT cliente: offline');
  });

  return client;
}

async function handleMessage(topic, payload) {
  // Extrai mqtt_client_id do tópico: cpd/{mqtt_client_id}/data
  const parts = topic.split('/');
  if (parts.length !== 3) return;

  const [, mqttClientId, type] = parts;
  if (type !== 'data') return;

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    logger.warn('MQTT cliente: payload inválido', { topic, payload });
    return;
  }

  const { temperature, humidity } = data;
  if (typeof temperature !== 'number' || typeof humidity !== 'number') {
    logger.warn('MQTT cliente: campos inválidos', { data });
    return;
  }

  // Busca device (com cache)
  const device = await getDevice(mqttClientId);
  if (!device) {
    logger.warn('MQTT cliente: device desconhecido', { mqttClientId });
    return;
  }

  if (!device.device_active || !device.cpd_active || !device.client_active) {
    logger.warn('MQTT cliente: device/CPD/cliente inativo', { mqttClientId });
    return;
  }

  logger.debug('MQTT cliente: leitura recebida', {
    device: device.device_name, cpd: device.cpd_name, temperature, humidity,
  });

  // Atualiza last_seen
  await deviceModel.updateLastSeen(device.device_id).catch(e =>
    logger.error('last_seen: erro', { error: e.message }),
  );

  // Grava no InfluxDB
  await influxService.writeReading({
    deviceId:    device.device_id,
    cpdId:       device.cpd_id,
    clientId:    device.client_id,
    temperature,
    humidity,
    timestamp:   data.ts ? new Date(data.ts) : new Date(),
  }).catch(e => logger.error('InfluxDB: erro', { error: e.message }));

  // Motor de regras
  await engine.evaluate({
    deviceId:    device.device_id,
    cpdId:       device.cpd_id,
    clientId:    device.client_id,
    temperature,
    humidity,
  }).catch(e => logger.error('Motor: erro', { error: e.message }));
}

async function getDevice(mqttClientId) {
  const cached = deviceCache.get(mqttClientId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached;

  const device = await deviceModel.findByMqttClientId(mqttClientId);
  if (device) deviceCache.set(mqttClientId, { ...device, cachedAt: Date.now() });
  return device || null;
}

// Publica comando para um device específico
function publishCommand(mqttClientId, cmd) {
  if (!client?.connected) {
    logger.warn('MQTT cliente: tentativa de publicar sem conexão');
    return false;
  }
  const topic   = `cpd/${mqttClientId}/cmd`;
  const payload = JSON.stringify({ cmd });
  client.publish(topic, payload, { qos: 1 });
  logger.info('MQTT cliente: comando enviado', { mqttClientId, cmd });
  return true;
}

module.exports = { connect, publishCommand };
