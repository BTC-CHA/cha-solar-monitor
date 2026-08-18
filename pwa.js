(function () {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let installPrompt = null;
  function addHeadLink(rel, href, sizes) {
    if (document.querySelector(`link[rel="${rel}"]`)) return;
    const link = document.createElement("link");
    link.rel = rel; link.href = href;
    if (sizes) link.sizes = sizes;
    document.head.appendChild(link);
  }
  addHeadLink("manifest", "manifest.webmanifest");
  addHeadLink("apple-touch-icon", "icons/cha-solar-192.png", "192x192");
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(console.warn));
  }
  if (standalone) return;
  if (!document.getElementById("pwaInstallStyle")) {
    const style = document.createElement("style");
    style.id = "pwaInstallStyle";
    style.textContent = ".pwa-install-button{position:fixed;right:14px;bottom:88px;z-index:120;padding:10px 14px;border:1px solid rgba(82,183,154,.28);border-radius:999px;color:#397d69;background:rgba(238,250,246,.96);box-shadow:0 9px 25px rgba(67,105,93,.16);font:800 11px/1 system-ui,sans-serif;backdrop-filter:blur(10px);cursor:pointer}.pwa-install-button[hidden]{display:none}.pwa-install-button span{margin-right:4px}";
    document.head.appendChild(style);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pwa-install-button";
  button.innerHTML = "<span>📲</span> ติดตั้งแอป";
  button.hidden = true;
  document.body.appendChild(button);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); installPrompt = event; button.hidden = false;
  });
  window.addEventListener("appinstalled", () => { installPrompt = null; button.hidden = true; });
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos) button.hidden = false;
  button.addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; button.hidden = true; return;
    }
    alert(isIos
      ? "แตะปุ่ม Share แล้วเลือก ‘Add to Home Screen’ หรือ ‘เพิ่มไปยังหน้าจอโฮม’"
      : "เปิดเมนูเบราว์เซอร์ ⋮ แล้วเลือก ‘ติดตั้งแอป’ หรือ ‘เพิ่มลงในหน้าจอหลัก’");
  });
})();
