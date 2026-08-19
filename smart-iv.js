const ESP32 = "http://192.168.1.64";
const $ = id => document.getElementById(id);
let lastState = null;

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
  const q=new URLSearchParams({
    low:$("lowSoc").value,
    recovery:$("recoverySoc").value,
    solar_enter_w:$("solarEnter").value,
    solar_exit_w:$("solarExit").value,
    enter_s:$("enterSec").value,
    cooldown_s:$("cooldownSec").value
  });
  try{
    render(await getJSON(`/api/smart-iv/config?${q}`));
    const old=$("saveConfig").textContent;
    $("saveConfig").textContent="บันทึกแล้ว ✓";
    setTimeout(()=>$("saveConfig").textContent=old,1200);
  }catch(e){ alert(e.message); }
});

refresh();
setInterval(refresh, 4000);
