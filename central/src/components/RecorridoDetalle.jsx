import { MapaSeguimiento } from "./MapaSeguimiento.jsx";
import { construirPuntosEnMapa } from "../services/marcadores.js";
import { formatearHoraLocal } from "../services/tiempo.js";

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  arribado: "Arribado",
  completado: "Completado",
};

// Tiempo de regreso a base (008-registro-inicio-fin-recorrido, SC-003): desde
// la descarga completa del último punto hasta el cierre explícito del
// recorrido (FINALIZAR) — hueco que antes no existía porque el cierre era
// automático. `null` si falta cualquiera de los dos datos.
function calcularTiempoRegresoMin(puntos, cierreEn) {
  if (!cierreEn) return null;
  const descargas = puntos.map((p) => p.descargaEn).filter(Boolean);
  if (descargas.length === 0) return null;
  const ultimaDescargaMs = Math.max(...descargas.map((d) => new Date(d).getTime()));
  const diffMs = new Date(cierreEn).getTime() - ultimaDescargaMs;
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round(diffMs / 60000);
}

/**
 * Detalle de un recorrido (Historia 3, FR-008): puntos en orden, estado y
 * eventos registrados. Solo lectura — la asignación/reasignación de flete
 * ocurre en Oracle/APEX antes del push a cloud (ver
 * specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md).
 *
 * `marcadorFlete` (004-mapa-seguimiento-central, Historia 2): última
 * ubicación conocida del flete de este recorrido, si tiene una — se recibe
 * ya calculada desde `activos` (el mismo estado que alimenta el mapa
 * general) para no requerir otro pedido de red; `null`/`undefined` si el
 * flete todavía no reportó ubicación o el recorrido ya no está activo.
 */
export function RecorridoDetalle({ detalle, marcadorFlete }) {
  if (!detalle) return null;
  const { recorrido, puntos } = detalle;
  const tiempoRegresoMin = calcularTiempoRegresoMin(puntos, recorrido.cierreEn);

  return (
    <section className="detalle-view" aria-label={`Detalle del recorrido ${recorrido.id}`}>
      <h2>Recorrido {recorrido.id}</h2>
      <p>
        Estado: <strong>{recorrido.estado}</strong>
        {recorrido.fleteId && <> — Flete asignado: {recorrido.fleteId}</>}
      </p>
      {/* Cierre (008-registro-inicio-fin-recorrido, FR-005/SC-003): evento
          explícito de FINALIZAR, distinto del descargaEn del último punto. */}
      {recorrido.cierreEn && (
        <p>
          Cierre: <strong>{formatearHoraLocal(recorrido.cierreEn)}</strong>
          {tiempoRegresoMin != null && <> — regreso a base: {tiempoRegresoMin} min</>}
        </p>
      )}

      <ol className="detalle-view__lista">
        {puntos.map((p) => (
          <li key={p.id}>
            <strong>
              {p.orden} de {puntos.length}
            </strong>{" "}
            — {ETIQUETAS_ESTADO[p.estado] ?? p.estado}
            {/* 006-normalizar-formato-horario, US2: HH24:MM:SS local — funciona
                igual para timestamps nuevos (-03:00) e históricos (Z, FR-006). */}
            {p.inicioEn && <div>Inicio: {formatearHoraLocal(p.inicioEn)}</div>}
            {p.arriboEn && <div>Arribo: {formatearHoraLocal(p.arriboEn)}</div>}
            {p.descargaEn && <div>Descarga: {formatearHoraLocal(p.descargaEn)}</div>}
          </li>
        ))}
      </ol>

      <MapaSeguimiento marcadoresFlete={marcadorFlete ? [marcadorFlete] : []} puntos={construirPuntosEnMapa(puntos)} />
    </section>
  );
}
