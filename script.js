
const SUPABASE_URL = "https://txnveztxwqjsclwwtile.supabase.co";
const SUPABASE_KEY = "sb_publishable_ITFDtjM2BXv0jwaQq7x0jw_rZEXlrTU";

// CT1/PZEM is installed on MAIN before the split. CT2 can override the
// estimated machine branch later without changing the dashboard contract.
const MAIN_FLOW_CONFIG = {
  inverterStandbyW: 28,
  inverterGridPfEstimate: 0.90
};

function addBranchEstimates(data) {
  const mainPower = Math.max(0, Number(data.gridPower) || 0);
  const inverterGridCurrent = Math.max(0, Number(data.inverterGridCurrent) || 0);
  const inverterGridVoltage = Math.max(
    0,
    Number(data.inverterGridVoltage) || Number(data.gridVoltage) || 0
  );
  const inverterGridActive = inverterGridCurrent > 0.1;

  let inverterGridPowerEstimate = inverterGridActive
    ? inverterGridVoltage * inverterGridCurrent * MAIN_FLOW_CONFIG.inverterGridPfEstimate
    : MAIN_FLOW_CONFIG.inverterStandbyW;

  if (data.consumer1Connected) {
    inverterGridPowerEstimate = Math.min(mainPower, inverterGridPowerEstimate);
  }

  const ct2Connected = data.ct2Connected === true;
  const machinePowerEstimate = ct2Connected
    ? Math.max(0, Number(data.ct2Power) || 0)
    : Math.max(0, mainPower - inverterGridPowerEstimate);

  return {
    ...data,
    inverterGridPowerEstimate,
    inverterGridStandby: !inverterGridActive && inverterGridPowerEstimate > 5,
    machinePowerEstimate,
    machinePowerEstimated: !ct2Connected
  };
}

function getBatteryTelemetry(live) {
  const bms = live?.bms;
  const bmsFresh =
    bms?.connected === true &&
    bms?.decoded === true &&
    Number(bms?.last_response_age_ms ?? 999999) < 15000;

  if (bmsFresh) {
    return {
      batterySOC:Number(bms.soc ?? 0),
      batteryVoltage:Number(bms.voltage ?? 0),
      batteryCurrent:Number(bms.current ?? 0),
      batterySource:"BMS"
    };
  }

  return {
    batterySOC:Number(live?.battery?.soc ?? 0),
    batteryVoltage:Number(live?.battery?.voltage ?? 0),
    // Normalize SRNE (- = charge) to the BMS/dashboard convention (+ = charge).
    batteryCurrent:-Number(live?.battery?.current ?? 0),
    batterySource:"SRNE"
  };
}

function updateMobileCards(data, source = "LIVE") {
  data = addBranchEstimates(data);
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
  set("mBatterySource", data.batterySource === "BMS" ? "BATTERY • BMS" : "BATTERY • SRNE");
  set("mGridVoltage", data.gridVoltage.toFixed(1));
  set("mGridCurrent", data.gridCurrent.toFixed(1));
  set("mGridFrequency", data.gridFrequency.toFixed(2));
  set("mConsumer1Power", data.consumer1Connected ? Math.round(data.consumer1Power) : "--");
  set("mConsumer1Current", data.consumer1Connected ? data.consumer1Current.toFixed(2) : "--");
  set("mMachinePower", data.ct2Connected ? Math.round(data.machinePowerEstimate) : "--");
  set("mMachineSource", data.ct2Connected ? "CT2 LIVE" : "รอข้อมูลจาก CT2");
  set("mInvTemp", data.inverterTemperature.toFixed(1) + "°C");
  set("mInvMode", data.inverterMode.startsWith("STATE") ? "ONLINE" : data.inverterMode);

  const badge = document.getElementById("mobileSource");
  if (badge) {
    badge.textContent = source;
    badge.classList.toggle("cloud", source === "CLOUD");
  }
}

async function getSupabaseLatest() {
  const url = `${SUPABASE_URL}/rest/v1/solar_history?select=*` +
    `&device_id=eq.cha-solar-gateway&order=recorded_at.desc&limit=1`;

  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY },
    cache: "no-store"
  });
  if (!r.ok) throw new Error("SUPABASE " + r.status);
  const rows = await r.json();
  if (!rows.length) throw new Error("NO HISTORY");

  const x = rows[0];
  const cloudBms = x.battery_bms || x.bms_data || x.bms;
  const useCloudBms = cloudBms?.connected !== false && cloudBms?.decoded === true;
  return {
    pvPower:Number(x.solar_power_w ?? 0),
    pvVoltage:Number(x.solar_voltage ?? 0),
    pvCurrent:Number(x.solar_current ?? 0),
    gridPower:Number(x.grid_power_w ?? 0),
    gridVoltage:Number(x.grid_voltage ?? 0),
    gridCurrent:Number(x.grid_current ?? 0),
    gridFrequency:Number(x.grid_frequency ?? 0),
    inverterGridVoltage:Number(x.inverter_grid_voltage ?? 0),
    inverterGridCurrent:Number(x.inverter_grid_current ?? 0),
    consumer1Connected:x.consumer1_connected === true,
    consumer1Power:Number(x.consumer1_power_w ?? 0),
    consumer1Current:Number(x.consumer1_current ?? 0),
    loadPower:Number(x.load_power_w ?? 0),
    loadCurrent:Number(x.load_current ?? 0),
    loadPercent:Number(x.load_percent ?? 0),
    inverterVoltage:Number(x.output_voltage ?? 0),
    inverterCurrent:Number(x.output_current ?? 0),
    inverterTemperature:Number(x.temp_inverter ?? 0),
    inverterMode:String(x.mode ?? "ONLINE"),
    batterySOC:Number(useCloudBms ? cloudBms.soc : (x.battery_soc ?? 0)),
    batteryVoltage:Number(useCloudBms ? cloudBms.voltage : (x.battery_voltage ?? 0)),
    batteryCurrent:Number(useCloudBms ? cloudBms.current : -(x.battery_current ?? 0)),
    batterySource:useCloudBms ? "BMS" : "SRNE"
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

function setGatewayStatus(online, pzemOnline = false) {
  const box = document.querySelector(".online");
  if (!box) return;

  box.classList.toggle("offline", !online);
  box.innerHTML =
    `<span class="online-dot"></span>` +
    (online
      ? (pzemOnline ? "ESP32 / SRNE / PZEM ONLINE" : "ESP32 / SRNE ONLINE • PZEM OFFLINE")
      : "ESP32 / SRNE OFFLINE");
}

function updateBatteryState(current) {
  const state = document.getElementById("batteryState");
  const direction = document.getElementById("batteryDirection");
  const path = document.getElementById("batteryPath");

  if (!state || !direction || !path) return;

  state.classList.remove("charging", "discharging", "standby");
  path.classList.remove("reverse");

  // Battery current convention used by the live BMS: negative = discharging.
  if (current < -0.2) {
    state.textContent = "↑ DISCHARGING";
    state.classList.add("discharging");
    direction.textContent = "→";
    path.classList.add("reverse");
  } else if (current > 0.2) {
    state.textContent = "↓ CHARGING";
    state.classList.add("charging");
    direction.textContent = "←";
  } else {
    state.textContent = "↔ STANDBY";
    state.classList.add("standby");
    direction.textContent = "↔";
  }
}

function updateUI(data) {
  data = addBranchEstimates(data);
  setText("pvPower", Math.round(data.pvPower));
  setText("pvVoltage", data.pvVoltage.toFixed(1));
  setText("pvCurrent", data.pvCurrent.toFixed(1));

  setText("gridVoltage", data.gridVoltage.toFixed(1));
  setText("gridCurrent", data.gridCurrent.toFixed(1));
  setText("gridFrequency", data.gridFrequency.toFixed(2));

  setText("consumer1Power", data.consumer1Connected ? Math.round(data.consumer1Power) : "--");
  setText("consumer1Current", data.consumer1Connected ? data.consumer1Current.toFixed(2) : "--");

  const consumer1Source = document.getElementById("consumer1Source");
  if (consumer1Source) {
    consumer1Source.textContent = data.consumer1Connected ? "PZEM LIVE" : "PZEM OFFLINE";
    consumer1Source.classList.toggle("waiting", !data.consumer1Connected);
  }

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
  setText("batteryDataSource", data.batterySource || "SRNE");

  setText("solarFlowValue", Math.round(data.pvPower));
  setText("consumer2FlowValue", Math.round(data.loadPower));

  toggleFlow("solarPath", data.pvPower > 10);
  toggleFlow("gridMainPath", data.gridCurrent > 0.1);
  toggleFlow("gridInvPath", data.inverterGridPowerEstimate > 5);
  toggleFlow("gridC1Path", data.consumer1Connected && data.consumer1Current > 0.1);
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

    const srneGridV = Number(live.grid?.voltage ?? 0);
    const srneGridA = Number(live.grid?.current ?? 0);
    const pzemConnected = live.consumer1?.connected === true;
    const mainGridV = pzemConnected ? Number(live.consumer1?.voltage ?? 0) : srneGridV;
    const mainGridA = pzemConnected ? Number(live.consumer1?.current ?? 0) : srneGridA;
    const mainGridHz = pzemConnected
      ? Number(live.consumer1?.frequency ?? 0)
      : Number(live.grid?.frequency ?? 0);

    const batteryTelemetry = getBatteryTelemetry(live);
    const data = {
      pvPower: Number(live.solar?.power ?? 0),
      pvVoltage: Number(live.solar?.voltage ?? 0),
      pvCurrent: Number(live.solar?.current ?? 0),

      gridPower: pzemConnected ? Number(live.consumer1?.power ?? 0) : 0,
      gridVoltage: mainGridV,
      gridCurrent: mainGridA,
      gridFrequency: mainGridHz,
      inverterGridVoltage: srneGridV,
      inverterGridCurrent: srneGridA,

      consumer1Connected: pzemConnected,
      consumer1Power: pzemConnected ? Number(live.consumer1?.power ?? 0) : 0,
      consumer1Current: pzemConnected ? Number(live.consumer1?.current ?? 0) : 0,

      loadPower: Number(live.load?.power ?? 0),
      loadCurrent: Number(live.load?.current ?? 0),

      inverterVoltage: Number(live.output?.voltage ?? 0),
      inverterCurrent: Number(live.output?.current ?? 0),
      loadPercent: Number(live.load?.percent ?? 0),
      inverterTemperature: Number(live.temperature?.inverter ?? 0),
      inverterMode: String(live.mode ?? "UNKNOWN"),

      ...batteryTelemetry
    };

    lastGoodData = data;
    updateUI(data);
    updateMobileCards(data, "LIVE");
    setGatewayStatus(true, data.consumer1Connected);

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
