const BMS_LOCAL_URL = "http://192.168.1.64/api/battery";
const BMS_SUPABASE_URL = "https://txnveztxwqjsclwwtile.supabase.co";
const BMS_SUPABASE_KEY = "sb_publishable_ITFDtjM2BXv0jwaQq7x0jw_rZEXlrTU";

const $ = (id) => document.getElementById(id);
const u16 = (a, i) => (a[i] << 8) | a[i + 1];
const s16 = (a, i) => { const n=u16(a,i); return n > 32767 ? n - 65536 : n; };
const safe = (n, digits=1) => Number.isFinite(n) ? n.toFixed(digits) : "--";

function decodePaceAscii(frame) {
  if (!frame || frame[0] !== "~") throw new Error("PACE frame missing");
  const compact = frame.replace(/[\r\n\s]/g, "");
  const infoHex = compact.slice(13, -4);
  if (!/^[0-9A-F]+$/i.test(infoHex) || infoHex.length % 2) throw new Error("PACE data invalid");
  const bytes = Array.from({length:infoHex.length/2}, (_,i)=>parseInt(infoHex.slice(i*2,i*2+2),16));

  let p = 0;
  p++; // command response flag
  const cellCount = bytes[p++];
  if (cellCount < 1 || cellCount > 32) throw new Error("Cell count invalid");
  const cells = [];
  for (let i=0; i<cellCount; i++, p+=2) cells.push(u16(bytes,p));

  const tempCount = bytes[p++];
  const temperatures = [];
  for (let i=0; i<tempCount && p+1<bytes.length; i++, p+=2) {
    temperatures.push((u16(bytes,p)-2731)/10);
  }

  const current = s16(bytes,p)/100; p += 2;
  const voltage = u16(bytes,p)/100; p += 2;
  const remainingAh = u16(bytes,p)/100; p += 2;
  const userBytes = bytes[p++] || 0;

  let fullAh = NaN, cycles = NaN, soc = NaN, soh = NaN;
  if (userBytes >= 4 && p+3 < bytes.length) {
    fullAh = u16(bytes,p)/100; p += 2;
    cycles = u16(bytes,p); p += 2;
  }
  if (p < bytes.length) soc = bytes[p++];
  if (p < bytes.length) soh = bytes[p++];

  if (!Number.isFinite(soc) || soc > 100) soc = fullAh > 0 ? remainingAh/fullAh*100 : NaN;
  return {
    connected:true, source:"LOCAL", voltage, current,
    power: Math.abs(voltage*current), remaining_ah:remainingAh,
    full_ah:fullAh, cycles, soc, soh, cells_mv:cells,
    temperatures_c:temperatures
  };
}

function normalizeBms(payload, source) {
  if (payload?.response_ascii) return {...decodePaceAscii(payload.response_ascii), source};
  const b = payload?.battery_bms || payload?.bms_data || payload?.bms || payload;
  return {
    connected: b?.connected !== false,
    source,
    voltage:Number(b?.voltage ?? b?.pack_voltage),
    current:Number(b?.current ?? b?.pack_current),
    power:Number(b?.power ?? b?.power_w),
    remaining_ah:Number(b?.remaining_ah ?? b?.remaining_capacity_ah),
    full_ah:Number(b?.full_ah ?? b?.full_capacity_ah),
    cycles:Number(b?.cycles ?? b?.cycle_count),
    soc:Number(b?.soc),
    soh:Number(b?.soh),
    cells_mv:(b?.cells_mv || b?.cell_voltages_mv || []).map(Number),
    temperatures_c:(b?.temperatures_c || b?.temperatures || []).map(Number),
    recorded_at:payload?.recorded_at || b?.recorded_at
  };
}

function renderBms(b) {
  const current = Number(b.current);
  const voltage = Number(b.voltage);
  const power = Number.isFinite(b.power) ? Math.abs(b.power) : Math.abs(voltage*current);
  const soc = Math.max(0, Math.min(100, Number(b.soc)));
  const chargeState = current > .15 ? "charging" : current < -.15 ? "discharging" : "idle";
  const voltageState = voltage >= 53.2 ? "ready" : voltage <= 50.4 ? "low" : "normal";

  $("bmsSoc").textContent = safe(soc,0);
  $("socRing").style.setProperty("--soc", Number.isFinite(soc) ? soc : 0);
  $("bmsVoltage").textContent = safe(voltage,2);
  $("bmsCurrent").textContent = safe(current,2);
  $("bmsPower").textContent = safe(power,0) + " W";
  $("bmsRemaining").textContent = safe(Number(b.remaining_ah),2);
  $("bmsFull").textContent = safe(Number(b.full_ah),2);
  $("bmsCycles").textContent = safe(Number(b.cycles),0);
  $("bmsSoh").textContent = safe(Number(b.soh),0);

  const deadband = .15;
  $("bmsState").textContent = current > deadband ? "กำลังชาร์จ" : current < -deadband ? "กำลังคายประจุ" : "แบตเตอรี่พัก";
  $("bmsState").dataset.state = current > deadband ? "charge" : current < -deadband ? "discharge" : "idle";
  $("batteryHero").className = "battery-hero " + chargeState;
  $("currentMetric").className = "metric-current " + chargeState;
  $("voltageMetric").className = "metric-voltage " + voltageState;
  $("voltageMetric").title = voltageState === "ready"
    ? "ถึง 53.2V: พร้อมกลับมาใช้อินเวอร์เตอร์ตามค่าที่แนะนำ"
    : voltageState === "low" ? "ถึง 50.4V หรือต่ำกว่า: ควรสลับไปใช้ไฟบ้าน" : "แรงดันอยู่ในช่วงใช้งาน";
  $("batteryStatus").classList.remove("offline");
  const sourceLabel = b.source === "CLOUD" ? "BMS CLOUD" : b.source === "SRNE_CLOUD" ? "SRNE CLOUD" : "BMS ONLINE";
  $("batteryStatus").innerHTML = '<span class="online-dot"></span>' + sourceLabel;
  $("bmsUpdated").textContent = b.recorded_at
    ? (b.cloud_limited ? "ข้อมูลพื้นฐานจาก SRNE Cloud • " : "อัปเดต BMS Cloud • ") + new Date(b.recorded_at).toLocaleString("th-TH")
    : "อ่านตรงจาก ESP32 • อัปเดตล่าสุดเมื่อ " + new Date().toLocaleTimeString("th-TH");

  renderCells(b.cells_mv || [], b.cloud_limited === true);
  renderCellHealth(b.cells_mv || [], current);
  renderTemperatures(b.temperatures_c || []);
}

const CELL_HEALTH_KEY = "cha_cell_health_v1";
let lastHealthSampleAt = 0;

function loadCellHealthHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(CELL_HEALTH_KEY) || "[]");
    return Array.isArray(rows) ? rows.filter(r => Date.now() - Number(r.at) < 7*86400000).slice(-500) : [];
  } catch (_) { return []; }
}

function rememberCellHealth(cells, current) {
  const now = Date.now();
  if (now-lastHealthSampleAt < 60000 || cells.length < 2) return loadCellHealthHistory();
  lastHealthSampleAt = now;
  const avg = cells.reduce((a,n)=>a+n,0)/cells.length;
  const lowIndex = cells.indexOf(Math.min(...cells));
  const rows = loadCellHealthHistory();
  rows.push({at:now, low:lowIndex, deviation:Math.round(avg-cells[lowIndex]), delta:Math.round(Math.max(...cells)-Math.min(...cells)), current:Number(current)||0});
  try { localStorage.setItem(CELL_HEALTH_KEY, JSON.stringify(rows.slice(-500))); } catch (_) {}
  return rows;
}

function renderCellHealth(cells, current) {
  if (cells.length < 2) return;
  const avg = cells.reduce((a,n)=>a+n,0)/cells.length;
  const min = Math.min(...cells), max = Math.max(...cells), delta = max-min;
  const lowIndex = cells.indexOf(min), highIndex = cells.indexOf(max);
  const lowDeviation = avg-min;
  const state = current > .15 ? "ขณะชาร์จ" : current < -.15 ? "ขณะคายประจุ" : "ขณะพักแบต";
  const history = rememberCellHealth(cells, current);
  const recent = history.slice(-60);
  const repeatCount = recent.filter(r => r.low === lowIndex && r.deviation >= 50).length;
  const lowName = "C"+String(lowIndex+1).padStart(2,"0");
  const highName = "C"+String(highIndex+1).padStart(2,"0");

  let level = "good", label = "ปกติ", icon = "✓";
  let title = "แรงดันเซลล์สมดุลดี";
  let message = `ผลต่าง ${Math.round(delta)} mV ${state} ยังไม่พบเซลล์ที่ผิดปกติชัดเจน`;
  if (delta > 150 || min < 2900 || max > 3650) {
    level="danger"; label="ผิดปกติ"; icon="!";
    title=`ควรตรวจสอบ ${lowName}`;
    message=`${lowName} ต่ำกว่าค่าเฉลี่ย ${Math.round(lowDeviation)} mV และต่างจาก ${highName} ${Math.round(delta)} mV ${state}`;
  } else if (delta > 80 || lowDeviation > 60) {
    level="warning"; label="ควรเฝ้าดู"; icon="!";
    title=`เฝ้าดู ${lowName}`;
    message=`${lowName} ต่ำกว่าค่าเฉลี่ย ${Math.round(lowDeviation)} mV ${state} ควรตรวจซ้ำหลังพักแบต`;
  } else if (delta > 30) {
    level="watch"; label="เริ่มต่าง"; icon="i";
    title="เซลล์เริ่มมีความต่าง";
    message=`ผลต่าง ${Math.round(delta)} mV ${state} ยังไม่รุนแรง แต่ระบบจะติดตามว่าเกิดซ้ำที่ ${lowName} หรือไม่`;
  }
  if (repeatCount >= 3 && level !== "good") message += ` • พบ ${lowName} ต่ำซ้ำ ${repeatCount} ครั้งในข้อมูลล่าสุด`;

  $("cellHealthPill").className="health-pill "+level;
  $("cellHealthPill").textContent=label;
  $("cellHealthIcon").className="health-icon "+level;
  $("cellHealthIcon").textContent=icon;
  $("cellHealthTitle").textContent=title;
  $("cellHealthMessage").textContent=message;
  $("suspectCell").textContent=level === "good" ? "ไม่พบ" : lowName;
  $("suspectDeviation").textContent=Math.round(lowDeviation)+" mV";
  $("suspectCount").textContent=repeatCount ? repeatCount+" ครั้ง" : "ยังไม่พบซ้ำ";

  const findings=[];
  findings.push({level, title:`${lowName} ต่ำสุด ${safe(min/1000,3)} V`, text:`ต่ำกว่าค่าเฉลี่ย ${Math.round(lowDeviation)} mV • ${state}`});
  if (delta > 80) findings.push({level:delta>150?"danger":"warning", title:`ความต่างรวม ${Math.round(delta)} mV`, text:`สูงสุด ${highName} ${safe(max/1000,3)} V • ต่ำสุด ${lowName} ${safe(min/1000,3)} V`});
  if (current < -.15 && min < 3000) findings.push({level:"danger", title:"เซลล์ต่ำกว่า 3.000 V ขณะจ่ายโหลด", text:"ลดโหลดหรือสลับไฟบ้าน และตรวจแรงดันอีกครั้งหลังพัก 10–15 นาที"});
  if (repeatCount >= 3) findings.push({level:"warning", title:`${lowName} ต่ำซ้ำต่อเนื่อง`, text:"ควรตรวจจุดต่อ สายวัด BMS และเปรียบเทียบอีกครั้งตอนชาร์จใกล้เต็ม"});
  if (level === "good") findings[0]={level:"good", title:"ยังไม่พบเซลล์ต้องสงสัย", text:`ทุกเซลล์อยู่ใกล้ค่าเฉลี่ย ผลต่างรวม ${Math.round(delta)} mV`};
  $("cellHealthFindings").innerHTML=findings.map(f=>`<article class="health-finding ${f.level}"><i></i><div><strong>${f.title}</strong><p>${f.text}</p></div></article>`).join("");
}

function renderCells(cells, cloudLimited = false) {
  const grid = $("cellGrid");
  if (!cells.length) {
    grid.innerHTML = '<div class="battery-empty">' + (cloudLimited
      ? 'โหมดนอกบ้าน: Cloud ยังไม่มีข้อมูลแรงดันรายเซลล์จาก PACE BMS'
      : 'รอข้อมูลแรงดันเซลล์จาก BMS') + '</div>';
    $("deltaPill").textContent = "Δ -- mV";
    return;
  }
  const min = Math.min(...cells), max = Math.max(...cells);
  const avg = cells.reduce((a,n)=>a+n,0)/cells.length;
  const delta = max-min;
  grid.innerHTML = cells.map((mv,i)=>{
    const cls = mv===min ? "cell-min" : mv===max ? "cell-max" : "cell-normal";
    return '<article class="cell-item '+cls+'"><span>C'+String(i+1).padStart(2,"0")+'</span><strong>'+safe(mv/1000,3)+'</strong><small>V</small></article>';
  }).join("");
  $("cellMin").textContent = safe(min/1000,3)+" V";
  $("cellAvg").textContent = safe(avg/1000,3)+" V";
  $("cellMax").textContent = safe(max/1000,3)+" V";
  $("deltaPill").textContent = "Δ "+Math.round(delta)+" mV";
  $("deltaPill").className = "delta-pill " + (delta>100 ? "danger" : delta>50 ? "warning" : "good");
}

function renderTemperatures(temps) {
  const grid = $("tempGrid");
  if (!temps.length) {
    grid.innerHTML = '<div class="battery-empty">รอข้อมูลเซ็นเซอร์อุณหภูมิ</div>';
    $("tempRange").textContent = "--°C";
    return;
  }
  grid.innerHTML = temps.map((t,i)=>'<article><span>T'+(i+1)+'</span><strong>'+safe(t,1)+'°</strong><small>C</small></article>').join("");
  $("tempRange").textContent = safe(Math.min(...temps),1)+"–"+safe(Math.max(...temps),1)+"°C";
}

async function fetchLocal() {
  const r = await fetch(BMS_LOCAL_URL, {cache:"no-store", signal:AbortSignal.timeout(3500)});
  if (!r.ok) throw new Error("LOCAL "+r.status);
  const data = await r.json();
  if (!data.connected || !data.response_ascii) throw new Error("BMS OFFLINE");
  return normalizeBms(data, "LOCAL");
}

async function fetchCloud() {
  const url = BMS_SUPABASE_URL + "/rest/v1/solar_history?select=*&device_id=eq.cha-solar-gateway&order=recorded_at.desc&limit=1";
  const r = await fetch(url, {headers:{apikey:BMS_SUPABASE_KEY}, cache:"no-store"});
  if (!r.ok) throw new Error("CLOUD "+r.status);
  const rows = await r.json();
  if (!rows.length) throw new Error("NO CLOUD DATA");
  const row = rows[0];
  if (row.battery_bms || row.bms_data || row.bms) return normalizeBms(row, "CLOUD");

  // Until ESP32 uploads the full PACE frame, show the basic SRNE battery
  // telemetry remotely instead of leaving the whole Battery page blank.
  const soc = Number(row.battery_soc);
  return {
    connected:true,
    source:"SRNE_CLOUD",
    cloud_limited:true,
    recorded_at:row.recorded_at,
    voltage:Number(row.battery_voltage),
    // Stored SRNE convention is the reverse of the PACE/dashboard convention.
    current:-Number(row.battery_current),
    power:Math.abs(Number(row.battery_voltage) * Number(row.battery_current)),
    remaining_ah:Number.isFinite(soc) ? soc : NaN,
    full_ah:100,
    cycles:NaN,
    soc,
    soh:NaN,
    cells_mv:[],
    temperatures_c:[]
  };
}

async function refreshBattery() {
  try {
    renderBms(await fetchLocal());
  } catch (localError) {
    try {
      renderBms(await fetchCloud());
    } catch (cloudError) {
      $("batteryStatus").classList.add("offline");
      $("batteryStatus").innerHTML = '<span class="online-dot"></span>BMS OFFLINE';
      $("bmsUpdated").textContent = "ESP32/Cloud ยังไม่ส่งข้อมูล BMS";
      console.warn(localError, cloudError);
    }
  }
}

renderCells([]);
renderCellHealth([], 0);
renderTemperatures([]);
refreshBattery();
setInterval(refreshBattery, 5000);
