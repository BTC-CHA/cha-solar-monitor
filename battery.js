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
  $("batteryStatus").classList.remove("offline");
  $("batteryStatus").innerHTML = '<span class="online-dot"></span>' + (b.source === "CLOUD" ? "CLOUD" : "BMS ONLINE");
  $("bmsUpdated").textContent = b.recorded_at
    ? "อัปเดต Cloud " + new Date(b.recorded_at).toLocaleString("th-TH")
    : "อ่านตรงจาก ESP32 • อัปเดตล่าสุดเมื่อ " + new Date().toLocaleTimeString("th-TH");

  renderCells(b.cells_mv || []);
  renderTemperatures(b.temperatures_c || []);
}

function renderCells(cells) {
  const grid = $("cellGrid");
  if (!cells.length) {
    grid.innerHTML = '<div class="battery-empty">รอข้อมูลแรงดันเซลล์จาก BMS</div>';
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
  if (!(row.battery_bms || row.bms_data || row.bms)) throw new Error("BMS CLOUD FIELD NOT READY");
  return normalizeBms(row, "CLOUD");
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
renderTemperatures([]);
refreshBattery();
setInterval(refreshBattery, 5000);

