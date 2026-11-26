/** Page → SW bridge messages (LD-FE-12 recompute triggers). */

export function notifyServiceWorker(type: "medo:reschedule"): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  void navigator.serviceWorker.controller?.postMessage({ type });
}

/** Listen for SW messages (queue-changed from notification actions). */
export function onServiceWorkerMessage(
  handler: (data: { type?: string }) => void,
): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }
  const listener = (event: MessageEvent) => {
    if (event.data && typeof event.data === "object") {
      handler(event.data as { type?: string });
    }
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
