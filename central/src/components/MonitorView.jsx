import { Table, Button, Empty, Tag } from "antd";
import { formatearHoraLocal } from "../services/tiempo.js";

// 006-normalizar-formato-horario, US2: se agrega la hora HH24:MM:SS local
// del último reporte, además del texto reciente/no reciente que ya existía.
function formatearUbicacion(ultimaUbicacion) {
  if (!ultimaUbicacion || ultimaUbicacion.en == null) return "Sin ubicación reportada";
  const estado = ultimaUbicacion.reciente ? "Ubicación reciente" : "Ubicación no reciente";
  return `${estado} (${formatearHoraLocal(ultimaUbicacion.en)})`;
}

function formatearActualizado(updatedAt) {
  return updatedAt ? formatearHoraLocal(updatedAt) : "—";
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
function textoViajeEstado(r) {
  // esperandoFinalizar (008-registro-inicio-fin-recorrido, research.md
  // Decisión 5): todos los puntos completado pero el chofer todavía no tocó
  // FINALIZAR — distinto de cualquier otro "Detenido" intermedio entre puntos.
  if (r.esperandoFinalizar) return "Regresando a base";
  const etiqueta = ETIQUETAS_VIAJE_ESTADO[r.viajeEstado] ?? "—";
  if (r.puntoActivoId == null) return etiqueta;
  return `${etiqueta} (punto ${r.puntoActivoId})`;
}

function colorViajeEstado(r) {
  if (r.esperandoFinalizar) return "purple";
  return COLOR_VIAJE_ESTADO[r.viajeEstado] ?? "default";
}

const COLUMNAS = (onSeleccionar) => [
  { title: "Recorrido", dataIndex: "id", key: "id" },
  { title: "Flete", key: "flete", render: (_, r) => r.flete?.nombre ?? "—" },
  {
    title: "Progreso",
    key: "progreso",
    render: (_, r) => `${r.progreso.completados} completados / ${r.progreso.arribados} en curso / ${r.progreso.pendientes} pendientes`,
  },
  {
    title: "Estado de viaje",
    key: "viajeEstado",
    render: (_, r) => <Tag color={colorViajeEstado(r)}>{textoViajeEstado(r)}</Tag>,
  },
  { title: "Última ubicación", key: "ultimaUbicacion", render: (_, r) => formatearUbicacion(r.ultimaUbicacion) },
  { title: "Actualizado", key: "actualizado", render: (_, r) => formatearActualizado(r.updatedAt) },
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
 * recorrido activo, con su flete, progreso, estado de viaje y última
 * ubicación conocida.
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
