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

  for (const device of devices) {
    const { device_id, device_name, cpd_id, cpd_name, client_id, last_seen_at, heartbeat_timeout_sec } = device;

    if (!last_seen_at) {
      // Device nunca enviou dados — não alerta ainda, aguarda primeiro envio
      continue;
    }

    const secondsSinceLastSeen = (Date.now() - new Date(last_seen_at).getTime()) / 1000;
    const isOffline = secondsSinceLastSeen > heartbeat_timeout_sec;

    if (isOffline) {
      logger.warn('Heartbeat: device offline', {
        deviceId: device_id, deviceName: device_name,
        cpdId: cpd_id, secondsSince: Math.round(secondsSinceLastSeen),
      });

      await triggerCommFailure({ device, secondsSinceLastSeen });
    } else {
      // Device está online — resolve alerta de falha se existia
      await resolveCommFailure(cpd_id, device_id, cpd_name, client_id);
    }
  }
}

async function triggerCommFailure({ device, secondsSinceLastSeen }) {
  const { device_id, cpd_id, cpd_name } = device;

  // Evita duplicar evento se já existe um aberto
  const existing = await alertModel.findOpenEvent(cpd_id, 'comm_failure');
  if (existing) return; // já notificado

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

  // Busca subscriptions para comm_failure
  const subscriptions = await alertModel.findEligibleSubscriptions(cpd_id, 'comm_failure', 'critical');

  const cpd = { cpd_name, client_name: clientName };

  for (const sub of subscriptions) {
    const destination = sub.channel === 'email' ? sub.email : sub.whatsapp;
    if (!destination) continue;

    const recent = await alertModel.findRecentDispatch(sub.contact_id, 'comm_failure', sub.cooldown_minutes);
    if (recent) continue;

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
    severity: 'info', value: null, threshold: null, message,
  });

  const subscriptions = await alertModel.findEligibleSubscriptions(cpdId, 'comm_restored', 'info');
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
      severity:    'info',
      value:       null,
      threshold:   null,
      cpdName,
      clientName,
      contactName: sub.contact_name,
      message,
    });
  }
}

module.exports = { start };
