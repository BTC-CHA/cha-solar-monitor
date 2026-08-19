const ESP32 = "http://192.168.1.64";
const $ = id => document.getElementById(id);
let lastState = null;
let solarObservedSince = 0;

async function getJSON(path){
  const r = await fetch(`${ESP32}${path}`, {cache:"no-store"});
  const j = await r.json();
  if(!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function setModeTone(el, mode){
  el.classList.remove("sol","uti","sbu");
  if(mode) el.classList.add(mode.toLowerCase());
}

function fmtSeconds(sec){
  sec=Math.max(0,Math.round(sec));
  const m=Math.floor(sec/60), s=sec%60;
  return m ? `${m} นาที ${s} วินาที` : `${s} วินาที`;
}

function humanDecision(s){
  const soc=Math.round(Number(s.soc||0));
  const pv=Math.round(Number(s.solar_power_w||0));
  const t=s.thresholds||{};
  const low=Number(t.low_soc??30), recovery=Number(t.recovery_soc??60);
  const enter=Number(t.solar_enter_w??120), confirm=Number(t.solar_enter_delay_s??180);
  const current=s.current_mode||"--";
  const desired=s.desired_mode||"--";
  const raw=String(s.reason||"");

  if(!s.enabled) return {icon:"⏸️",title:"Smart IV ปิดอยู่",detail:`Inverter ทำงานตามโหมด ${current} ที่ตั้งไว้ ระบบไม่ส่งคำสั่งเปลี่ยนโหมด`,next:"เปิด SMART CONTROL เมื่อต้องการให้ระบบตัดสินใจอัตโนมัติ"};
  if(!s.bms_fresh) return {icon:"🛡️",title:"กำลังป้องกันแบตเตอรี่",detail:"ระบบอ่าน BMS ไม่ได้หรือข้อมูลเก่าเกินกำหนด จึงใช้โหมดปลอดภัย UTI",next:"เมื่อ BMS กลับมา ONLINE ระบบจะประเมินเงื่อนไขใหม่อัตโนมัติ"};
  if(raw.includes("LOW CELL")) return {icon:"🛡️",title:"พบ Cell ต่ำกว่าค่าปลอดภัย",detail:`Min Cell ${s.min_cell_mv||"--"}mV ระบบสั่ง UTI เพื่อหยุดการดึงแบต`,next:"ระบบจะประเมินใหม่หลังแรงดัน Cell ฟื้นและ BMS ปกติ"};
  if(raw.includes("WAIT COOLDOWN")) return {icon:"⏳",title:"กำลังพักก่อนเปลี่ยนโหมดอีกครั้ง",detail:`เพิ่งมีการสลับโหมด ระบบหน่วงเวลาเพื่อไม่ให้ Inverter สลับถี่เกินไป`,next:`เป้าหมายถัดไป ${desired} • Cooldown ${t.cooldown_s||60} วินาที`};
  if(raw.includes("WRITE FAILED")||raw.includes("READBACK FAILED")) return {icon:"⚠️",title:"คำสั่งเปลี่ยนโหมดยังไม่สำเร็จ",detail:`ต้องการ ${desired} แต่การ Write/Read-back E204 ไม่ผ่าน`,next:"ระบบจะลองประเมินใหม่ ตรวจ RS485 หากเกิดซ้ำ"};
  if(s.control && s.control!=="AUTO") return {icon:"🖐️",title:`กำลังบังคับโหมด ${current}`,detail:`Manual Override ทำงานอยู่ (${s.control}) ระบบ AUTO ยังไม่เป็นผู้เลือกโหมด`,next:"เลือก AUTO เมื่อต้องการกลับมาใช้ Logic อัตโนมัติ"};
  if(soc<=low){
    if(s.solar_ready) return {icon:"☀️",title:"แบตอยู่โซนป้องกัน แต่ Solar พร้อม",detail:`SOC ${soc}% ≤ ${low}% และ Solar ${pv}W เสถียรแล้ว ระบบใช้ SOL เพื่อรับ Solar โดยไม่ตั้งใจดึงแบต`,next:"เมื่อ SOC ฟื้นถึงเกณฑ์ ระบบจะเลือกโหมดตามช่วง SOC อัตโนมัติ"};
    return {icon:"🛡️",title:"กำลังรักษาแบตเตอรี่",detail:`SOC ${soc}% ≤ ${low}% ระบบเลือก UTI เพื่อหยุดการใช้แบต`,next:`ถ้า Solar ≥ ${enter}W ต่อเนื่อง ${confirm} วินาที ระบบจะพิจารณา SOL`};
  }
  if(soc>=recovery) return {icon:"🔋",title:"แบตเตอรี่พร้อมใช้งาน",detail:`SOC ${soc}% ≥ ${recovery}% ระบบเลือก SBU ให้ Solar เป็นหลัก แบตช่วย และ Grid เป็นลำดับสุดท้าย`,next:`จะป้องกันแบตเมื่อ SOC ลดถึง ${low}%`};
  if(s.solar_ready) return {icon:"☀️",title:"Solar เสถียรแล้ว",detail:`SOC ${soc}% อยู่ช่วงสำรอง และ Solar ${pv}W ผ่านเงื่อนไข ระบบเลือก SOL`,next:`ถ้า Solar หายต่อเนื่อง ระบบจะพิจารณา UTI`};
  if(pv>=enter){
    if(!solarObservedSince) solarObservedSince=Date.now();
    const elapsed=(Date.now()-solarObservedSince)/1000;
    const remain=Math.max(0,confirm-elapsed);
    return {icon:"🧠",title:"กำลังรอยืนยัน Solar",detail:`ตรวจพบ Solar ${pv}W ≥ ${enter}W • กำลังดูว่ามาเสถียรต่อเนื่อง`,next:`ต้องยืนยัน ${confirm} วินาที${remain>0?` • จากหน้าจอนี้ประมาณเหลือ ${fmtSeconds(remain)}`:" • ใกล้ครบเวลาแล้ว"}`};
  }
  solarObservedSince=0;
  return {icon:"🧠",title:"กำลังรักษาโหมดปัจจุบัน",detail:`SOC ${soc}% อยู่ระหว่าง ${low+1}–${recovery-1}% • Solar ${pv}W ยังไม่ผ่านเงื่อนไขเปลี่ยนโหมด`,next:`Current ${current} • ระบบกำลังเฝ้าดู Solar และ SOC ต่อเนื่อง`};
}

function render(s){
  lastState = s;
  $("enabledText").textContent = s.enabled ? "ON" : "OFF";
  $("masterSwitch").classList.toggle("on", !!s.enabled);
  $("statusDot").classList.toggle("on", !!s.enabled);
  $("reason").textContent = s.reason || "--";
  $("currentMode").textContent = s.current_mode || "--";
  setModeTone($("currentMode"), s.current_mode);
  $("desiredMode").textContent = s.desired_mode || "--";
  $("controlMode").textContent = s.control || "--";
  $("soc").textContent = `${Number(s.soc ?? 0).toFixed(0)}%`;
  $("minCell").textContent = s.min_cell_mv ? `${s.min_cell_mv}mV` : "--";
  $("solarPower").textContent = `${Math.round(Number(s.solar_power_w ?? 0))}W`;
  $("bmsFresh").textContent = s.bms_fresh ? "ONLINE" : "OFFLINE";

  const d=humanDecision(s);
  if($("decisionIcon")) $("decisionIcon").textContent=d.icon;
  if($("decisionTitle")) $("decisionTitle").textContent=d.title;
  if($("decisionDetail")) $("decisionDetail").textContent=d.detail;
  if($("decisionNext")) $("decisionNext").textContent=d.next;

  document.querySelectorAll("[data-mode]").forEach(b=>{
    const mode=b.dataset.mode;
    const active = s.control === "AUTO" ? mode === "AUTO" : s.control === `FORCE_${mode}`;
    b.classList.toggle("active", active);
  });

  const t=s.thresholds||{};
  if(document.activeElement!==$("lowSoc")) $("lowSoc").value=t.low_soc ?? 30;
  if(document.activeElement!==$("recoverySoc")) $("recoverySoc").value=t.recovery_soc ?? 60;
  if(document.activeElement!==$("solarEnter")) $("solarEnter").value=t.solar_enter_w ?? 120;
  if(document.activeElement!==$("solarExit")) $("solarExit").value=t.solar_exit_w ?? 60;
  if(document.activeElement!==$("enterSec")) $("enterSec").value=t.solar_enter_delay_s ?? 180;
  if(document.activeElement!==$("cooldownSec")) $("cooldownSec").value=t.cooldown_s ?? 60;
}

async function refresh(){
  try{ render(await getJSON("/api/smart-iv")); }
  catch(e){
    $("reason").textContent=`ESP32 OFFLINE • ${e.message}`;
    $("statusDot").classList.remove("on");
    if($("decisionTitle")) $("decisionTitle").textContent="ติดต่อ ESP32 ไม่ได้";
    if($("decisionDetail")) $("decisionDetail").textContent="หน้านี้ควบคุมผ่านเครือข่ายบ้านโดยตรง";
    if($("decisionNext")) $("decisionNext").textContent="ข้อมูล Cloud ยังดูได้จาก Overview แต่ Smart IV Control ผ่าน 5G ยังไม่เปิดใช้งาน";
  }
}

$("masterSwitch").addEventListener("click", async()=>{
  const enable = lastState?.enabled ? 0 : 1;
  try{ render(await getJSON(`/api/smart-iv/control?enable=${enable}`)); }
  catch(e){ alert(e.message); }
});

document.querySelectorAll("[data-mode]").forEach(btn=>{
  btn.addEventListener("click", async()=>{
    try{ render(await getJSON(`/api/smart-iv/control?control=${btn.dataset.mode}`)); }
    catch(e){ alert(e.message); }
  });
});

$("saveConfig").addEventListener("click", async()=>{
  const q=new URLSearchParams({low:$("lowSoc").value,recovery:$("recoverySoc").value,solar_enter_w:$("solarEnter").value,solar_exit_w:$("solarExit").value,enter_s:$("enterSec").value,cooldown_s:$("cooldownSec").value});
  try{render(await getJSON(`/api/smart-iv/config?${q}`));const old=$("saveConfig").textContent;$("saveConfig").textContent="บันทึกแล้ว ✓";setTimeout(()=>$("saveConfig").textContent=old,1200);}catch(e){alert(e.message);}
});

refresh();
setInterval(refresh, 4000);
