const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("cha-solar.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,

    pv_power REAL DEFAULT 0,
    pv_voltage REAL DEFAULT 0,
    pv_current REAL DEFAULT 0,

    grid_power REAL DEFAULT 0,
    grid_voltage REAL DEFAULT 0,
    grid_current REAL DEFAULT 0,

    consumer1_power REAL DEFAULT 0,
    consumer1_current REAL DEFAULT 0,

    consumer2_power REAL DEFAULT 0,
    consumer2_current REAL DEFAULT 0,

    inverter_voltage REAL DEFAULT 0,
    inverter_current REAL DEFAULT 0,
    load_percent REAL DEFAULT 0,
    inverter_temperature REAL DEFAULT 0,
    inverter_mode TEXT,

    battery_soc REAL DEFAULT 0,
    battery_voltage REAL DEFAULT 0,
    battery_current REAL DEFAULT 0,
    battery_power REAL DEFAULT 0,
    battery_state TEXT
  )
`);

const insertHistory = db.prepare(`
  INSERT INTO history (
    timestamp,

    pv_power,
    pv_voltage,
    pv_current,

    grid_power,
    grid_voltage,
    grid_current,

    consumer1_power,
    consumer1_current,

    consumer2_power,
    consumer2_current,

    inverter_voltage,
    inverter_current,
    load_percent,
    inverter_temperature,
    inverter_mode,

    battery_soc,
    battery_voltage,
    battery_current,
    battery_power,
    battery_state
  )

  VALUES (
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?
  )
`);


function saveHistory(data) {

  insertHistory.run(

    new Date().toISOString(),

    data.solar.power,
    data.solar.voltage,
    data.solar.current,

    data.grid.power,
    data.grid.voltage,
    data.grid.current,

    data.consumer1.power,
    data.consumer1.current,

    data.consumer2.power,
    data.consumer2.current,

    data.inverter.voltage,
    data.inverter.current,
    data.inverter.loadPercent,
    data.inverter.temperature,
    data.inverter.mode,

    data.battery.soc,
    data.battery.voltage,
    data.battery.current,
    data.battery.power,
    data.battery.state
  );
}


function getLatest(limit = 100) {

  const safeLimit =
    Math.min(
      Math.max(Number(limit) || 100, 1),
      5000
    );

  return db.prepare(`
    SELECT *
    FROM history
    ORDER BY id DESC
    LIMIT ?
  `).all(safeLimit);
}


function getCount() {

  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM history
  `).get();
}


module.exports = {
  db,
  saveHistory,
  getLatest,
  getCount
};