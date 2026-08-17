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
  const runtimeHours = loadKw >= 0.05 ? usableKwh / loadKw : Infinity;

  smartText("batteryRuntime", formatRuntime(runtimeHours));
  smartText(
    "batteryRuntimeDetail",
    `${usableKwh.toFixed(2)}kWh ใช้ได้ถึงระดับสำรอง ${SMART_CONFIG.reserveSoc}%`
  );

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
  } else if (Number(data.gridCurrent) > 0.2 && Number(data.pvPower) < 50) {
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
  const grid = Number(document.getElementById("energyGridToday")?.textContent);
  if (Number.isFinite(grid)) {
    smartText("gridCostToday", (grid * SMART_CONFIG.tariffBahtPerKwh).toFixed(2));
  }
  if (Number.isFinite(pv)) {
    smartText("solarSavingToday", (pv * SMART_CONFIG.tariffBahtPerKwh).toFixed(2));
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
