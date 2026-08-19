import { useEffect, useState } from "react";
import { Table, Button, Empty } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { listarHistorial } from "../services/api.js";
import { RecorridoDetalle } from "./RecorridoDetalle.jsx";

const COLUMNAS = (onVerLineaDeTiempo) => [
  { title: "Recorrido", dataIndex: "id", key: "id" },
  { title: "Flete", dataIndex: "fleteId", key: "fleteId" },
  { title: "Puntos", key: "puntos", render: (_, h) => h.puntos.length },
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

/** Historial de recorridos finalizados (Historia 5, FR-010). */
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
