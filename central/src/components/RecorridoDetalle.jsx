import { Card, Table, Tag, Descriptions, Badge, Tooltip } from "antd";
import { MapaSeguimiento } from "./MapaSeguimiento.jsx";
import { construirPuntosEnMapa, distanciaMetros } from "../services/marcadores.js";
import {
  formatearHoraLocal,
  formatearFechaLocal,
  formatearDuracionMin,
  primerEventoIso,
  calcularTiempoTotalMin,
  minutosTranscurridos,
} from "../services/tiempo.js";

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  arribado: "Arribado",
  completado: "Completado",
};

const COLOR_ESTADO_PUNTO = {
  pendiente: "default",
  arribado: "blue",
  completado: "green",
};

// 009-central-mejora-visual: radio de tolerancia entre la posición GPS
// capturada al marcar arribo/descarga y el destino real del punto. Un valor
// fuera de este radio no bloquea nada (no hay geocerca, ver
// specs/008-registro-inicio-fin-recorrido/spec.md) — es solo una señal
// visual para que el operador de Central revise el caso.
const RADIO_PROXIMIDAD_M = 500;

function textoPunto(p) {
  return p.cliente || `Punto ${p.orden}`;
}

// Punto de color + hora (mismo patrón que el indicador de ubicación de
// MonitorView): verde si la posición registrada cayó dentro del radio
// esperado del punto, rojo si no, sin color si no hay GPS capturado para
// ese evento.
function HoraConProximidad({ hora, lat, lon, puntoLat, puntoLon }) {
  if (!hora) return <span>—</span>;
  if (lat == null || lon == null || puntoLat == null || puntoLon == null) {
    return <span>{formatearHoraLocal(hora)}</span>;
  }
  const distancia = distanciaMetros(puntoLat, puntoLon, lat, lon);
  const dentro = distancia <= RADIO_PROXIMIDAD_M;
  return (
    <Tooltip title={`${Math.round(distancia)} m del punto${dentro ? "" : ` — fuera del radio esperado de ${RADIO_PROXIMIDAD_M} m`}`}>
      <Badge status={dentro ? "success" : "error"} text={formatearHoraLocal(hora)} />
    </Tooltip>
  );
}

// Minutos desde la última posición GPS reportada por el flete (mismo patrón
// que IndicadorUbicacion en MonitorView.jsx): un punto de color por
// reciente/no reciente/sin datos, más los minutos transcurridos desde esa
// lectura — no la hora absoluta, que ya se ve en el mapa.
function UltimaUbicacion({ marcadorFlete }) {
  if (!marcadorFlete || marcadorFlete.en == null) {
    return (
      <Tooltip title="Sin ubicación reportada">
        <Badge status="default" text="—" />
      </Tooltip>
    );
  }
  const minutos = minutosTranscurridos(marcadorFlete.en);
  const status = marcadorFlete.reciente ? "success" : "warning";
  const etiqueta = marcadorFlete.reciente ? "Ubicación reciente" : "Ubicación no reciente";
  const texto = minutos < 1 ? "<1 min" : `${minutos} min`;
  return (
    <Tooltip title={`${etiqueta} — hace ${texto}`}>
      <Badge status={status} text={texto} />
    </Tooltip>
  );
}

const COLUMNAS_PUNTOS = [
  { title: "#", key: "orden", render: (_, p) => p.orden },
  { title: "Cliente", key: "cliente", render: (_, p) => textoPunto(p) },
  {
    title: "Estado",
    key: "estado",
    render: (_, p) => <Tag color={COLOR_ESTADO_PUNTO[p.estado]}>{ETIQUETAS_ESTADO[p.estado] ?? p.estado}</Tag>,
  },
  {
    title: "Hora de llegada",
    key: "arribo",
    render: (_, p) => (
      <HoraConProximidad hora={p.arriboEn} lat={p.arriboLat} lon={p.arriboLon} puntoLat={p.lat} puntoLon={p.lon} />
    ),
  },
  {
    title: "Hora de descarga",
    key: "descarga",
    render: (_, p) => (
      <HoraConProximidad hora={p.descargaEn} lat={p.descargaLat} lon={p.descargaLon} puntoLat={p.lat} puntoLon={p.lon} />
    ),
  },
];

/**
 * Detalle de un recorrido (Historia 3, FR-008): encabezado con fecha, flete,
 * chofer, horario e indicadores del recorrido, grilla de puntos (cliente,
 * estado, hora de llegada/descarga con proximidad GPS al destino) y mapa.
 * Solo lectura — la asignación/reasignación de flete ocurre en Oracle/APEX
 * antes del push a cloud (ver
 * specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md).
 *
 * `marcadorFlete` (004-mapa-seguimiento-central, Historia 2): última
 * ubicación conocida del flete de este recorrido, si tiene una — se recibe
 * ya calculada desde `activos` (el mismo estado que alimenta el mapa
 * general) para no requerir otro pedido de red; `null`/`undefined` si el
 * flete todavía no reportó ubicación o el recorrido ya no está activo.
 *
 * 009-central-mejora-visual: encabezado y grilla rediseñados — ver
 * research.md de esa feature.
 *
 * `accionVolver` (009-central-mejora-visual): nodo opcional (botón "Volver
 * al monitoreo"/"Volver al historial", según quién abrió el detalle) que se
 * ubica a la derecha del título del Card en vez de ocupar su propia fila
 * arriba — maximiza el área vertical disponible para el contenido.
 */
export function RecorridoDetalle({ detalle, marcadorFlete, accionVolver }) {
  if (!detalle) return null;
  const { recorrido, puntos } = detalle;
  const inicioIso = primerEventoIso(puntos);
  const fechaIso = recorrido.cierreEn ?? inicioIso;
  const tiempoTotalMin = calcularTiempoTotalMin(puntos, recorrido.cierreEn);

  return (
    <Card
      className="detalle-view"
      aria-label={`Detalle del recorrido ${recorrido.id}`}
      title={`Recorrido ${recorrido.id}`}
      extra={accionVolver}
    >
      <Descriptions bordered size="small" column={4} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Fecha">{fechaIso ? formatearFechaLocal(fechaIso) : "—"}</Descriptions.Item>
        <Descriptions.Item label="Flete">{recorrido.flete?.nombre ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Chofer">{recorrido.chofer?.nombre ?? "—"}</Descriptions.Item>
        <Descriptions.Item label="Estado">{recorrido.estado}</Descriptions.Item>
        <Descriptions.Item label="Hora inicio">{inicioIso ? formatearHoraLocal(inicioIso) : "—"}</Descriptions.Item>
        <Descriptions.Item label="Final">{recorrido.cierreEn ? formatearHoraLocal(recorrido.cierreEn) : "—"}</Descriptions.Item>
        <Descriptions.Item label="Tiempo total">{formatearDuracionMin(tiempoTotalMin)}</Descriptions.Item>
        <Descriptions.Item label="Última ubicación"><UltimaUbicacion marcadorFlete={marcadorFlete} /></Descriptions.Item>
      </Descriptions>

      <Table
        className="detalle-view__puntos"
        rowKey="id"
        pagination={false}
        size="small"
        columns={COLUMNAS_PUNTOS}
        dataSource={puntos}
        scroll={{ x: "max-content" }}
        style={{ marginBottom: 16 }}
      />

      <MapaSeguimiento marcadoresFlete={marcadorFlete ? [marcadorFlete] : []} puntos={construirPuntosEnMapa(puntos)} />
    </Card>
  );
}
