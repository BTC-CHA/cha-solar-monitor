const SUPABASE_URL = "https://txnveztxwqjsclwwtile.supabase.co";
const SUPABASE_KEY = "sb_publishable_ITFDtjM2BXv0jwaQq7x0jw_rZEXlrTU";
const DEVICE_ID = "cha-solar-gateway";
const TARIFF_BAHT_PER_KWH = 4.5;
const BILLING_START_DAY = 7;

let charts = {};
let activeRange = "day";
let cursorKey = bangkokDateKey(new Date());

function text(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function bangkokDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function keyParts(key) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

function makeKey(year, month, day = 1) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.toISOString().slice(0, 10);
}

function currentBillingKey() {
  const today = keyParts(bangkokDateKey(new Date()));
  return today.day >= BILLING_START_DAY
    ? makeKey(today.year, today.month, BILLING_START_DAY)
    : makeKey(today.year, today.month - 1, BILLING_START_DAY);
}

function shiftCursor(amount) {
  const { year, month, day } = keyParts(cursorKey);
  if (activeRange === "day") cursorKey = makeKey(year, month, day + amount);
  if (activeRange === "month") cursorKey = makeKey(year, month + amount, BILLING_START_DAY);
  if (activeRange === "year") cursorKey = makeKey(year + amount, 1, 1);
}

function periodBounds() {
  const { year, month, day } = keyParts(cursorKey);
  if (activeRange === "day") {
    return { start: makeKey(year, month, day), end: makeKey(year, month, day + 1) };
  }
  if (activeRange === "month") {
    return { start: makeKey(year, month, BILLING_START_DAY), end: makeKey(year, month + 1, BILLING_START_DAY) };
  }
  return { start: makeKey(year, 1, BILLING_START_DAY), end: makeKey(year + 1, 1, BILLING_START_DAY) };
}

function isCurrentPeriod() {
  const today = bangkokDateKey(new Date());
  const now = keyParts(today);
  const cursor = keyParts(cursorKey);
  if (activeRange === "day") return cursorKey >= today;
  if (activeRange === "month") {
    const current = keyParts(currentBillingKey());
    return cursor.year > current.year || (cursor.year === current.year && cursor.month >= current.month);
  }
  return cursor.year >= now.year;
}

function periodTitle() {
  const { year, month, day } = keyParts(cursorKey);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (activeRange === "day") {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric"
    }).format(date);
  }
  if (activeRange === "month") {
    const endKey = keyParts(makeKey(year, month + 1, BILLING_START_DAY - 1));
    const startDate = new Date(Date.UTC(year, month - 1, BILLING_START_DAY, 12));
    const endDate = new Date(Date.UTC(endKey.year, endKey.month - 1, endKey.day, 12));
    const short = value => new Intl.DateTimeFormat("th-TH", { day:"numeric", month:"short" }).format(value);
    return `${short(startDate)} – ${short(endDate)} ${endKey.year + 543}`;
  }
  return `ปี ${year + 543}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_KEY },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return response.json();
}

async function fetchDailySummaries(start, end) {
  const select = [
    "energy_date", "solar_kwh", "load_kwh", "grid_kwh", "grid_is_estimated",
    "battery_charge_ah", "battery_discharge_ah", "peak_load_w",
    "last_battery_soc", "sample_count"
  ].join(",");
  const url = `${SUPABASE_URL}/rest/v1/solar_history_daily?select=${select}` +
    `&device_id=eq.${DEVICE_ID}&energy_date=gte.${start}&energy_date=lt.${end}` +
    "&order=energy_date.asc";
  return fetchJson(url);
}

async function fetchDaySamples(start, end) {
  const select = [
    "recorded_at", "solar_power_w", "load_power_w", "grid_power_w",
    "grid_voltage", "grid_current", "battery_current", "battery_soc"
  ].join(",");
  const base = `${SUPABASE_URL}/rest/v1/solar_history?select=${select}` +
    `&device_id=eq.${DEVICE_ID}` +
    `&recorded_at=gte.${encodeURIComponent(start + "T00:00:00+07:00")}` +
    `&recorded_at=lt.${encodeURIComponent(end + "T00:00:00+07:00")}` +
    "&order=recorded_at.asc";
  const rows = [];
  for (let offset = 0; offset < 3000; offset += 1000) {
    const page = await fetchJson(`${base}&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function hourLabel(iso) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false
  }).format(new Date(iso)) + ":00";
}

function hourlyBuckets(rows) {
  const buckets = new Map();
  rows.forEach(row => {
    const label = hourLabel(row.recorded_at);
    if (!buckets.has(label)) {
      buckets.set(label, {
        label, solar_kwh: 0, load_kwh: 0, grid_kwh: 0,
        battery_charge_ah: 0, battery_discharge_ah: 0,
        peak_load_w: 0, last_battery_soc: 0, grid_is_estimated: false
      });
    }
    const bucket = buckets.get(label);
    bucket.peak_load_w = Math.max(bucket.peak_load_w, Number(row.load_power_w || 0));
    bucket.last_battery_soc = Number(row.battery_soc || 0);
  });

  for (let index = 1; index < rows.length; index += 1) {
    const current = rows[index];
    const previous = rows[index - 1];
    const dt = (new Date(current.recorded_at) - new Date(previous.recorded_at)) / 3600000;
    if (dt <= 0 || dt > 5 / 60) continue;
    const bucket = buckets.get(hourLabel(current.recorded_at));
    const solar = Math.max(0, Number(current.solar_power_w || 0));
    const load = Math.max(0, Number(current.load_power_w || 0));
    const gridMeasured = current.grid_power_w === null ? NaN : Number(current.grid_power_w);
    const grid = Number.isFinite(gridMeasured)
      ? Math.max(0, gridMeasured)
      : Math.max(0, Number(current.grid_voltage || 0) * Number(current.grid_current || 0));
    const battery = Number(current.battery_current || 0);
    bucket.solar_kwh += solar * dt / 1000;
    bucket.load_kwh += load * dt / 1000;
    bucket.grid_kwh += grid * dt / 1000;
    bucket.grid_is_estimated ||= !Number.isFinite(gridMeasured);
    if (battery < 0) bucket.battery_charge_ah += -battery * dt;
    if (battery > 0) bucket.battery_discharge_ah += battery * dt;
  }
  return [...buckets.values()];
}

function dailyBuckets(rows) {
  return rows.map(row => ({
    ...row,
    label: new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" })
      .format(new Date(row.energy_date + "T12:00:00+07:00"))
  }));
}

function monthlyBuckets(rows) {
  const months = new Map();
  rows.forEach(row => {
    const parts = keyParts(row.energy_date);
    const cycleKey = parts.day >= BILLING_START_DAY
      ? makeKey(parts.year, parts.month, BILLING_START_DAY)
      : makeKey(parts.year, parts.month - 1, BILLING_START_DAY);
    const cycle = keyParts(cycleKey);
    if (!months.has(cycleKey)) {
      const label = new Intl.DateTimeFormat("th-TH", { month: "short" })
        .format(new Date(Date.UTC(cycle.year, cycle.month - 1, BILLING_START_DAY, 12)));
      months.set(cycleKey, {
        label, solar_kwh: 0, load_kwh: 0, grid_kwh: 0,
        battery_charge_ah: 0, battery_discharge_ah: 0,
        peak_load_w: 0, last_battery_soc: 0, grid_is_estimated: false
      });
    }
    const bucket = months.get(cycleKey);
    ["solar_kwh", "load_kwh", "grid_kwh", "battery_charge_ah", "battery_discharge_ah"]
      .forEach(key => { bucket[key] += Number(row[key] || 0); });
    bucket.peak_load_w = Math.max(bucket.peak_load_w, Number(row.peak_load_w || 0));
    bucket.last_battery_soc = Number(row.last_battery_soc || 0);
    bucket.grid_is_estimated ||= Boolean(row.grid_is_estimated);
  });
  return [...months.values()];
}

function totals(rows) {
  const result = {
    solar: 0, load: 0, grid: 0, charge: 0, discharge: 0,
    peak: 0, samples: 0, estimated: false
  };
  rows.forEach(row => {
    result.solar += Number(row.solar_kwh || 0);
    result.load += Number(row.load_kwh || 0);
    result.grid += Number(row.grid_kwh || 0);
    result.charge += Number(row.battery_charge_ah || 0);
    result.discharge += Number(row.battery_discharge_ah || 0);
    result.peak = Math.max(result.peak, Number(row.peak_load_w || 0));
    result.samples += Number(row.sample_count || 0);
    result.estimated ||= Boolean(row.grid_is_estimated);
  });
  return result;
}

function chartBase() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 280 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { usePointStyle: true, boxWidth: 8, color: "#6f7a8a" } },
      tooltip: { displayColors: true }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#8b96a6", maxTicksLimit: 12 } },
      y: { beginAtZero: true, grid: { color: "rgba(120,135,155,.10)" }, ticks: { color: "#8b96a6" } }
    }
  };
}

function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function renderCharts(buckets) {
  const labels = buckets.map(row => row.label);
  const rounded = key => buckets.map(row => Number(Number(row[key] || 0).toFixed(3)));

  makeChart("energyChart", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Solar", data: rounded("solar_kwh"), backgroundColor: "rgba(229,182,56,.78)", borderRadius: 5 },
      { label: "Load", data: rounded("load_kwh"), backgroundColor: "rgba(233,154,105,.72)", borderRadius: 5 },
      { label: "Grid ≈", data: rounded("grid_kwh"), backgroundColor: "rgba(155,139,217,.65)", borderRadius: 5 }
    ]},
    options: chartBase()
  });

  makeChart("batteryChart", {
    type: "bar",
    data: { labels, datasets: [
      { label: "Charge", data: rounded("battery_charge_ah"), backgroundColor: "rgba(93,185,207,.62)", borderRadius: 5 },
      { label: "Discharge", data: rounded("battery_discharge_ah"), backgroundColor: "rgba(70,145,164,.82)", borderRadius: 5 }
    ]},
    options: chartBase()
  });

  const conditionOptions = chartBase();
  conditionOptions.scales.y1 = {
    position: "right", min: 0, max: 100,
    grid: { drawOnChartArea: false },
    ticks: { color: "#5db9cf", callback: value => value + "%" }
  };
  makeChart("conditionChart", {
    type: "line",
    data: { labels, datasets: [
      {
        label: "Peak Load W", data: rounded("peak_load_w"), yAxisID: "y",
        borderColor: "#e99a69", backgroundColor: "rgba(233,154,105,.09)",
        fill: true, pointRadius: 2, tension: .25
      },
      {
        label: "Battery SOC", data: rounded("last_battery_soc"), yAxisID: "y1",
        borderColor: "#5db9cf", pointRadius: 2, tension: .25
      }
    ]},
    options: conditionOptions
  });
}

function renderSummary(rows, buckets) {
  const sum = totals(rows);
  text("statSolar", sum.solar.toFixed(2));
  text("statLoadEnergy", sum.load.toFixed(2));
  text("statGrid", sum.grid.toFixed(2));
  text("statGridCost", (sum.grid * TARIFF_BAHT_PER_KWH).toFixed(2));
  text("statSolarSaving", (sum.solar * TARIFF_BAHT_PER_KWH).toFixed(2));
  text("statBatteryCharge", sum.charge.toFixed(1));
  text("statBatteryDischarge", sum.discharge.toFixed(1));
  text("statPeakLoad", Math.round(sum.peak).toLocaleString());
  text("statGridLabel", sum.estimated ? "Grid ใช้ไป ≈" : "Grid ใช้ไป");
  text(
    "historyDataNote",
    sum.estimated
      ? "≈ ค่า Grid คำนวณจาก V×A ชั่วคราว • เมื่อเชื่อม PZEM จะเปลี่ยนเป็นกำลังไฟจริงอัตโนมัติ"
      : "ค่า Grid มาจากมิเตอร์กำลังไฟจริง"
  );
  text("energyChartSubtitle", activeRange === "day" ? "แยกตามชั่วโมง" : activeRange === "month" ? "แยกตามวัน" : "แยกตามเดือน");
  text("historyLast", `${sum.samples.toLocaleString()} records • ค่าไฟ ${TARIFF_BAHT_PER_KWH.toFixed(2)} บาท/หน่วย`);
  renderCharts(buckets);
}

function clearView(message) {
  [
    "statSolar", "statLoadEnergy", "statGrid", "statGridCost", "statSolarSaving",
    "statBatteryCharge", "statBatteryDischarge", "statPeakLoad"
  ].forEach(id => text(id, "--"));
  text("historyLast", message);
  Object.values(charts).forEach(chart => chart.destroy());
  charts = {};
}

async function loadPeriod() {
  const status = document.getElementById("historyStatus");
  status.innerHTML = '<span class="online-dot"></span>LOADING';
  status.classList.remove("offline");
  text("periodLabel", periodTitle());
  text("periodType", activeRange === "day" ? "สรุปรายวัน" : activeRange === "month" ? "รอบบิล เริ่มวันที่ 7" : "สรุปรอบบิลรายปี");
  document.getElementById("periodNext").disabled = isCurrentPeriod();

  try {
    const { start, end } = periodBounds();
    const rows = await fetchDailySummaries(start, end);
    if (!rows.length) {
      clearView("ยังไม่มีข้อมูลในช่วงนี้");
    } else {
      let buckets;
      if (activeRange === "day") {
        const samples = await fetchDaySamples(start, end);
        buckets = hourlyBuckets(samples);
      } else if (activeRange === "month") {
        buckets = dailyBuckets(rows);
      } else {
        buckets = monthlyBuckets(rows);
      }
      renderSummary(rows, buckets);
    }
    status.innerHTML = '<span class="online-dot"></span>SUPABASE LIVE';
  } catch (error) {
    console.error(error);
    status.textContent = "SUPABASE OFFLINE";
    status.classList.add("offline");
    clearView("อ่าน History ไม่สำเร็จ");
  }
}

document.querySelectorAll(".history-tabs button").forEach(button => {
  button.addEventListener("click", () => {
    activeRange = button.dataset.range;
    cursorKey = activeRange === "month" ? currentBillingKey() : bangkokDateKey(new Date());
    document.querySelectorAll(".history-tabs button").forEach(item => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    loadPeriod();
  });
});

document.getElementById("periodPrev").addEventListener("click", () => {
  shiftCursor(-1);
  loadPeriod();
});

document.getElementById("periodNext").addEventListener("click", () => {
  if (isCurrentPeriod()) return;
  shiftCursor(1);
  loadPeriod();
});

loadPeriod();
setInterval(() => {
  if (isCurrentPeriod()) loadPeriod();
}, 60000);
