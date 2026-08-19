import { useEffect, useState } from "react";
import { Table, Button, Empty, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { listarHistorial } from "../services/api.js";
import { RecorridoDetalle } from "./RecorridoDetalle.jsx";
import { formatearFechaLocal, formatearHoraLocal, formatearDuracionMin, calcularTiempoTotalMin } from "../services/tiempo.js";

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
      <RecorridoDetalle
        detalle={seleccionado}
        accionVolver={
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setSeleccionado(null)}>
            Volver al historial
          </Button>
        }
      />
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
      // flete/chofer (009-central-mejora-visual): se llevan al detalle para
      // que su encabezado no tenga que volver a pedirlos.
      recorrido: { id: h.id, estado: "finalizado", fleteId: h.fleteId, flete: h.flete, chofer: h.chofer, cierreEn: h.cierreEn },
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
