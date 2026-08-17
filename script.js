
const SUPABASE_URL = "https://txnveztxwqjsclwwtile.supabase.co";
const SUPABASE_KEY = "sb_publishable_ITFDtjM2BXv0jwaQq7x0jw_rZEXlrTU";

function updateMobileCards(data, source = "LIVE") {
  const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  set("mPvPower", Math.round(data.pvPower));
  set("mPvVoltage", data.pvVoltage.toFixed(1));
  set("mPvCurrent", data.pvCurrent.toFixed(1));
  set("mLoadPower", Math.round(data.loadPower));
  set("mLoadCurrent", data.loadCurrent.toFixed(1));
  set("mLoadPercent", data.loadPercent.toFixed(0));
  set("mBatterySOC", data.batterySOC.toFixed(0));
  set("mBatteryVoltage", data.batteryVoltage.toFixed(1));
  set("mBatteryCurrent", data.batteryCurrent.toFixed(1));
  set("mGridVoltage", data.gridVoltage.toFixed(1));
  set("mGridCurrent", data.gridCurrent.toFixed(1));
  set("mGridFrequency", data.gridFrequency.toFixed(2));
  set("mInvTemp", data.inverterTemperature.toFixed(1) + "°C");
  set("mInvMode", data.inverterMode.startsWith("STATE") ? "ONLINE" : data.inverterMode);

  const badge = document.getElementById("mobileSource");
  if (badge) {
    badge.textContent = source;
    badge.classList.toggle("cloud", source === "CLOUD");
  }
}

async function getSupabaseLatest() {
  const fields = [
    "recorded_at","grid_voltage","grid_current","grid_frequency",
    "load_power_w","load_current","load_percent",
    "battery_soc","battery_voltage","battery_current",
    "solar_power_w","solar_voltage","solar_current","temp_inverter","mode"
  ].join(",");

  const url = `${SUPABASE_URL}/rest/v1/solar_history?select=${fields}` +
    `&device_id=eq.cha-solar-gateway&order=recorded_at.desc&limit=1`;

  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY },
    cache: "no-store"
  });
  if (!r.ok) throw new Error("SUPABASE " + r.status);
  const rows = await r.json();
  if (!rows.length) throw new Error("NO HISTORY");

  const x = rows[0];
  return {
    pvPower:Number(x.solar_power_w ?? 0),
    pvVoltage:Number(x.solar_voltage ?? 0),
    pvCurrent:Number(x.solar_current ?? 0),
    gridPower:0,
    gridVoltage:Number(x.grid_voltage ?? 0),
    gridCurrent:Number(x.grid_current ?? 0),
    gridFrequency:Number(x.grid_frequency ?? 0),
    consumer1Power:0, consumer1Current:0,
    loadPower:Number(x.load_power_w ?? 0),
    loadCurrent:Number(x.load_current ?? 0),
    loadPercent:Number(x.load_percent ?? 0),
    inverterVoltage:0, inverterCurrent:0,
    inverterTemperature:Number(x.temp_inverter ?? 0),
    inverterMode:String(x.mode ?? "ONLINE"),
    batterySOC:Number(x.battery_soc ?? 0),
    batteryVoltage:Number(x.battery_voltage ?? 0),
    batteryCurrent:Number(x.battery_current ?? 0)
  };
}

const ESP32_LIVE_URL = "http://192.168.1.64/api/live";
const ESP32_ENERGY_URL = "http://192.168.1.64/api/energy";

let lastGoodData = null;

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toggleFlow(id, active) {
  const path = document.getElementById(id);
  if (!path) return;
  path.classList.toggle("off", !active);
}

function setGatewayStatus(online) {
  const box = document.querySelector(".online");
  if (!box) return;

  box.classList.toggle("offline", !online);
  box.innerHTML =
    `<span class="online-dot"></span>` +
    (online ? "ESP32 / SRNE ONLINE" : "ESP32 / SRNE OFFLINE");
}

function updateBatteryState(current) {
  const state = document.getElementById("batteryState");
  const direction = document.getElementById("batteryDirection");
  const path = document.getElementById("batteryPath");

  if (!state || !direction || !path) return;

  state.classList.remove("charging", "discharging", "standby");
  path.classList.remove("reverse");

  // SRNE sign convention: positive = discharging, negative = charging.
  if (current < -0.2) {
    state.textContent = "↓ CHARGING";
    state.classList.add("charging");
    direction.textContent = "←";
    path.classList.add("reverse");
  } else if (current > 0.2) {
    state.textContent = "↑ DISCHARGING";
    state.classList.add("discharging");
    direction.textContent = "→";
  } else {
    state.textContent = "↔ STANDBY";
    state.classList.add("standby");
    direction.textContent = "↔";
  }
}

function updateUI(data) {
  setText("pvPower", Math.round(data.pvPower));
  setText("pvVoltage", data.pvVoltage.toFixed(1));
  setText("pvCurrent", data.pvCurrent.toFixed(1));

  setText("gridVoltage", data.gridVoltage.toFixed(1));
  setText("gridCurrent", data.gridCurrent.toFixed(1));
  setText("gridFrequency", data.gridFrequency.toFixed(2));

  // Consumer 1 waits for its dedicated CT / RS485 meter.
  setText("consumer1Power", "--");
  setText("consumer1Current", "--");

  setText("loadPower", Math.round(data.loadPower));
  setText("loadCurrent", data.loadCurrent.toFixed(1));

  setText(
    "inverterMode",
    data.inverterMode.startsWith("STATE")
      ? "ONLINE"
      : data.inverterMode
  );
  setText("inverterVoltage", data.inverterVoltage.toFixed(1));
  setText("inverterCurrent", data.inverterCurrent.toFixed(1));
  setText("loadPercent", data.loadPercent.toFixed(0));
  setText("inverterTemperature", data.inverterTemperature.toFixed(1));

  setText("batterySOC", data.batterySOC.toFixed(0));
  setText("batteryVoltage", data.batteryVoltage.toFixed(1));
  setText("batteryCurrent", data.batteryCurrent.toFixed(1));

  setText("solarFlowValue", Math.round(data.pvPower));
  setText("consumer2FlowValue", Math.round(data.loadPower));

  toggleFlow("solarPath", data.pvPower > 10);
  toggleFlow("gridMainPath", data.gridCurrent > 0.1);
  toggleFlow("gridInvPath", data.gridCurrent > 0.1);
  toggleFlow("gridC1Path", false);
  toggleFlow("consumer2Path", data.loadPower > 10);
  toggleFlow("batteryPath", Math.abs(data.batteryCurrent) > 0.2);

  updateBatteryState(data.batteryCurrent);
}

async function getESP32Data() {
  try {
    const response = await fetch(ESP32_LIVE_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("ESP32 HTTP " + response.status);
    }

    const live = await response.json();

    if (!live.connected) {
      throw new Error("SRNE reports offline");
    }

    const gridV = Number(live.grid?.voltage ?? 0);
    const gridA = Number(live.grid?.current ?? 0);

    const data = {
      pvPower: Number(live.solar?.power ?? 0),
      pvVoltage: Number(live.solar?.voltage ?? 0),
      pvCurrent: Number(live.solar?.current ?? 0),

      // GRID active power is intentionally not inferred from V x A.
      gridPower: 0,
      gridVoltage: gridV,
      gridCurrent: gridA,
      gridFrequency: Number(live.grid?.frequency ?? 0),

      consumer1Power: 0,
      consumer1Current: 0,

      loadPower: Number(live.load?.power ?? 0),
      loadCurrent: Number(live.load?.current ?? 0),

      inverterVoltage: Number(live.output?.voltage ?? 0),
      inverterCurrent: Number(live.output?.current ?? 0),
      loadPercent: Number(live.load?.percent ?? 0),
      inverterTemperature: Number(live.temperature?.inverter ?? 0),
      inverterMode: String(live.mode ?? "UNKNOWN"),

      batterySOC: Number(live.battery?.soc ?? 0),
      batteryVoltage: Number(live.battery?.voltage ?? 0),
      batteryCurrent: Number(live.battery?.current ?? 0)
    };

    lastGoodData = data;
    updateUI(data);
    updateMobileCards(data, "LIVE");
    setGatewayStatus(true);

    console.log("CHA ESP32 LIVE:", live);
  } catch (error) {
    console.warn("ESP32 LOCAL OFFLINE:", error);
    setGatewayStatus(false);

    try {
      const cloudData = await getSupabaseLatest();
      lastGoodData = cloudData;
      updateUI(cloudData);
      updateMobileCards(cloudData, "CLOUD");
    } catch (cloudError) {
      console.warn("SUPABASE LATEST OFFLINE:", cloudError);
      if (lastGoodData) {
        updateUI(lastGoodData);
        updateMobileCards(lastGoodData, "CACHE");
      }
    }
  }
}

getESP32Data();
setInterval(getESP32Data, 3000);


function formatEnergy(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }) : "--";
}

async function getESP32Energy() {
  const status = document.getElementById("energyStatus");

  try {
    const response = await fetch(ESP32_ENERGY_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("ENERGY HTTP " + response.status);

    const energy = await response.json();

    setText("energyPvToday", formatEnergy(energy.today?.pv_kwh));
    setText("energyLoadToday", formatEnergy(energy.today?.load_kwh));
    setText("energyGridToday", formatEnergy(energy.today?.grid_to_load_kwh));
    setText("energyBattCharge", formatEnergy(energy.today?.battery_charge_ah, 0));
    setText("energyBattDischarge", formatEnergy(energy.today?.battery_discharge_ah, 0));
    setText("energyPvTotal", formatEnergy(energy.total?.pv_kwh));
    setText("energyLoadTotal", formatEnergy(energy.total?.load_kwh));

    if (status) {
      status.textContent = "SRNE ENERGY • LIVE";
      status.classList.remove("offline");
    }
  } catch (error) {
    console.warn("ENERGY API OFFLINE:", error);
    if (status) {
      status.textContent = "ENERGY OFFLINE";
      status.classList.add("offline");
    }
  }
}

getESP32Energy();
setInterval(getESP32Energy, 30000);
