import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Empty } from "antd";

const CENTRO_DEFAULT = [-34.6037, -58.3816]; // Buenos Aires, si no hay ningún dato de posición todavía
const ZOOM_DEFAULT = 12;

const COLOR_RECIENTE = "#1a7f37";
const COLOR_NO_RECIENTE = "#b45309";

const COLOR_POR_ESTADO_PUNTO = {
  pendiente: "#6b7280",
  arribado: "#1d4ed8",
  completado: "#1a7f37",
};

// FR-009: cuando dos o más marcadores caen en coordenadas iguales o muy
// próximas, Leaflet ya permite acceder a cada uno haciendo zoom o abriendo
// su popup individualmente (los círculos quedan apilados pero clickeables);
// acá solo evitamos que compartan exactamente el mismo radio/estilo cuando
// están agrupados, para que el borde de cada uno siga siendo distinguible.
function radioParaGrupo(cantidadEnMismaCoordenada) {
  return cantidadEnMismaCoordenada > 1 ? 10 : 8;
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
 */
export function MapaSeguimiento({ marcadoresFlete = [], puntos = [], hayDatos = true, onSeleccionarFlete }) {
  if (!hayDatos) {
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
      : CENTRO_DEFAULT;

  const grupos = agruparPorCoordenada(marcadoresFlete);

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
          pathOptions={{ color: COLOR_POR_ESTADO_PUNTO[p.estado] ?? COLOR_POR_ESTADO_PUNTO.pendiente, fillOpacity: 0.7 }}
        >
          <Popup>
            Punto {p.orden} — {p.estado}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
