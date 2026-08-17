const express = require("express");

const {
  saveHistory,
  getLatest,
  getCount
} = require("./database");

const {
  MODE,
  DEVICE_MAP,
  readData
} = require("./hardware");

const {
  checkAlarms,
  getActiveAlarms,
  getEvents,
  getAlarmStatus
} = require("./alarms");


const app = express();

const PORT = 3000;

let latestData = null;


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  express.json()
);


app.use(
  (req, res, next) => {

    res.header(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    next();

  }
);


// =====================================================
// DATA LOOP
// =====================================================

setInterval(
  async () => {

    try {

      const data =
        await readData();


      latestData =
        data;


      // -------------------------
      // ALARM ENGINE
      // -------------------------

      checkAlarms(
        data
      );


      // -------------------------
      // DATABASE HISTORY
      // -------------------------

      saveHistory(
        data
      );

    }

    catch (error) {

      console.error(
        "DATA LOOP ERROR:",
        error.message
      );

    }

  },
  1000
);


// =====================================================
// REALTIME API
// =====================================================

app.get(
  "/api/realtime",

  async (req, res) => {

    try {

      if (!latestData) {

        latestData =
          await readData();

      }


      res.json({

        timestamp:
          new Date().toISOString(),

        ...latestData,

        alarmStatus:
          getAlarmStatus()

      });

    }

    catch (error) {

      res
        .status(500)
        .json({

          error:
            "REALTIME_DATA_ERROR",

          message:
            error.message

        });

    }

  }
);


// =====================================================
// HISTORY API
// =====================================================

app.get(
  "/api/history",

  (req, res) => {

    try {

      const limit =
        req.query.limit ||
        100;


      res.json({

        count:
          getCount().total,

        data:
          getLatest(limit)

      });

    }

    catch (error) {

      res
        .status(500)
        .json({

          error:
            "HISTORY_ERROR",

          message:
            error.message

        });

    }

  }
);


// =====================================================
// ACTIVE ALARMS API
// =====================================================

app.get(
  "/api/alarms",

  (req, res) => {

    const status =
      getAlarmStatus();


    res.json({

      timestamp:
        new Date().toISOString(),

      ...status

    });

  }
);


// =====================================================
// EVENTS API
// =====================================================

app.get(
  "/api/events",

  (req, res) => {

    const limit =
      req.query.limit ||
      100;


    const events =
      getEvents(limit);


    res.json({

      count:
        events.length,

      data:
        events

    });

  }
);


// =====================================================
// DEVICE MAP API
// =====================================================

app.get(
  "/api/devices",

  (req, res) => {

    res.json({

      system:
        "CHA SOLAR MONITOR",

      mode:
        MODE,

      warning:

        MODE ===
        "SIMULATOR"

          ? "Addresses are placeholders. Do not use them on real hardware."

          : null,

      devices:
        DEVICE_MAP

    });

  }
);


// =====================================================
// SIMPLE COMPATIBILITY API
// =====================================================

app.get(
  "/data",

  async (req, res) => {

    try {

      if (!latestData) {

        latestData =
          await readData();

      }


      res.json({

        pv:
          latestData
            .solar
            .power,

        grid:
          latestData
            .grid
            .power,

        load:
          latestData
            .consumer2
            .power,

        battery:
          Math.round(
            latestData
              .battery
              .soc
          )

      });

    }

    catch (error) {

      res
        .status(500)
        .json({

          error:
            "SIMPLE_DATA_ERROR",

          message:
            error.message

        });

    }

  }
);


// =====================================================
// STATUS API
// =====================================================

app.get(
  "/api/status",

  (req, res) => {

    const alarmStatus =
      getAlarmStatus();


    res.json({

      system:
        "CHA SOLAR MONITOR",

      mode:
        MODE,

      online:
        latestData
          ?.system
          ?.online
        ?? false,

      source:
        latestData
          ?.system
          ?.source
        ?? "WAITING",

      historyRecords:
        getCount().total,

      alarms: {

        active:
          alarmStatus.active,

        critical:
          alarmStatus.critical,

        warning:
          alarmStatus.warning,

        info:
          alarmStatus.info

      },

      timestamp:
        new Date().toISOString()

    });

  }
);


// =====================================================
// STATUS PAGE
// =====================================================

app.get(
  "/",

  (req, res) => {

    res.send(`
      <h1>
        CHA Solar API
      </h1>

      <p>
        Mode: ${MODE}
      </p>

      <ul>

        <li>
          /api/realtime
        </li>

        <li>
          /api/history
        </li>

        <li>
          /api/alarms
        </li>

        <li>
          /api/events
        </li>

        <li>
          /api/devices
        </li>

        <li>
          /api/status
        </li>

        <li>
          /data
        </li>

      </ul>
    `);

  }
);


// =====================================================
// START SERVER
// =====================================================

app.listen(
  PORT,
  "0.0.0.0",

  async () => {

    try {

      latestData =
        await readData();


      checkAlarms(
        latestData
      );

    }

    catch (error) {

      console.error(
        "INITIAL DATA ERROR:",
        error.message
      );

    }


    console.log("");

    console.log(
      "===================================="
    );

    console.log(
      " CHA SOLAR SERVER ONLINE"
    );

    console.log(
      "===================================="
    );

    console.log(
      `MODE     : ${MODE}`
    );

    console.log(
      `REALTIME : http://localhost:${PORT}/api/realtime`
    );

    console.log(
      `HISTORY  : http://localhost:${PORT}/api/history`
    );

    console.log(
      `ALARMS   : http://localhost:${PORT}/api/alarms`
    );

    console.log(
      `EVENTS   : http://localhost:${PORT}/api/events`
    );

    console.log(
      `DEVICES  : http://localhost:${PORT}/api/devices`
    );

    console.log(
      `STATUS   : http://localhost:${PORT}/api/status`
    );

    console.log(
      `DATA     : http://localhost:${PORT}/data`
    );

    console.log(
      "===================================="
    );

    console.log("");

  }
);