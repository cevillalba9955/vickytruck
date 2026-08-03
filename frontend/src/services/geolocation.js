const TIMEOUT_MS = 5000;

/**
 * Intenta obtener la ubicación actual del dispositivo, sin bloquear ni
 * fallar el flujo si no está disponible (FR-006, Principio VII: solo se pide
 * en el instante del evento, nunca tracking continuo).
 * @returns {Promise<{lat: number, lon: number} | null>}
 */
export function obtenerUbicacionBestEffort() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let resuelto = false;
    const finalizar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      resolve(valor);
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        finalizar({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => finalizar(null),
      { timeout: TIMEOUT_MS, maximumAge: 0 },
    );

    // Salvaguarda: algunos navegadores no respetan `timeout` de forma fiable.
    setTimeout(() => finalizar(null), TIMEOUT_MS + 500);
  });
}
