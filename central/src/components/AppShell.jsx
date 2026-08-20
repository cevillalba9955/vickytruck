import { Layout, Badge, Button, Tooltip } from "antd";
import { UnorderedListOutlined, HistoryOutlined } from "@ant-design/icons";

const { Header, Content } = Layout;

// Shell de navegación de Central. Monitoreo y Mapa se unificaron en una
// sola sección (011-unificar-monitoreo-mapa): con solo 2 secciones restantes
// (Monitoreo+Mapa, Historial) el menú lateral dejaba de aportar valor frente
// al espacio vertical que le restaba al contenido — se reemplaza por un
// único botón en la barra superior que alterna entre ambas, maximizando el
// área disponible para la grilla y el mapa.
const SECCION_ALTERNA = {
  monitor: { destino: "historial", icon: <HistoryOutlined />, label: "Ver Historial" },
  historial: { destino: "monitor", icon: <UnorderedListOutlined />, label: "Ver Monitoreo" },
};

// Indicador del canal MQTT en el header (solo ícono, sin texto visible): un
// punto de color que refleja el estado, con el texto disponible en el
// tooltip y para lectores de pantalla (aria-live).
const ESTADO_MQTT_BADGE = {
  connected: { status: "success", label: "Canal tiempo real MQTT: conectado" },
  reconnecting: { status: "processing", label: "Canal tiempo real MQTT: reconectando" },
  disconnected: { status: "error", label: "Canal tiempo real MQTT: desconectado" },
  error: { status: "error", label: "Canal tiempo real MQTT: error" },
  payload_error: { status: "warning", label: "Canal tiempo real MQTT: error de datos" },
};

export function AppShell({ seccion, onCambiarSeccion, mqttEstado, children }) {
  const badge =
    mqttEstado && mqttEstado !== "disabled"
      ? (ESTADO_MQTT_BADGE[mqttEstado] ?? { status: "default", label: `Canal tiempo real MQTT: ${mqttEstado}` })
      : null;
  const alterna = SECCION_ALTERNA[seccion] ?? SECCION_ALTERNA.monitor;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>Central — Panel de control</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {badge && (
            <Tooltip title={badge.label}>
              <span>
                <span className="sr-only" role="status">
                  {badge.label}
                </span>
                <Badge status={badge.status} />
              </span>
            </Tooltip>
          )}
          <Button ghost icon={alterna.icon} onClick={() => onCambiarSeccion(alterna.destino)}>
            {alterna.label}
          </Button>
        </div>
      </Header>
      <Layout style={{ padding: "16px 24px", minWidth: 0 }}>
        <Content
          style={{
            background: "#fff",
            padding: 16,
            border: "1px solid #d9dee3",
            // 009-central-mejora-visual: contenido ancho (tablas) scrollea
            // dentro del Content en vez de desbordar la página y arrastrar
            // el header fuera de vista (iframe angosto, Principio III).
            overflowX: "auto",
            minWidth: 0,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
