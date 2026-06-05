// src/rules/heartbeat.js
const cron          = require('node-cron');
const deviceModel   = require('../models/device');
const alertModel    = require('../models/alert');
const webhookService = require('../services/webhook.service');
const { mysqlPool } = require('../../config/database');
const logger        = require('../utils/logger');

/**
 * Inicia o cron job de verificação de heartbeat.
 * Roda a cada minuto por padrão (configurável via HEARTBEAT_CRON).
 */
function start() {
  const cronExpr = process.env.HEARTBEAT_CRON || '* * * * *';

  cron.schedule(cronExpr, async () => {
    try {
      await checkHeartbeats();
    } catch (err) {
      logger.error('Heartbeat cron: erro inesperado', { error: err.message });
    }
  });

  logger.info(`Heartbeat checker iniciado (${cronExpr})`);
}

async function checkHeartbeats() {
  const devices = await deviceModel.findAllActiveWithCpd();

  logger.info(`Heartbeat: verificando ${devices.length} device(s)`);

  for (const device of devices) {
    const { device_id, device_name, cpd_id, cpd_name, client_id, last_seen_at, heartbeat_timeout_sec } = device;

    if (!last_seen_at) {
      logger.info('Heartbeat: device sem last_seen_at, ignorando', { deviceId: device_id, deviceName: device_name });
      continue;
    }

    const lastSeenMs = new Date(last_seen_at).getTime();
    const nowMs      = Date.now();
    const secondsSinceLastSeen = (nowMs - lastSeenMs) / 1000;
    const isOffline  = secondsSinceLastSeen > heartbeat_timeout_sec;

    logger.info('Heartbeat: status do device', {
      deviceId:     device_id,
      deviceName:   device_name,
      lastSeenAt:   last_seen_at,
      secondsSince: Math.round(secondsSinceLastSeen),
      timeoutSec:   heartbeat_timeout_sec,
      isOffline,
    });

    if (isOffline) {
      logger.warn('Heartbeat: device OFFLINE — disparando comm_failure', {
        deviceId: device_id, deviceName: device_name,
        cpdId: cpd_id, secondsSince: Math.round(secondsSinceLastSeen),
      });

      await triggerCommFailure({ device, secondsSinceLastSeen });
    } else {
      await resolveCommFailure(cpd_id, device_id, cpd_name, client_id);
    }
  }
}

async function triggerCommFailure({ device, secondsSinceLastSeen }) {
  const { device_id, cpd_id, cpd_name } = device;

  // Evita duplicar evento se já existe um aberto
  const existing = await alertModel.findOpenEvent(cpd_id, 'comm_failure');
  if (existing) {
    logger.info('Heartbeat: comm_failure já registrado, ignorando duplicata', { cpdId: cpd_id, eventId: existing.id });
    return;
  }

  // Busca nome do cliente
  const [clientRows] = await mysqlPool.query(
    'SELECT cl.name AS client_name FROM cpds c JOIN clients cl ON cl.id = c.client_id WHERE c.id = ?',
    [cpd_id],
  );
  const clientName = clientRows[0]?.client_name || 'Desconhecido';

  const message = `🔴 FALHA DE COMUNICAÇÃO\n[${clientName}] ${cpd_name}\nÚltimo sinal há ${Math.round(secondsSinceLastSeen / 60)} min`;

  const eventId = await alertModel.createEvent({
    cpdId:     cpd_id,
    deviceId:  device_id,
    alertType: 'comm_failure',
    severity:  'critical',
    value:     null,
    threshold: null,
    message,
  });

  logger.warn('Heartbeat: evento comm_failure criado', { eventId, cpdId: cpd_id, deviceId: device_id });

  // Busca subscriptions para comm_failure
  const subscriptions = await alertModel.findEligibleSubscriptions(cpd_id, 'comm_failure', 'critical');

  logger.info('Heartbeat: subscriptions elegíveis para comm_failure', {
    cpdId: cpd_id,
    total: subscriptions.length,
    contacts: subscriptions.map(s => s.contact_name),
  });

  if (!subscriptions.length) {
    logger.warn('Heartbeat: nenhuma subscription encontrada para comm_failure — ninguém será notificado', { cpdId: cpd_id });
    return;
  }

  for (const sub of subscriptions) {
    const destination = sub.channel === 'email' ? sub.email : sub.whatsapp;
    if (!destination) {
      logger.warn('Heartbeat: contato sem número/email configurado', { contactId: sub.contact_id, contactName: sub.contact_name });
      continue;
    }

    const recent = await alertModel.findRecentDispatch(sub.contact_id, 'comm_failure', sub.cooldown_minutes);
    if (recent) {
      logger.info('Heartbeat: cooldown ativo para contato', { contactId: sub.contact_id, cooldown: sub.cooldown_minutes });
      continue;
    }

    const channel = sub.channel === 'both' ? 'whatsapp' : sub.channel;

    const dispatchId = await alertModel.createDispatch({
      alertEventId:   eventId,
      contactId:      sub.contact_id,
      subscriptionId: sub.subscription_id,
      channel,
      destination,
      status:         'pending',
    });

    logger.info('Heartbeat: disparando webhook comm_failure', {
      dispatchId, contactName: sub.contact_name, channel, destination,
    });

    await webhookService.send({
      dispatchId,
      channel,
      destination,
      alertType:   'comm_failure',
      severity:    'critical',
      value:       null,
      threshold:   null,
      cpdName:     cpd_name,
      clientName,
      contactName: sub.contact_name,
      message,
    });
  }
}

async function resolveCommFailure(cpdId, deviceId, cpdName, clientId) {
  const open = await alertModel.findOpenEvent(cpdId, 'comm_failure');
  if (!open) return;

  await alertModel.resolveEvent(open.id);
  logger.info('Heartbeat: comunicação restaurada', { cpdId, deviceId });

  // Notifica restauração
  const [clientRows] = await mysqlPool.query(
    'SELECT name FROM clients WHERE id = ?', [clientId],
  );
  const clientName = clientRows[0]?.name || 'Desconhecido';
  const message = `✅ Comunicação restaurada\n[${clientName}] ${cpdName}`;

  const eventId = await alertModel.createEvent({
    cpdId, deviceId, alertType: 'comm_restored',
    severity: 'warning', value: null, threshold: null, message,
  });

  // Usa subscriptions de comm_failure — quem quer saber da queda também quer saber do retorno
  const subscriptions = await alertModel.findEligibleSubscriptions(cpdId, 'comm_failure', 'critical');
  for (const sub of subscriptions) {
    const destination = sub.channel === 'email' ? sub.email : sub.whatsapp;
    if (!destination) continue;

    const dispatchId = await alertModel.createDispatch({
      alertEventId:   eventId,
      contactId:      sub.contact_id,
      subscriptionId: sub.subscription_id,
      channel:        sub.channel === 'both' ? 'whatsapp' : sub.channel,
      destination,
      status:         'pending',
    });

    await webhookService.send({
      dispatchId,
      channel:     sub.channel === 'both' ? 'whatsapp' : sub.channel,
      destination,
      alertType:   'comm_restored',
      severity:    'warning',
      value:       null,
      threshold:   null,
      cpdName,
      clientName,
      contactName: sub.contact_name,
      message,
    });
  }
}

module.exports = { start, checkHeartbeats };
