// Construye el enlace único que Central distribuye al chofer
// (004-chofer-cloud-broker): el payload completo del recorrido (puntos +
// configuración de conexión MQTT, incluyendo el token de publicación) viaja
// embebido en el fragmento de la URL (`#/r/<base64url>`), así que abrirlo no
// requiere ninguna llamada de red hacia este backend (FR-002a). Mismo shape
// que antes devolvía `GET /api/recorridos/:token` (ahora retirado, ver
// contracts/enlace-recorrido.md) — solo cambia el canal de entrega.
//
// Determinístico igual que `emqxProvisioning.provisionarCredencial`: pedir
// el enlace dos veces para el mismo token (antes de que el recorrido
// finalice) da la misma url, sin guardar nada nuevo en Oracle (FR-006,
// research.md §4).

function intervaloReporteUbicacionMs() {
  return Number(process.env.UBICACION_REPORTE_INTERVALO_MS || 60000);
}

function serializePunto(punto, totalPuntos) {
  return {
    id: punto.id,
    orden: punto.orden,
    totalPuntos,
    latitud: punto.latitud,
    longitud: punto.longitud,
    estado: punto.estado,
    arriboEn: punto.arriboEn,
    descargaEn: punto.descargaEn,
  };
}

function codificarPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * `recorridoRepository`, `emqxProvisioning` y `frontendBaseUrl` se reciben
 * por parámetro (mismo patrón de inyección que `createRecorridoRouter`/
 * `createCentralRouter`) para poder testear sin Oracle ni EMQX Cloud reales.
 * `frontendBaseUrl` cae a `CHOFER_FRONTEND_URL` si no se pasa explícito.
 */
export function createEnlaceRecorrido({ recorridoRepository, emqxProvisioning, frontendBaseUrl } = {}) {
  function baseUrl() {
    const url = frontendBaseUrl ?? process.env.CHOFER_FRONTEND_URL;
    if (!url) {
      throw new Error("CHOFER_FRONTEND_URL no configurado (ver backend/.env.example)");
    }
    return url.replace(/\/+$/, "");
  }

  return {
    /** Devuelve `{ payload, url }`, o `null` si el token no corresponde a ningún recorrido. */
    async construirEnlace(token) {
      const recorrido = await recorridoRepository.obtenerPorToken(token);
      if (!recorrido) return null;

      const { username, password } = await emqxProvisioning.provisionarCredencial(token);
      const payload = {
        recorrido: {
          estado: recorrido.estado,
          mqtt: {
            url: process.env.EMQX_WSS_URL,
            username,
            password,
            ubicacionTopic: `vickytruck/fletes/${token}/ubicacion`,
            eventosTopic: `vickytruck/fletes/${token}/eventos`,
            intervaloUbicacionMs: intervaloReporteUbicacionMs(),
          },
        },
        progreso: recorrido.progreso,
        puntos: recorrido.puntos.map((p) => serializePunto(p, recorrido.puntos.length)),
      };

      return { payload, url: `${baseUrl()}/#/r/${codificarPayload(payload)}` };
    },
  };
}
