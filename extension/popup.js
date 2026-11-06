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
