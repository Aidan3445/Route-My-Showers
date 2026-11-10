// Toolbar settings
(async () => {
  const $ = (id) => document.getElementById(id);
  const get = async () => (await chrome.storage.local.get("rms")).rms || {};

  const set = async (patch) => {
    const cur = await get();
    const rev = Math.random().toString(36).slice(2);
    await chrome.storage.local.set({ rms: { ...cur, ...patch, rev }, rmsRev: rev });
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id != null) await chrome.tabs.sendMessage(tab.id, { type: "rms-sync" });
    } catch (_) { /* not a Warmshowers tab */ }
  };

  // Firefox lets users withhold host permissions
  if (typeof browser !== "undefined" && browser.runtime.getBrowserInfo) {
    const m = chrome.runtime.getManifest();
    const origins = [...new Set([...(m.host_permissions || []), ...m.content_scripts.flatMap((c) => c.matches)])];
    const missing = !(await chrome.permissions.contains({ origins }));
    if (missing) {
      $("access").style.display = "block";
      $("grant").onclick = () => chrome.permissions.request({ origins }).then((ok) => {
        if (ok) $("access").style.display = "none";
      });
    }
  }

  const rms = await get();
  const n = (rms.routes || []).length;
  $("count").textContent = n ? `${n} route${n === 1 ? "" : "s"} on your map` : "No routes yet";

  $("panel").checked = !rms.panelHidden;
  $("routes").checked = rms.visible !== false;
  $("panel").onchange = () => set({ panelHidden: !$("panel").checked, collapsed: false });
  $("routes").onchange = () => set({ visible: $("routes").checked });

  const units = rms.units || "mi";
  const segs = [...$("units").querySelectorAll("button")];
  const paint = (v) => segs.forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  paint(units);
  segs.forEach((b) => (b.onclick = () => { paint(b.dataset.v); set({ units: b.dataset.v }); }));

  $("interval").value = rms.interval || "auto";
  $("interval").onchange = () => set({ interval: $("interval").value });
})();
