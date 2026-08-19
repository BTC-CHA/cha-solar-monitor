const SMART_CONFIG = Object.freeze({
  batteryVoltage: 51.2,
  batteryAh: 100,
  reserveSoc: 10,
  inverterEfficiency: 0.92,
  tariffBahtPerKwh: 4.5,
  staleAfterMs: 15000
});

let smartLastUpdate = 0;
let smartLastSource = "LIVE";
let smartLastData = null;

function smartText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatRuntime(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return "ใกล้ถึงระดับสำรอง";
  if (hours > 48) return "> 48 ชม.";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

function updateSmartOverview(data, source = "LIVE") {
  if (source !== "CACHE") smartLastUpdate = Date.now();
  smartLastSource = source;
  smartLastData = data;

  const nominalKwh = SMART_CONFIG.batteryVoltage * SMART_CONFIG.batteryAh / 1000;
  const usableSoc = Math.max(0, Number(data.batterySOC) - SMART_CONFIG.reserveSoc);
  const usableKwh = nominalKwh * usableSoc / 100 * SMART_CONFIG.inverterEfficiency;
  const loadKw = Math.max(0, Number(data.loadPower)) / 1000;
  const inverterGridCurrent = Number(data.inverterGridCurrent ?? data.gridCurrent);
  const runtimeHours = loadKw >= 0.05 ? usableKwh / loadKw : Infinity;
  const liveLoadCost = loadKw * SMART_CONFIG.tariffBahtPerKwh;

  smartText("batteryRuntime", formatRuntime(runtimeHours));
  smartText(
    "batteryRuntimeDetail",
    `${usableKwh.toFixed(2)}kWh ใช้ได้ถึงระดับสำรอง ${SMART_CONFIG.reserveSoc}%`
  );
  smartText("liveLoadCostDetail", `ขณะนี้ ${liveLoadCost.toFixed(2)} บาท/ชม. • โหลด ${Math.round(Number(data.loadPower) || 0)} W`);

  let title = "ระบบทำงานปกติ";
  let detail = "กำลังติดตามการใช้พลังงานแบบเรียลไทม์";
  let tone = "normal";

  if (Number(data.batterySOC) <= 20) {
    title = "แบตเตอรี่ใกล้ระดับสำรอง";
    detail = `เหลือ ${Number(data.batterySOC).toFixed(0)}% ควรลดโหลดที่ไม่จำเป็น`;
    tone = "warning";
  } else if (Number(data.inverterTemperature) >= 60) {
    title = "อุณหภูมิ Inverter สูง";
    detail = `${Number(data.inverterTemperature).toFixed(1)}°C ควรตรวจการระบายอากาศ`;
    tone = "warning";
  } else if (Number(data.pvPower) > Number(data.loadPower) + 150) {
    title = "มีพลังงาน Solar เหลือ";
    detail = `ผลิตมากกว่าโหลดประมาณ ${Math.round(data.pvPower - data.loadPower)}W`;
    tone = "solar";
  } else if (
    inverterGridCurrent > 0.2 &&
    Number(data.pvPower) < 50 &&
    Number(data.batterySOC) > 25 &&
    Math.abs(Number(data.batteryCurrent)) < 1 &&
    Number(data.loadPower) > 100
  ) {
    title = "แบตยังเหลือ แต่ระบบกำลังใช้ Grid";
    detail = `แบต ${Number(data.batterySOC).toFixed(0)}% (${Number(data.batteryVoltage).toFixed(1)}V) • ตรวจ Output Priority และจุดสลับ Grid/Battery`;
    tone = "grid";
  } else if (inverterGridCurrent > 0.2 && Number(data.pvPower) < 50) {
    title = "Grid กำลังรับโหลดหลัก";
    detail = `โหลดบ้าน ${Math.round(data.loadPower)}W • แบต ${Number(data.batteryCurrent).toFixed(1)}A`;
    tone = "grid";
  } else if (Number(data.batteryCurrent) > 0.2) {
    title = "Battery กำลังชาร์จ";
    detail = `${Number(data.batteryVoltage).toFixed(1)}V • ${Number(data.batteryCurrent).toFixed(1)}A`;
    tone = "battery";
  } else if (Number(data.batteryCurrent) < -0.2) {
    title = "Battery กำลังจ่ายพลังงาน";
    detail = `สำรองโหลดปัจจุบันได้ประมาณ ${formatRuntime(runtimeHours)}`;
    tone = "battery";
  }

  const insight = document.getElementById("smartInsight");
  if (insight) {
    insight.className = `smart-insight ${tone}`;
    insight.querySelector("b").textContent = title;
    insight.querySelector("small").textContent = detail;
  }
}

function updateEconomics() {
  const pv = Number(document.getElementById("energyPvToday")?.textContent);
  const load = Number(document.getElementById("energyLoadToday")?.textContent);
  const grid = Number(document.getElementById("energyGridToday")?.textContent);
  if (Number.isFinite(grid)) {
    smartText("gridCostToday", (grid * SMART_CONFIG.tariffBahtPerKwh).toFixed(2));
  }
  if (Number.isFinite(pv)) {
    smartText("solarSavingToday", (pv * SMART_CONFIG.tariffBahtPerKwh).toFixed(2));
  }
  if (Number.isFinite(load)) {
    smartText("loadCostToday", (load * SMART_CONFIG.tariffBahtPerKwh).toFixed(2));
  }
}

function updateFreshness() {
  const label = document.getElementById("lastUpdated");
  if (!label || !smartLastUpdate) return;
  const ageSeconds = Math.floor((Date.now() - smartLastUpdate) / 1000);
  const stale = ageSeconds * 1000 > SMART_CONFIG.staleAfterMs;
  label.className = `last-updated ${stale ? "stale" : "fresh"}`;
  label.textContent = stale
    ? `ข้อมูลขาดหาย ${ageSeconds} วินาที`
    : `${smartLastSource} • อัปเดต ${ageSeconds} วินาทีที่แล้ว`;

  const badge = document.getElementById("mobileSource");
  if (badge && stale) badge.textContent = "STALE";
}

const smartPreviousUpdateMobileCards = updateMobileCards;
updateMobileCards = function (data, source = "LIVE") {
  smartPreviousUpdateMobileCards(data, source);
  updateSmartOverview(data, source);
};

setInterval(updateFreshness, 1000);
setInterval(updateEconomics, 3000);
updateEconomics();

// =====================================================
// SMART IV V2.5 MINI STATUS + TAB INJECTION
// Keeps the legacy Overview layout intact: one compact card + one nav item.
// =====================================================
const SMART_IV_URL = "http://192.168.1.64/api/smart-iv";

function ensureSmartIvOverview() {
  if (!document.getElementById("smartIvMini")) {
    const section = document.querySelector(".smart-overview");
    const heading = section?.querySelector(".smart-heading");
    if (section && heading) {
      const card = document.createElement("a");
      card.id = "smartIvMini";
      card.href = "smart-iv.html";
      card.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:13px 15px;border:1px solid #e5ebe8;border-radius:17px;background:#fff;text-decoration:none;box-shadow:0 6px 18px rgba(68,82,103,.06);";
      card.innerHTML = `<div><small style="display:block;color:#8a96a4;font-weight:850;font-size:9px;letter-spacing:.06em">SMART IV</small><strong id="smartIvMiniMode" style="display:block;margin-top:3px;color:#4d5968;font-size:17px">--</strong></div><div style="text-align:right"><span id="smartIvMiniState" style="font-size:10px;font-weight:900;color:#8b97a6">CONNECTING</span><small id="smartIvMiniReason" style="display:block;max-width:190px;margin-top:3px;color:#98a2ae;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">รอ ESP32</small></div>`;
      heading.insertAdjacentElement("afterend", card);
    }
  }

  const nav = document.querySelector(".cha-nav");
  if (nav && !nav.querySelector('a[href="smart-iv.html"]')) {
    nav.style.gridTemplateColumns = "repeat(5, 1fr)";
    const a = document.createElement("a");
    a.href = "smart-iv.html";
    a.innerHTML = '<span class="nav-icon">⚡</span>SMART IV';
    nav.appendChild(a);
  }
}

async function updateSmartIvMini() {
  ensureSmartIvOverview();
  const mode = document.getElementById("smartIvMiniMode");
  const state = document.getElementById("smartIvMiniState");
  const reason = document.getElementById("smartIvMiniReason");
  if (!mode || !state || !reason) return;
  try {
    const r = await fetch(SMART_IV_URL, {cache:"no-store"});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const s = await r.json();
    mode.textContent = `${s.current_mode || "--"} • BMS ${Number(s.soc ?? 0).toFixed(0)}%`;
    state.textContent = s.enabled ? `${s.control} • ON` : "OFF";
    state.style.color = s.enabled ? "#4c9b7e" : "#8b97a6";
    reason.textContent = s.reason || "--";
  } catch (e) {
    mode.textContent = "ESP32 OFFLINE";
    state.textContent = "NO CONTROL";
    state.style.color = "#c47d7d";
    reason.textContent = "Smart IV status unavailable";
  }
}

ensureSmartIvOverview();
updateSmartIvMini();
setInterval(updateSmartIvMini, 4000);
