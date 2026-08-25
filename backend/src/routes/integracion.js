import { Router } from "express";
import { validarAuthIntegracion } from "../middleware/integracionAuth.js";
import { emqxProvisioningCompartido } from "../mqtt/emqxProvisioning.js";

// Momento de inicio del RECORRIDO completo (008-registro-inicio-fin-recorrido,
// User Story 4, 2026-08-25): no es un evento capturado aparte — es el
// inicioEn/inicioLat/inicioLon más temprano entre los puntos, es decir, el
// evento de inicio del punto que efectivamente resultó ser el primero en
// iniciarse (FR-016), sin importar si ese punto sigue siendo el "punto 1"
// nominal o fue reordenado (IR PRIMERO) antes de iniciarse. `null` si
// todavía no se tocó INICIAR sobre ningún punto.
function primerInicio(puntos) {
  const conInicio = puntos.filter((p) => p.inicioEn);
  if (conInicio.length === 0) return { en: null, lat: null, lon: null };
  const primero = conInicio.reduce((min, p) => (new Date(p.inicioEn) < new Date(min.inicioEn) ? p : min));
  return { en: primero.inicioEn, lat: primero.inicioLat ?? null, lon: primero.inicioLon ?? null };
}

function serializarEstado(recorrido) {
  const inicioRecorrido = primerInicio(recorrido.puntos);
  return {
    id: recorrido.id,
    estado: recorrido.estado,
    fleteId: recorrido.fleteId,
    updatedAt: recorrido.updatedAt,
    ultimaUbicacion: recorrido.ultimaUbicacion ?? null,
    // inicioEn/inicioLat/inicioLon a este nivel (008, User Story 4,
    // 2026-08-25): momento de inicio del recorrido completo, ver
    // primerInicio() arriba. Distinto de puntos[].inicioEn (por punto, más
    // abajo) — Oracle escribe este en T_RECORRIDOS, aquél en
    // T_PUNTOS_ENTREGA (ver integracion_cloud_api.pkb.sql, leer_estado_puntos).
    inicioEn: inicioRecorrido.en,
    inicioLat: inicioRecorrido.lat,
    inicioLon: inicioRecorrido.lon,
    // cierreEn/cierreLat/cierreLon (008-registro-inicio-fin-recorrido, dirección
    // Oracle, 2026-08-25): evento de FINALIZAR, a nivel de recorrido — Oracle
    // lo escribe sobre T_RECORRIDOS, no sobre un punto (ver
    // integracion_cloud_api.pkb.sql, leer_estado_puntos).
    cierreEn: recorrido.cierreEn ?? null,
    cierreLat: recorrido.cierreLat ?? null,
    cierreLon: recorrido.cierreLon ?? null,
    puntos: recorrido.puntos.map((p) => ({
      id: p.id,
      // `orden` (005-chofer-estados-viaje, FR-016): antes ausente de este
      // contrato. Es el orden vigente en el cloud, que puede incluir un
      // reordenamiento del chofer (IR PRIMERO) que Oracle todavía no tenía.
      orden: p.orden,
      estado: p.estado,
      // inicioEn/inicioLat/inicioLon (008-registro-inicio-fin-recorrido,
      // dirección Oracle, 2026-08-25): evento de INICIAR sobre este punto,
      // mismo nivel que arriboEn/descargaEn.
      inicioEn: p.inicioEn ?? null,
      inicioLat: p.inicioLat ?? null,
      inicioLon: p.inicioLon ?? null,
      arriboEn: p.arriboEn,
      arriboLat: p.arriboLat ?? null,
      arriboLon: p.arriboLon ?? null,
      descargaEn: p.descargaEn,
      descargaLat: p.descargaLat ?? null,
      descargaLon: p.descargaLon ?? null,
    })),
  };
}

export function createIntegracionRouter(store, emqxProvisioning = emqxProvisioningCompartido, mqttBridge = null) {
  const router = Router();

  router.use(validarAuthIntegracion);

  // GET /mqtt/estado (012-ubicacion-por-chofer, FR-007/FR-008): salud del
  // canal de ubicación en vivo, consultable sin depender de la consola de
  // EMQX Cloud — ver contracts/mqtt-estado-api.md.
  router.get("/mqtt/estado", (req, res) => {
    res.json(mqttBridge?.obtenerMetricas?.() ?? { habilitado: false });
  });

  router.post("/recorridos", async (req, res) => {
    const payload = req.body || {};
    if (!Array.isArray(payload.recorridos)) {
      return res.status(400).json({ error: "invalid_payload" });
    }

    const upserted = store.upsertRecorridos(payload.recorridos);

    // Aprovisiona (o refresca) la credencial MQTT permanente de cada chofer
    // recibido (2026-08-10, spec.md FR-013 — reemplaza el aprovisionamiento
    // por-fleteId), para que ya esté lista en EMQX Cloud antes de que el
    // chofer abra el link (ver emqxProvisioning.js). Fire-and-forget: un
    // EMQX Cloud lento/caído no debe bloquear ni fallar este push de
    // Oracle/APEX — se reintenta solo en el próximo push del mismo
    // recorrido (idempotente). Sin `choferId` (payloads viejos de Oracle
    // que todavía no lo envían), el recorrido queda cargado y operable pero
    // sin credencial MQTT — ver spec.md FR-013.
    for (const raw of payload.recorridos) {
      if (!raw?.id) continue;
      const [actual] = store.listarEstado(String(raw.id));
      if (!actual?.choferId) continue;
      emqxProvisioning.provisionarCredencialChofer(actual.choferId).catch((err) => {
        console.error(`[integracion] no se pudo aprovisionar MQTT para choferId=${actual.choferId}:`, err.message);
      });
    }

    return res.status(200).json({ ok: true, upserted, rejected: payload.recorridos.length - upserted });
  });

  router.get("/estado", async (req, res) => {
    const { recorridoId } = req.query || {};
    const recorridos = store.listarEstado(recorridoId ? String(recorridoId) : null);

    if (recorridoId && recorridos.length === 0) {
      return res.status(404).json({ error: "recorrido_no_encontrado" });
    }

    // Confirma sincronización (005-chofer-estados-viaje, research.md
    // Decisión 3/4): solo para los recorridos efectivamente servidos en esta
    // respuesta — Oracle recién "vio" estos, no el resto que quedó fuera de
    // la página. A partir de acá, CANCELAR deja de aplicar sobre su última
    // operación y `mergearPunto` deja de proteger su `orden`.
    if (recorridoId) {
      for (const r of recorridos) store.confirmarSincronizacion(r.id);
      return res.status(200).json({ recorridos: recorridos.map(serializarEstado) });
    }

    const limit = Math.max(1, Number(req.query?.limit || 50));
    const offset = Math.max(0, Number(req.query?.offset || 0));
    const servidos = recorridos.slice(offset, offset + limit);
    for (const r of servidos) store.confirmarSincronizacion(r.id);
    const page = servidos.map(serializarEstado);

    return res.status(200).json({
      recorridos: page,
      paginacion: {
        total: recorridos.length,
        limit,
        offset,
        hasNext: offset + limit < recorridos.length,
      },
    });
  });

  return router;
}
