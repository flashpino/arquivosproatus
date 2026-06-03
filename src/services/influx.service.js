// src/services/influx.service.js
const { influx } = require('../../config/database');
const logger     = require('../utils/logger');

/**
 * Grava uma leitura de sensor no InfluxDB.
 * @param {object} p
 * @param {number} p.deviceId
 * @param {number} p.cpdId
 * @param {number} p.clientId
 * @param {number} p.temperature   — graus Celsius
 * @param {number} p.humidity      — percentual relativo
 * @param {Date}   [p.timestamp]   — padrão: agora
 */
async function writeReading({ deviceId, cpdId, clientId, temperature, humidity, timestamp }) {
  // Heat Index (índice de calor) — fórmula de Rothfusz simplificada
  const hi = heatIndex(temperature, humidity);

  await influx.writePoints([
    {
      measurement: 'sensor_readings',
      tags: {
        device_id: String(deviceId),
        cpd_id:    String(cpdId),
        client_id: String(clientId),
      },
      fields: {
        temperature,
        humidity,
        heat_index: hi,
      },
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    },
  ]);

  logger.debug('InfluxDB: leitura gravada', { deviceId, cpdId, temperature, humidity });
}

/**
 * Busca as últimas N leituras de um CPD.
 */
async function getLastReadings(cpdId, limit = 60) {
  const query = `
    SELECT mean("temperature") AS temperature,
           mean("humidity")    AS humidity,
           mean("heat_index")  AS heat_index
    FROM "sensor_readings"
    WHERE "cpd_id" = '${cpdId}'
    GROUP BY time(1m)
    ORDER BY time DESC
    LIMIT ${parseInt(limit)}
  `;
  return influx.query(query);
}

/**
 * Busca leituras de um CPD em um intervalo de tempo.
 */
async function getReadingsByRange(cpdId, from, to) {
  const query = `
    SELECT mean("temperature") AS temperature,
           mean("humidity")    AS humidity
    FROM "sensor_readings"
    WHERE "cpd_id" = '${cpdId}'
      AND time >= '${from.toISOString()}'
      AND time <= '${to.toISOString()}'
    GROUP BY time(5m)
    ORDER BY time ASC
  `;
  return influx.query(query);
}

/**
 * Calcula o Heat Index (sensação térmica) combinando temperatura e umidade.
 * Retorna null se temperatura < 27°C (fórmula não se aplica).
 */
function heatIndex(tempC, humidity) {
  const T = tempC * 9 / 5 + 32; // Fahrenheit
  const R = humidity;
  if (T < 80) return null;

  const HI =
    -42.379
    + 2.04901523  * T
    + 10.14333127 * R
    - 0.22475541  * T * R
    - 0.00683783  * T * T
    - 0.05481717  * R * R
    + 0.00122874  * T * T * R
    + 0.00085282  * T * R * R
    - 0.00000199  * T * T * R * R;

  return parseFloat(((HI - 32) * 5 / 9).toFixed(2)); // volta para Celsius
}

module.exports = { writeReading, getLastReadings, getReadingsByRange };
