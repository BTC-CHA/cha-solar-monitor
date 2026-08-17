// =====================================================
// CHA SOLAR - HARDWARE ADAPTER
// =====================================================

const MODE = "SIMULATOR";

// =====================================================
// TEST MODE
// true  = บังคับ Battery Low เพื่อทดสอบ Alarm
// false = กลับค่าปกติ
// =====================================================

const TEST_BATTERY_LOW = false;


// =====================================================
// DEVICE MAP
// ADDRESS ทั้งหมดเป็น PLACEHOLDER
// ห้ามใช้กับ Hardware จริง
// =====================================================

const DEVICE_MAP = {

  solar: {
    device: "SRNE_INVERTER",
    protocol: "MODBUS_RTU",
    slaveId: 1,

    address: {
      voltage: "0x1000",
      current: "0x1001",
      power: "0x1002"
    }
  },

  grid: {
    device: "SRNE_INVERTER",
    protocol: "MODBUS_RTU",
    slaveId: 1,

    address: {
      voltage: "0x1010",
      current: "0x1011",
      power: "0x1012"
    }
  },

  inverter: {
    device: "SRNE_INVERTER",
    protocol: "MODBUS_RTU",
    slaveId: 1,

    address: {
      voltage: "0x1020",
      current: "0x1021",
      loadPercent: "0x1022",
      temperature: "0x1023",
      mode: "0x1024"
    }
  },

  consumer1: {
    device: "ESP32_CT",
    protocol: "HTTP",
    host: "192.168.1.60",

    address: {
      voltage: "0x2000",
      current: "0x2001",
      power: "0x2002"
    }
  },

  consumer2: {
    device: "SRNE_INVERTER",
    protocol: "MODBUS_RTU",
    slaveId: 1,

    address: {
      voltage: "0x1030",
      current: "0x1031",
      power: "0x1032"
    }
  },

  battery: {
    device: "SRNE_INVERTER",
    protocol: "MODBUS_RTU",
    slaveId: 1,

    address: {
      soc: "0x1040",
      voltage: "0x1041",
      current: "0x1042",
      power: "0x1043",
      state: "0x1044"
    }
  }

};


// =====================================================
// SIMULATOR DATA
// =====================================================

let simulatorData = {

  solar: {
    voltage: 138.4,
    current: 14.2,
    power: 1965
  },

  grid: {
    voltage: 230.4,
    current: 0,
    power: 0
  },

  inverter: {
    voltage: 231.2,
    current: 4.1,
    loadPercent: 19,
    temperature: 39.5,
    mode: "MAINS OPERATION"
  },

  consumer1: {
    voltage: 230,
    current: 2.8,
    power: 644
  },

  consumer2: {
    voltage: 231.2,
    current: 4.1,
    power: 948
  },

  battery: {
    soc: TEST_BATTERY_LOW ? 15 : 82,
    voltage: 52.6,
    current: -0.5,
    power: -26,
    state: "DISCHARGING"
  },

  system: {
    online: true,
    mode: "SIMULATOR",
    source: TEST_BATTERY_LOW
      ? "SIMULATOR_TEST"
      : "SIMULATOR"
  }

};


// =====================================================
// HELPERS
// =====================================================

function move(value, amount) {
  return value + (Math.random() - 0.5) * amount;
}


function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}


// =====================================================
// UPDATE SIMULATOR
// =====================================================

function updateSimulator() {

  // SOLAR
  simulatorData.solar.voltage =
    clamp(
      move(
        simulatorData.solar.voltage,
        1.2
      ),
      120,
      150
    );

  simulatorData.solar.current =
    clamp(
      move(
        simulatorData.solar.current,
        0.8
      ),
      0,
      25
    );

  simulatorData.solar.power =
    Math.round(
      simulatorData.solar.voltage *
      simulatorData.solar.current
    );


  // GRID
  simulatorData.grid.voltage =
    clamp(
      move(
        simulatorData.grid.voltage,
        0.5
      ),
      220,
      240
    );

  simulatorData.grid.current =
    clamp(
      move(
        simulatorData.grid.current,
        0.12
      ),
      0,
      20
    );

  simulatorData.grid.power =
    Math.round(
      simulatorData.grid.voltage *
      simulatorData.grid.current
    );


  // CONSUMER 1
  simulatorData.consumer1.current =
    clamp(
      move(
        simulatorData.consumer1.current,
        0.4
      ),
      0,
      20
    );

  simulatorData.consumer1.power =
    Math.round(
      simulatorData.consumer1.voltage *
      simulatorData.consumer1.current
    );


  // CONSUMER 2
  simulatorData.consumer2.current =
    clamp(
      move(
        simulatorData.consumer2.current,
        0.5
      ),
      0.2,
      20
    );

  simulatorData.consumer2.power =
    Math.round(
      simulatorData.consumer2.voltage *
      simulatorData.consumer2.current
    );


  // INVERTER
  simulatorData.inverter.voltage =
    clamp(
      move(
        simulatorData.inverter.voltage,
        0.3
      ),
      220,
      240
    );

  simulatorData.inverter.current =
    simulatorData.consumer2.current;

  simulatorData.inverter.loadPercent =
    clamp(
      Math.round(
        (
          simulatorData.consumer2.power /
          5000
        ) * 100
      ),
      0,
      100
    );

  simulatorData.inverter.temperature =
    clamp(
      move(
        simulatorData.inverter.temperature,
        0.15
      ),
      25,
      70
    );


  // BATTERY
  simulatorData.battery.voltage =
    clamp(
      move(
        simulatorData.battery.voltage,
        0.05
      ),
      48,
      58
    );

  simulatorData.battery.current =
    clamp(
      move(
        simulatorData.battery.current,
        0.3
      ),
      -20,
      20
    );

  simulatorData.battery.power =
    Math.round(
      simulatorData.battery.voltage *
      simulatorData.battery.current
    );


  if (simulatorData.battery.current > 0.2) {

    simulatorData.battery.state =
      "CHARGING";

    if (!TEST_BATTERY_LOW) {
      simulatorData.battery.soc += 0.005;
    }

  }

  else if (simulatorData.battery.current < -0.2) {

    simulatorData.battery.state =
      "DISCHARGING";

    if (!TEST_BATTERY_LOW) {
      simulatorData.battery.soc -= 0.005;
    }

  }

  else {

    simulatorData.battery.state =
      "STANDBY";
  }


  if (TEST_BATTERY_LOW) {

    // ล็อกไว้แถว 15% เพื่อทดสอบ Alarm
    simulatorData.battery.soc = 15;

  } else {

    simulatorData.battery.soc =
      clamp(
        simulatorData.battery.soc,
        0,
        100
      );
  }


  simulatorData.system.online = true;

  simulatorData.system.mode = MODE;

  simulatorData.system.source =
    TEST_BATTERY_LOW
      ? "SIMULATOR_TEST"
      : "SIMULATOR";


  return simulatorData;
}


// =====================================================
// REAL HARDWARE PLACEHOLDER
// =====================================================

async function readRealHardware() {

  return {

    solar: {
      voltage: 0,
      current: 0,
      power: 0
    },

    grid: {
      voltage: 0,
      current: 0,
      power: 0
    },

    inverter: {
      voltage: 0,
      current: 0,
      loadPercent: 0,
      temperature: 0,
      mode: "WAITING"
    },

    consumer1: {
      voltage: 0,
      current: 0,
      power: 0
    },

    consumer2: {
      voltage: 0,
      current: 0,
      power: 0
    },

    battery: {
      soc: 0,
      voltage: 0,
      current: 0,
      power: 0,
      state: "WAITING"
    },

    system: {
      online: false,
      mode: "REAL",
      source: "HARDWARE_WAITING"
    }

  };
}


// =====================================================
// MAIN READER
// =====================================================

async function readData() {

  if (MODE === "SIMULATOR") {
    return updateSimulator();
  }

  if (MODE === "REAL") {

    try {

      return await readRealHardware();

    } catch (error) {

      console.error(
        "HARDWARE ERROR:",
        error.message
      );

      return {

        ...simulatorData,

        system: {
          online: false,
          mode: "REAL",
          source: "HARDWARE_ERROR",
          error: error.message
        }

      };
    }
  }

  throw new Error(
    `Unknown hardware MODE: ${MODE}`
  );
}


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  MODE,
  DEVICE_MAP,
  readData
};