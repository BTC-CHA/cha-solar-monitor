// =====================================================
// CHA SOLAR - ALARM / EVENT ENGINE
// =====================================================

const ALARM_CONFIG = {
  batteryLow: 20,        // %
  batteryCritical: 10,   // %
  inverterHot: 60,       // °C
  inverterCritical: 70,  // °C
  gridLowVoltage: 190,   // V
  solarMinimum: 10       // W
};


// เก็บสถานะ Alarm ปัจจุบัน
const activeAlarms = new Map();

// เก็บ Event ล่าสุดใน RAM
const events = [];

const MAX_EVENTS = 500;


// =====================================================
// ADD EVENT
// =====================================================

function addEvent(type, code, message, value = null) {

  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    type,
    code,
    message,
    value
  };

  events.unshift(event);

  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }

  console.log(
    `[${type}] ${code}: ${message}`
  );

  return event;
}


// =====================================================
// ACTIVATE ALARM
// =====================================================

function activateAlarm(
  code,
  level,
  message,
  value = null
) {

  // ถ้า Active อยู่แล้ว ไม่สร้างซ้ำทุกวินาที
  if (activeAlarms.has(code)) {

    const alarm =
      activeAlarms.get(code);

    alarm.value = value;
    alarm.lastSeen =
      new Date().toISOString();

    return;
  }


  const alarm = {
    code,
    level,
    message,
    value,

    active: true,

    startedAt:
      new Date().toISOString(),

    lastSeen:
      new Date().toISOString()
  };


  activeAlarms.set(
    code,
    alarm
  );


  addEvent(
    "ACTIVE",
    code,
    message,
    value
  );
}


// =====================================================
// CLEAR ALARM
// =====================================================

function clearAlarm(code) {

  if (!activeAlarms.has(code)) {
    return;
  }


  const alarm =
    activeAlarms.get(code);


  activeAlarms.delete(code);


  addEvent(
    "CLEARED",
    code,
    alarm.message,
    alarm.value
  );
}


// =====================================================
// CHECK ALL ALARMS
// =====================================================

function checkAlarms(data) {

  if (!data) {
    return;
  }


  // ---------------------------------------------------
  // SYSTEM OFFLINE
  // ---------------------------------------------------

  if (
    data.system &&
    data.system.online === false
  ) {

    activateAlarm(
      "SYSTEM_OFFLINE",
      "CRITICAL",
      "Hardware communication offline"
    );

  } else {

    clearAlarm(
      "SYSTEM_OFFLINE"
    );

  }


  // ---------------------------------------------------
  // BATTERY LOW
  // ---------------------------------------------------

  const soc =
    Number(
      data.battery?.soc
    );


  if (
    Number.isFinite(soc) &&
    soc <= ALARM_CONFIG.batteryCritical
  ) {

    clearAlarm(
      "BATTERY_LOW"
    );

    activateAlarm(
      "BATTERY_CRITICAL",
      "CRITICAL",
      "Battery SOC critically low",
      soc
    );

  }

  else if (
    Number.isFinite(soc) &&
    soc <= ALARM_CONFIG.batteryLow
  ) {

    clearAlarm(
      "BATTERY_CRITICAL"
    );

    activateAlarm(
      "BATTERY_LOW",
      "WARNING",
      "Battery SOC low",
      soc
    );

  }

  else {

    clearAlarm(
      "BATTERY_LOW"
    );

    clearAlarm(
      "BATTERY_CRITICAL"
    );

  }


  // ---------------------------------------------------
  // INVERTER TEMPERATURE
  // ---------------------------------------------------

  const temperature =
    Number(
      data.inverter?.temperature
    );


  if (
    Number.isFinite(temperature) &&
    temperature >=
      ALARM_CONFIG.inverterCritical
  ) {

    clearAlarm(
      "INVERTER_HOT"
    );

    activateAlarm(
      "INVERTER_OVER_TEMP",
      "CRITICAL",
      "Inverter temperature critical",
      temperature
    );

  }

  else if (
    Number.isFinite(temperature) &&
    temperature >=
      ALARM_CONFIG.inverterHot
  ) {

    clearAlarm(
      "INVERTER_OVER_TEMP"
    );

    activateAlarm(
      "INVERTER_HOT",
      "WARNING",
      "Inverter temperature high",
      temperature
    );

  }

  else {

    clearAlarm(
      "INVERTER_HOT"
    );

    clearAlarm(
      "INVERTER_OVER_TEMP"
    );

  }


  // ---------------------------------------------------
  // GRID
  // ---------------------------------------------------

  const gridVoltage =
    Number(
      data.grid?.voltage
    );


  if (
    Number.isFinite(gridVoltage) &&
    gridVoltage <
      ALARM_CONFIG.gridLowVoltage
  ) {

    activateAlarm(
      "GRID_LOST",
      "WARNING",
      "Grid voltage lost or too low",
      gridVoltage
    );

  }

  else {

    clearAlarm(
      "GRID_LOST"
    );

  }


  // ---------------------------------------------------
  // SOLAR
  //
  // ตอนนี้เป็น INFO เท่านั้น
  // ภายหลังควรเอาเวลา sunrise/sunset มาช่วย
  // ไม่งั้นกลางคืนจะถูกมองว่า Solar หาย
  // ---------------------------------------------------

  const solarPower =
    Number(
      data.solar?.power
    );


  if (
    Number.isFinite(solarPower) &&
    solarPower <
      ALARM_CONFIG.solarMinimum
  ) {

    activateAlarm(
      "SOLAR_NO_POWER",
      "INFO",
      "Solar production is near zero",
      solarPower
    );

  }

  else {

    clearAlarm(
      "SOLAR_NO_POWER"
    );

  }


  return getAlarmStatus();
}


// =====================================================
// GET ACTIVE ALARMS
// =====================================================

function getActiveAlarms() {

  return Array.from(
    activeAlarms.values()
  );

}


// =====================================================
// GET EVENTS
// =====================================================

function getEvents(limit = 100) {

  const safeLimit =
    Math.min(
      Math.max(
        Number(limit) || 100,
        1
      ),
      MAX_EVENTS
    );


  return events.slice(
    0,
    safeLimit
  );

}


// =====================================================
// STATUS
// =====================================================

function getAlarmStatus() {

  const alarms =
    getActiveAlarms();


  const critical =
    alarms.filter(
      alarm =>
        alarm.level === "CRITICAL"
    ).length;


  const warning =
    alarms.filter(
      alarm =>
        alarm.level === "WARNING"
    ).length;


  const info =
    alarms.filter(
      alarm =>
        alarm.level === "INFO"
    ).length;


  return {
    active: alarms.length,
    critical,
    warning,
    info,
    alarms
  };

}


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  ALARM_CONFIG,
  checkAlarms,
  getActiveAlarms,
  getEvents,
  getAlarmStatus
};