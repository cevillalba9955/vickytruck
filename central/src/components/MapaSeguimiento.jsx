import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import { Empty } from "antd";
import { formatearHoraCorta } from "../services/tiempo.js";

const CENTRO_DEFAULT = [-34.6037, -58.3816]; // Buenos Aires, si no hay ningún dato de posición todavía
const ZOOM_DEFAULT = 12;

const COLOR_RECIENTE = "#1a7f37";
const COLOR_NO_RECIENTE = "#b45309";

const COLOR_POR_ESTADO_PUNTO = {
  pendiente: "#6b7280",
  arribado: "#1d4ed8",
  completado: "#1a7f37",
};

// 014-mapa-historial-hora-distancia, FR-002: borde del punto de entrega en
// modo "detalle" — independiente del color de relleno por estado
// (COLOR_POR_ESTADO_PUNTO), para no perder esa información al señalar la
// alerta de distancia (research.md, Decisión 6).
const COLOR_BORDE_NEUTRAL = "#374151";
const COLOR_ALERTA_DISTANCIA = "#c0392b";

// true si algún evento registrado del punto (llegada y/o descarga) quedó
// fuera de la distancia mínima esperada (FR-002); `alerta` puede faltar en
// puntos que no vinieron de `construirPuntosEnMapa` (modo unificado, que no
// usa este campo).
function tienePuntoAlertaDistancia(alerta) {
  return alerta?.llegada === true || alerta?.descarga === true;
}

// Texto de hora(s) para el Tooltip de un punto de entrega (FR-001): incluye
// solo los eventos que efectivamente se registraron.
function textoHorasPunto(arriboEn, descargaEn) {
  const partes = [];
  if (arriboEn) partes.push(`Llegada ${formatearHoraCorta(arriboEn)}`);
  if (descargaEn) partes.push(`Descarga ${formatearHoraCorta(descargaEn)}`);
  return partes;
}

// FR-009: cuando dos o más marcadores caen en coordenadas iguales o muy
// próximas, Leaflet ya permite acceder a cada uno haciendo zoom o abriendo
// su popup individualmente (los círculos quedan apilados pero clickeables);
// acá solo evitamos que compartan exactamente el mismo radio/estilo cuando
// están agrupados, para que el borde de cada uno siga siendo distinguible.
function radioParaGrupo(cantidadEnMismaCoordenada) {
  return cantidadEnMismaCoordenada > 1 ? 10 : 8;
}

// Ícono de vehículo (010-mapa-central-unificado, US2): forma distinta a los
// CircleMarker de punto de entrega/salida, independiente del color de
// recorrido (que llega vía el color de fondo inline, no la paleta de
// estado-de-punto). El color de identidad del flete reemplaza acá al color
// de reciente/no-reciente que sigue usando `marcadoresFlete` en el mapa de
// Detalle (research.md, Decisión 5) — esa información pasa al texto del
// Popup en vez del color.
function iconoFlete(color) {
  return L.divIcon({
    className: "marcador-flete",
    html: `<div class="marcador-flete__cuerpo" style="background:${color}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Ícono de punto de salida (010-mapa-central-unificado, US4): forma propia
// (bandera/base), distinta tanto del rombo de flete como del círculo de
// punto de entrega. El punto de salida por defecto/compartido no lleva
// color (Clarifications de spec.md) — solo lo llevan los marcadores de
// salida propios de un recorrido (`tipo: "salidaRecorrido"`).
function iconoSalida(color) {
  return L.divIcon({
    className: "marcador-salida",
    html: `<div class="marcador-salida__cuerpo"${color ? ` style="background:${color}"` : ""}></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 16],
  });
}

// Íconos de inicio/cierre del recorrido (014-mapa-historial-hora-distancia,
// US2): forma propia por tipo, distinta entre sí y de las ya existentes
// (flete/punto/salida) — sin color propio, igual que el punto de salida
// por defecto (no pertenecen a un único flete que colorear).
function iconoExtremo(tipo) {
  return L.divIcon({
    className: `marcador-${tipo}`,
    html: `<div class="marcador-${tipo}__cuerpo"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function agruparPorCoordenada(items) {
  const grupos = new Map();
  for (const item of items) {
    const clave = `${item.lat},${item.lon}`;
    grupos.set(clave, (grupos.get(clave) ?? 0) + 1);
  }
  return grupos;
}

/**
 * Mapa de seguimiento (004-mapa-seguimiento-central). Modo general
 * (Historia 1, en la vista de Monitoreo): un marcador por flete activo con
 * ubicación conocida. Modo detalle (Historia 2, dentro de RecorridoDetalle):
 * agrega los puntos de entrega del recorrido, cada uno con su estado.
 *
 * `marcadoresUnificados` (010-mapa-central-unificado, US1): vista
 * consolidada de la sección Mapa general — reemplaza a `marcadoresFlete`/
 * `puntos` cuando se pasa, dibujando TODOS los recorridos activos a la vez
 * (flete + puntos), cada uno con el color de su flete
 * (`construirMarcadoresMapaUnificado`). `marcadoresFlete`/`puntos` siguen
 * sin cambios para el mapa embebido en Detalle (un solo recorrido, sin
 * color por flete — spec.md, Assumptions).
 *
 * `marcadorInicio`/`marcadorCierre` (014-mapa-historial-hora-distancia,
 * US2): opcionales — marcador de inicio/cierre del recorrido (forma de
 * `construirMarcadorExtremo`) para el mapa de Detalle. `null`/`undefined`
 * si ese dato no está registrado (FR-007): no se dibuja nada, sin romper
 * el resto del mapa.
 */
export function MapaSeguimiento({
  marcadoresFlete = [],
  puntos = [],
  marcadoresUnificados = [],
  marcadorInicio = null,
  marcadorCierre = null,
  hayDatos = true,
  onSeleccionarFlete,
}) {
  // 010-mapa-central-unificado, US4: el punto de salida por defecto no
  // depende de que haya recorridos activos (FR-006) — si `marcadoresUnificados`
  // trae al menos ese marcador, el mapa se muestra igual aunque `hayDatos`
  // sea `false` (0 recorridos activos).
  if (!hayDatos && marcadoresUnificados.length === 0) {
    return (
      <div role="status">
        <Empty description="No hay recorridos activos en este momento." />
      </div>
    );
  }

  const centro = marcadoresFlete[0]
    ? [marcadoresFlete[0].lat, marcadoresFlete[0].lon]
    : puntos[0]
      ? [puntos[0].lat, puntos[0].lon]
      : marcadoresUnificados[0]
        ? [marcadoresUnificados[0].lat, marcadoresUnificados[0].lon]
        : CENTRO_DEFAULT;

  const grupos = agruparPorCoordenada(marcadoresFlete);
  const gruposUnificados = agruparPorCoordenada(marcadoresUnificados);

  return (
    <MapContainer center={centro} zoom={ZOOM_DEFAULT} className="mapa-seguimiento" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {marcadoresFlete.map((m) => (
        <CircleMarker
          key={m.recorridoId}
          center={[m.lat, m.lon]}
          radius={radioParaGrupo(grupos.get(`${m.lat},${m.lon}`))}
          pathOptions={{
            color: m.reciente ? COLOR_RECIENTE : COLOR_NO_RECIENTE,
            fillColor: m.reciente ? COLOR_RECIENTE : COLOR_NO_RECIENTE,
            fillOpacity: 0.85,
          }}
          data-ubicacion-reciente={m.reciente}
          eventHandlers={onSeleccionarFlete ? { click: () => onSeleccionarFlete(m.recorridoId) } : undefined}
        >
          <Popup>
            {m.fleteNombre ?? "Flete sin nombre"}
            <br />
            {m.reciente ? "Ubicación reciente" : "Ubicación no reciente"}
          </Popup>
        </CircleMarker>
      ))}

      {puntos.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lon]}
          radius={6}
          pathOptions={{
            color: tienePuntoAlertaDistancia(p.alerta) ? COLOR_ALERTA_DISTANCIA : COLOR_BORDE_NEUTRAL,
            fillColor: COLOR_POR_ESTADO_PUNTO[p.estado] ?? COLOR_POR_ESTADO_PUNTO.pendiente,
            fillOpacity: 0.7,
          }}
        >
          {/* Tooltip (hover, 014-mapa-historial-hora-distancia, FR-001) en
              vez de Popup (click) — mismo criterio que marcadoresUnificados:
              la hora y la alerta de distancia deben verse con un vistazo. */}
          <Tooltip>
            Punto {p.orden} — {p.estado}
            {textoHorasPunto(p.arriboEn, p.descargaEn).map((linea) => (
              <div key={linea}>{linea}</div>
            ))}
            {tienePuntoAlertaDistancia(p.alerta) && <div>Fuera de la distancia mínima esperada</div>}
          </Tooltip>
        </CircleMarker>
      ))}

      {[marcadorInicio, marcadorCierre].filter(Boolean).map((m) => (
        <Marker key={m.tipo} position={[m.lat, m.lon]} icon={iconoExtremo(m.tipo)}>
          <Tooltip>
            {m.tipo === "inicio" ? "Inicio del recorrido" : "Cierre del recorrido"} — {formatearHoraCorta(m.iso)}
          </Tooltip>
        </Marker>
      ))}

      {marcadoresUnificados.map((m) => {
        if (m.tipo === "flete") {
          return (
            <Marker
              key={`flete-${m.recorridoId}`}
              position={[m.lat, m.lon]}
              icon={iconoFlete(m.color)}
              eventHandlers={onSeleccionarFlete ? { click: () => onSeleccionarFlete(m.recorridoId) } : undefined}
            >
              {/* Tooltip (hover, US3) en vez de Popup (click) — el color ya
                  identifica al flete (FR-002), así que acá se agrega si su
                  ubicación es reciente o no (FR-005, research.md Decisión 5). */}
              <Tooltip>
                {m.fleteNombre ?? "Flete sin nombre"} — ubicación {m.reciente ? "reciente" : "no reciente"}
              </Tooltip>
            </Marker>
          );
        }

        if (m.tipo === "punto") {
          return (
            <CircleMarker
              key={`punto-${m.recorridoId}-${m.id}`}
              center={[m.lat, m.lon]}
              radius={radioParaGrupo(gruposUnificados.get(`${m.lat},${m.lon}`))}
              pathOptions={{ color: m.color, fillColor: m.color, fillOpacity: 0.7 }}
            >
              <Tooltip>{m.cliente || `Punto ${m.orden}`}</Tooltip>
            </CircleMarker>
          );
        }

        // salidaDefault / salidaRecorrido (010-mapa-central-unificado, US4):
        // sin eventHandlers.click — no pertenece a un único recorrido que
        // tenga sentido abrir (Assumptions de spec.md).
        return (
          <Marker
            key={m.tipo === "salidaDefault" ? "salida-default" : `salida-${m.recorridoId}`}
            position={[m.lat, m.lon]}
            icon={iconoSalida(m.color)}
          >
            <Tooltip>{m.tipo === "salidaDefault" ? "Punto de salida" : "Punto de salida de este recorrido"}</Tooltip>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
