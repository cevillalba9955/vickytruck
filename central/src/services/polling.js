/**
 * Ejecuta `fn` de inmediato y luego cada `intervalMs`, hasta que se llame a
 * la función de limpieza devuelta (FR-002: refresco automático sin recarga
 * manual). No superpone llamadas: espera a que `fn` termine antes de
 * programar la siguiente.
 */
export function pollEvery(intervalMs, fn) {
  let cancelado = false;
  let timer = null;

  async function tick() {
    if (cancelado) return;
    try {
      await fn();
    } finally {
      if (!cancelado) timer = setTimeout(tick, intervalMs);
    }
  }

  tick();

  return () => {
    cancelado = true;
    if (timer) clearTimeout(timer);
  };
}
