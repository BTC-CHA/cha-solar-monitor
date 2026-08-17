const SUPABASE_URL = "https://txnveztxwqjsclwwtile.supabase.co";
const SUPABASE_KEY = "sb_publishable_ITFDtjM2BXv0jwaQq7x0jw_rZEXlrTU";

let charts = {};
let activeRange = "today";

function rangeStart(range) {
  const now = new Date();
  if (range === "today") {
    // Thailand local midnight (+07:00), converted to UTC automatically.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(now);
    const get = t => parts.find(p => p.type === t)?.value;
    return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+07:00`);
  }
  if (range === "7d") return new Date(Date.now() - 7 * 86400000);
  return new Date(Date.now() - 24 * 3600000);
}

function fmtTime(iso, range) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("th-TH", range === "7d"
    ? { timeZone:"Asia/Bangkok", day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }
    : { timeZone:"Asia/Bangkok", hour:"2-digit", minute:"2-digit" }
  ).format(d);
}

function decimate(rows, maxPoints=500) {
  if (rows.length <= maxPoints) return rows;
  const step = Math.ceil(rows.length / maxPoints);
  return rows.filter((_, i) => i % step === 0 || i === rows.length - 1);
}

async function fetchHistory(range) {
  const start = rangeStart(range).toISOString();
  const select = [
    "recorded_at","load_power_w","battery_soc","grid_voltage","grid_current",
    "temp_inverter","pv_today_kwh","device_id"
  ].join(",");
  const url = `${SUPABASE_URL}/rest/v1/solar_history?select=${select}` +
    `&device_id=eq.cha-solar-gateway&recorded_at=gte.${encodeURIComponent(start)}` +
    `&order=recorded_at.asc&limit=10000`;

  const res = await fetch(url, {
    headers: { "apikey": SUPABASE_KEY },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return await res.json();
}

function chartOptions(unit, min, max) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode:"index", intersect:false },
    plugins: { legend:{ display:false }, tooltip:{ displayColors:false } },
    scales: {
      x: { ticks:{ maxTicksLimit:7, color:"#8b96a6" }, grid:{ display:false } },
      y: {
        beginAtZero: min === 0, suggestedMin:min, suggestedMax:max,
        ticks:{ color:"#8b96a6", callback:v => `${v}${unit}` },
        grid:{ color:"rgba(120,135,155,.10)" }
      }
    }
  };
}

function makeChart(id, labels, datasets, options) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), {
    type:"line",
    data:{ labels, datasets },
    options
  });
}

function render(rows, range) {
  const status = document.getElementById("historyStatus");
  status.innerHTML = `<span class="online-dot"></span>SUPABASE LIVE`;
  status.classList.remove("offline");

  document.getElementById("statRows").textContent = rows.length.toLocaleString();
  if (!rows.length) {
    document.getElementById("historyLast").textContent = "ยังไม่มีข้อมูลในช่วงนี้";
    ["statLoad","statSoc","statPv"].forEach(id => document.getElementById(id).textContent="--");
    Object.values(charts).forEach(c=>c.destroy()); charts={};
    return;
  }

  const latest = rows[rows.length-1];
  document.getElementById("statLoad").textContent = Math.round(Number(latest.load_power_w ?? 0));
  document.getElementById("statSoc").textContent = Number(latest.battery_soc ?? 0).toFixed(0);
  document.getElementById("statPv").textContent = Number(latest.pv_today_kwh ?? 0).toFixed(1);
  document.getElementById("historyLast").textContent =
    "ล่าสุด " + new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",second:"2-digit"}).format(new Date(latest.recorded_at));

  const p = decimate(rows);
  const labels = p.map(r => fmtTime(r.recorded_at, range));
  const common = { borderWidth:2, pointRadius:0, tension:.22, fill:true };

  makeChart("loadChart", labels, [{
    ...common, label:"Load W", data:p.map(r=>Number(r.load_power_w ?? 0)),
    borderColor:"#e99a69", backgroundColor:"rgba(233,154,105,.10)"
  }], chartOptions(" W",0));

  makeChart("socChart", labels, [{
    ...common, label:"Battery SOC", data:p.map(r=>Number(r.battery_soc ?? 0)),
    borderColor:"#5db9cf", backgroundColor:"rgba(93,185,207,.10)"
  }], chartOptions("%",0,100));

  makeChart("gridChart", labels, [
    { ...common, fill:false, label:"Grid V", data:p.map(r=>Number(r.grid_voltage ?? 0)), borderColor:"#9b8bd9", yAxisID:"y" },
    { ...common, fill:false, label:"Grid A", data:p.map(r=>Number(r.grid_current ?? 0)), borderColor:"#e4ad55", yAxisID:"y1" }
  ], {
    responsive:true, maintainAspectRatio:false, animation:false,
    interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:true,labels:{usePointStyle:true,boxWidth:8}}},
    scales:{
      x:{ticks:{maxTicksLimit:7,color:"#8b96a6"},grid:{display:false}},
      y:{position:"left",ticks:{color:"#9b8bd9",callback:v=>v+"V"},grid:{color:"rgba(120,135,155,.10)"}},
      y1:{position:"right",beginAtZero:true,ticks:{color:"#b98a42",callback:v=>v+"A"},grid:{drawOnChartArea:false}}
    }
  });

  makeChart("tempChart", labels, [{
    ...common, label:"Inverter °C", data:p.map(r=>Number(r.temp_inverter ?? 0)),
    borderColor:"#7d8797", backgroundColor:"rgba(125,135,151,.09)"
  }], chartOptions("°C",20,70));
}

async function loadRange(range) {
  activeRange = range;
  const status = document.getElementById("historyStatus");
  status.innerHTML = `<span class="online-dot"></span>LOADING`;
  try {
    render(await fetchHistory(range), range);
  } catch(e) {
    console.error(e);
    status.textContent = "SUPABASE OFFLINE";
    status.classList.add("offline");
    document.getElementById("historyLast").textContent = "อ่าน History ไม่สำเร็จ";
  }
}

document.querySelectorAll(".history-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".history-tabs button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    loadRange(btn.dataset.range);
  });
});

loadRange("today");
setInterval(()=>loadRange(activeRange), 60000);
