// Injects the page-world scripts (haversine.js, then page.js) into the Warmshowers page itself,
// where the site's google.maps.Map lives. async = false keeps them running in this order.
(() => {
  const parent = document.head || document.documentElement;
  for (const file of ["haversine.js", "page.js"]) {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL(file);
    s.async = false;
    s.onload = () => s.remove();
    parent.appendChild(s);
  }
})();
