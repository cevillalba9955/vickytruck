import { Table, Button, Empty, Tag, Badge, Tooltip, Progress } from "antd";
import { minutosTranscurridos } from "../services/tiempo.js";

// 009-central-mejora-visual: colores de la barra de progreso — el mismo
// verde que ya usa el mapa para "reciente/completado" (MapaSeguimiento.jsx)
// cuando el recorrido está 100% completado, y el azul primario del theme
// (theme/tokens.js) mientras sigue en curso.
const COLOR_PROGRESO_COMPLETO = "#1a7f37";
const COLOR_PROGRESO_EN_CURSO = "#2c5f8a";

// Barra de progreso "Completados / Total" (009-central-mejora-visual):
// reemplaza el texto "X completados / Y en curso / Z pendientes" — ese
// detalle sigue disponible en el tooltip, sin ocupar espacio en la tabla.
function BarraProgreso({ progreso }) {
  const total = progreso.completados + progreso.arribados + progreso.pendientes;
  const porcentaje = total > 0 ? Math.round((progreso.completados / total) * 100) : 0;
  return (
    <Tooltip title={`${progreso.completados} completados\n${progreso.arribados} en curso\n${progreso.pendientes} pendientes`}>
      <Progress
        percent={porcentaje}
        format={() => `${progreso.completados} / ${total}`}
        strokeColor={porcentaje >= 100 ? COLOR_PROGRESO_COMPLETO : COLOR_PROGRESO_EN_CURSO}
        size="small"
        style={{ minWidth: 120 }}
      />
    </Tooltip>
  );
}

const ETIQUETAS_VIAJE_ESTADO = {
  detenido: "Detenido",
  manejando: "Manejando",
  descargando: "Descargando",
};

// 009-central-mejora-visual (US3): color por estado de viaje, para que la
// etiqueta siga siendo distinguible de un vistazo con el nuevo estilo.
const COLOR_VIAJE_ESTADO = {
  detenido: "default",
  manejando: "blue",
  descargando: "gold",
};

// Estado de viaje del chofer (005-chofer-estados-viaje, FR-021), visible en
// (casi) tiempo real vía el mismo polling que ya trae `progreso`/`ultimaUbicacion`.
// 009-central-mejora-visual: ya no incluye el id del punto activo — ese dato
// pasa a su propia columna "Punto" (con el nombre de cliente).
function textoViajeEstado(r) {
  // esperandoFinalizar (008-registro-inicio-fin-recorrido, research.md
  // Decisión 5): todos los puntos completado pero el chofer todavía no tocó
  // FINALIZAR — distinto de cualquier otro "Detenido" intermedio entre puntos.
  if (r.esperandoFinalizar) return "Regresando";
  return ETIQUETAS_VIAJE_ESTADO[r.viajeEstado] ?? "—";
}

function colorViajeEstado(r) {
  if (r.esperandoFinalizar) return "purple";
  return COLOR_VIAJE_ESTADO[r.viajeEstado] ?? "default";
}

// 009-central-mejora-visual: el punto activo se muestra por el nombre de su
// cliente (más útil para el operador que un id interno como "p3"); si el
// backend todavía no tiene el cliente de ese punto, cae a "Punto {orden}"
// en vez de dejar la celda vacía.
function textoPunto(r) {
  if (!r.puntoActivo) return "—";
  return r.puntoActivo.cliente || `Punto ${r.puntoActivo.orden ?? r.puntoActivo.id}`;
}

// 009-central-mejora-visual: "Última ubicación" y "Actualizado" se unifican
// en una sola columna — un punto de color por estado (reciente/no
// reciente/sin datos) más los minutos transcurridos desde la última lectura
// de ubicación (no la hora absoluta ni el updatedAt del recorrido, que es la
// fecha de asignación, no una lectura de GPS).
function IndicadorUbicacion({ ultimaUbicacion }) {
  if (!ultimaUbicacion || ultimaUbicacion.en == null) {
    return (
      <Tooltip title="Sin ubicación reportada">
        <Badge status="default" text="—" />
      </Tooltip>
    );
  }
  const minutos = minutosTranscurridos(ultimaUbicacion.en);
  const status = ultimaUbicacion.reciente ? "success" : "warning";
  const etiqueta = ultimaUbicacion.reciente ? "Ubicación reciente" : "Ubicación no reciente";
  const texto = minutos < 1 ? "<1 min" : `${minutos} min`;
  return (
    <Tooltip title={`${etiqueta} — hace ${texto}`}>
      <Badge status={status} text={texto} />
    </Tooltip>
  );
}

const COLUMNAS = (onSeleccionar) => [
  { title: "Viaje ID", dataIndex: "id", key: "id" },
  { title: "Flete", key: "flete", render: (_, r) => r.flete?.nombre ?? "—" },
  { title: "Chofer", key: "chofer", render: (_, r) => r.chofer?.nombre ?? "—" },
  {
    title: "Progreso",
    key: "progreso",
    render: (_, r) => <BarraProgreso progreso={r.progreso} />,
  },
  {
    title: "Estado",
    key: "viajeEstado",
    render: (_, r) => <Tag color={colorViajeEstado(r)}>{textoViajeEstado(r)}</Tag>,
  },
  { title: "Próximo Cliente", key: "punto", render: (_, r) => textoPunto(r) },
  { title: "Ubicación", key: "ubicacion", render: (_, r) => <IndicadorUbicacion ultimaUbicacion={r.ultimaUbicacion} /> },
  ...(onSeleccionar
    ? [
        {
          title: "",
          key: "acciones",
          render: (_, r) => (
            <Button type="link" onClick={() => onSeleccionar(r.id)}>
              Ver detalle
            </Button>
          ),
        },
      ]
    : []),
];

/**
 * Vista de monitoreo en vivo (Historia 1, FR-001, FR-002): un renglón por
 * recorrido activo, con su flete, chofer, progreso, estado de viaje, punto
 * que está trabajando y última ubicación conocida.
 */
export function MonitorView({ recorridos, onSeleccionar }) {
  if (!recorridos || recorridos.length === 0) {
    return (
      <div role="status">
        <Empty description="No hay recorridos activos en este momento." />
      </div>
    );
  }

  return (
    <Table
      className="monitor-view"
      rowKey="id"
      pagination={false}
      columns={COLUMNAS(onSeleccionar)}
      dataSource={recorridos}
      // 009-central-mejora-visual: en un contenedor angosto (iframe embebido
      // en APEX, Principio III), la tabla scrollea horizontalmente dentro de
      // sí misma en vez de desbordar toda la página y arrastrar la
      // navegación lateral fuera de vista.
      scroll={{ x: "max-content" }}
      // 009-central-mejora-visual (US3): la distinción de ubicación
      // reciente/no reciente se mantiene vía rowClassName (ver styles.css),
      // preservando los mismos data-attributes que ya usaban los tests.
      rowClassName={(r) => (r.ultimaUbicacion?.reciente === false ? "monitor-view__fila--no-reciente" : "")}
      onRow={(r) => ({
        "data-ubicacion-reciente": r.ultimaUbicacion?.reciente ?? false,
        "data-viaje-estado": r.viajeEstado ?? "detenido",
      })}
    />
  );
}
