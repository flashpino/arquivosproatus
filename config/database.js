// config/database.js
const mysql2 = require('mysql2/promise');
const Influx = require('influx');
const logger = require('../src/utils/logger');

// ── MySQL ────────────────────────────────────────────────────
const mysqlPool = mysql2.createPool({
  host:               process.env.MYSQL_HOST     || 'localhost',
  port:               parseInt(process.env.MYSQL_PORT) || 3306,
  user:               process.env.MYSQL_USER,
  password:           process.env.MYSQL_PASSWORD,
  database:           process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '-03:00',
});

mysqlPool.on('connection', () => {
  logger.info('MySQL: nova conexão estabelecida');
});

async function testMySQL() {
  const conn = await mysqlPool.getConnection();
  await conn.ping();
  conn.release();
  logger.info('MySQL: conexão OK');
}

// ── InfluxDB ─────────────────────────────────────────────────
const influx = new Influx.InfluxDB({
  host:     process.env.INFLUX_HOST?.replace(/https?:\/\//, '') || 'localhost',
  port:     parseInt(process.env.INFLUX_PORT) || 8086,
  database: process.env.INFLUX_DATABASE || 'cpd_readings',
  username: process.env.INFLUX_USERNAME,
  password: process.env.INFLUX_PASSWORD,
  schema: [
    {
      measurement: 'sensor_readings',
      fields: {
        temperature: Influx.FieldType.FLOAT,
        humidity:    Influx.FieldType.FLOAT,
        heat_index:  Influx.FieldType.FLOAT,
      },
      tags: ['device_id', 'cpd_id', 'client_id'],
    },
  ],
});

async function testInflux() {
  const names = await influx.getDatabaseNames();
  if (!names.includes(process.env.INFLUX_DATABASE)) {
    await influx.createDatabase(process.env.INFLUX_DATABASE);
    logger.info(`InfluxDB: banco '${process.env.INFLUX_DATABASE}' criado`);
  }
  logger.info('InfluxDB: conexão OK');
}

module.exports = { mysqlPool, influx, testMySQL, testInflux };
