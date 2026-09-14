/** Register a coherent cached shell after the first render, with an explicit update action. */
export function registerPwa({ onUpdate = () => {} } = {}) {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || location.protocol === "file:") return;
  const version = document.querySelector('meta[name="app-build"]')?.content;
  const announced = new WeakSet();
  let reloadOnControllerChange = false;
  let lastUpdateCheck = 0;

  function reportVersion() {
    if (version) navigator.serviceWorker.controller?.postMessage({ type: "CLIENT_VERSION", version });
  }
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "REQUEST_CLIENT_VERSION") reportVersion();
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadOnControllerChange) {
      reloadOnControllerChange = false;
      location.reload();
    } else reportVersion();
  });

  async function register() {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: "none" });
      reportVersion();
      function offerUpdate() {
        const worker = registration.waiting;
        if (!worker || !navigator.serviceWorker.controller || announced.has(worker)) return;
        announced.add(worker);
        onUpdate(() => {
          reloadOnControllerChange = true;
          worker.postMessage({ type: "SKIP_WAITING" });
        });
      }
      offerUpdate();
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", offerUpdate);
      });
      async function checkForUpdate() {
        if (document.visibilityState === "hidden" || !navigator.onLine || Date.now() - lastUpdateCheck < 60_000) return;
        lastUpdateCheck = Date.now();
        try { await registration.update(); } catch { /* Cached use remains available offline. */ }
        offerUpdate();
        reportVersion();
      }
      document.addEventListener("visibilitychange", checkForUpdate);
      window.addEventListener("online", checkForUpdate);
      await checkForUpdate();
    } catch { /* Unsupported/private storage must never block normal app use. */ }
  }

  const start = () => "requestIdleCallback" in window
    ? window.requestIdleCallback(register, { timeout: 2500 })
    : setTimeout(register, 250);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
