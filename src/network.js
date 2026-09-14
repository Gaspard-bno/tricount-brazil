/** Bounded API requests, including response-body stalls and caller cancellation. */
export class NetworkError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "NetworkError";
    this.code = code;
    Object.assign(this, details);
  }
}

export async function fetchJsonWithTimeout(
  url,
  init = {},
  { timeoutMs = 6_000, fetchImpl = globalThis.fetch } = {},
) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive, finite number");
  }
  const controller = new AbortController();
  const sourceSignal = init.signal;
  let timer;
  let onAbort;
  const interrupted = new Promise((_, reject) => {
    onAbort = () => {
      const reason = sourceSignal?.reason || new DOMException("Request cancelled", "AbortError");
      controller.abort(reason);
      reject(reason);
    };
    if (sourceSignal?.aborted) onAbort();
    else sourceSignal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new NetworkError("La connexion prend trop de temps. Réessaie dans un instant.", "TIMEOUT");
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  const request = async () => {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await fetchImpl(url, { cache: "no-store", ...init, signal: controller.signal });
    let payload;
    const body = await response.text();
    try {
      payload = body ? JSON.parse(body) : null;
    } catch {
      throw new NetworkError("Réponse du service illisible.", "INVALID_RESPONSE", { status: response.status });
    }
    if (!response.ok) {
      throw new NetworkError(payload?.message || "Le service est momentanément indisponible.", "HTTP_ERROR", {
        status: response.status,
        payload,
      });
    }
    return payload;
  };

  try {
    return await Promise.race([request(), interrupted]);
  } finally {
    clearTimeout(timer);
    sourceSignal?.removeEventListener("abort", onAbort);
  }
}
