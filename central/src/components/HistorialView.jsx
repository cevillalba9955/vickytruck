import { useEffect, useState } from "react";
import { Table, Button, Empty, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { listarHistorial } from "../services/api.js";
import { RecorridoDetalle } from "./RecorridoDetalle.jsx";
import { formatearFechaLocal, formatearHoraLocal, formatearDuracionMin } from "../services/tiempo.js";

// Duración total del recorrido (009-central-mejora-visual): desde el primer
// evento registrado (inicioEn del primer punto trabajado; si ese dato no
// está, cae al primer arriboEn) hasta el cierre explícito del recorrido
// (FINALIZAR) — mismo criterio de "primer evento disponible" que ya usa
// RecorridoDetalle.jsx para el tiempo de regreso a base.
function calcularTiempoTotalMin(puntos, cierreEn) {
  if (!cierreEn) return null;
  const inicios = puntos.map((p) => p.inicioEn).filter(Boolean);
  const eventos = inicios.length > 0 ? inicios : puntos.map((p) => p.arriboEn).filter(Boolean);
  if (eventos.length === 0) return null;
  const primerEventoMs = Math.min(...eventos.map((e) => new Date(e).getTime()));
  const diffMs = new Date(cierreEn).getTime() - primerEventoMs;
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round(diffMs / 60000);
}

const COLUMNAS = (onVerLineaDeTiempo) => [
  { title: "Recorrido", dataIndex: "id", key: "id" },
  {
    title: "Fecha",
    key: "fecha",
    render: (_, h) =>
      h.cierreEn ? (
        <>
          {formatearFechaLocal(h.cierreEn)}
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatearHoraLocal(h.cierreEn)}
          </Typography.Text>
        </>
      ) : (
        "—"
      ),
  },
  { title: "Flete", key: "flete", render: (_, h) => h.flete?.nombre ?? "—" },
  { title: "Chofer", key: "chofer", render: (_, h) => h.chofer?.nombre ?? "—" },
  { title: "Cantidad de clientes", key: "clientes", render: (_, h) => h.puntos.length },
  {
    title: "Tiempo total",
    key: "tiempoTotal",
    render: (_, h) => formatearDuracionMin(calcularTiempoTotalMin(h.puntos, h.cierreEn)),
  },
  {
    title: "",
    key: "acciones",
    render: (_, h) => (
      <Button type="link" onClick={() => onVerLineaDeTiempo(h)}>
        Ver línea de tiempo
      </Button>
    ),
  },
];

/**
 * Historial de recorridos finalizados (Historia 5, FR-010): fecha de
 * cierre, flete, chofer, cantidad de clientes visitados y tiempo total del
 * recorrido (009-central-mejora-visual).
 */
export function HistorialView() {
  const [historial, setHistorial] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    listarHistorial().then(setHistorial);
  }, []);

  if (seleccionado) {
    return (
      <div className="historial-view">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setSeleccionado(null)}>
          Volver al historial
        </Button>
        <RecorridoDetalle detalle={seleccionado} />
      </div>
    );
  }

  if (historial.length === 0) {
    return (
      <div role="status">
        <Empty description="Todavía no hay recorridos finalizados." />
      </div>
    );
  }

  const abrirLineaDeTiempo = (h) =>
    setSeleccionado({
      // cierreEn (008-registro-inicio-fin-recorrido): viene del mapeo de
      // GET /api/central/recorridos/historial en backend/src/routes/central.js.
      recorrido: { id: h.id, estado: "finalizado", fleteId: h.fleteId, cierreEn: h.cierreEn },
      puntos: h.puntos,
    });

  return (
    <Table
      className="historial-view"
      rowKey="id"
      pagination={false}
      columns={COLUMNAS(abrirLineaDeTiempo)}
      dataSource={historial}
      // 009-central-mejora-visual: mismo contenimiento de scroll horizontal
      // que MonitorView, para no romper la navegación en un iframe angosto.
      scroll={{ x: "max-content" }}
    />
  );
}
