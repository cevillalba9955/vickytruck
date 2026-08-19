import { Layout, Menu, Badge, Tooltip } from "antd";
import { UnorderedListOutlined, EnvironmentOutlined, HistoryOutlined } from "@ant-design/icons";

const { Header, Sider, Content } = Layout;

// Shell de navegación de Central (009-central-mejora-visual, FR-001), estilo
// Oracle APEX (Universal Theme, "Side Navigation Menu"): header superior +
// navegación lateral con las secciones existentes, igual al patrón ya usado
// en rs956/frontend/src/components/AppShell.jsx. No conoce datos de
// recorridos ni lógica de negocio: recibe la sección activa y el callback de
// cambio desde main.jsx.
const SECCIONES = [
  { key: "monitor", icon: <UnorderedListOutlined />, label: "Monitoreo" },
  { key: "mapa", icon: <EnvironmentOutlined />, label: "Mapa" },
  { key: "historial", icon: <HistoryOutlined />, label: "Historial" },
];

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

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>Central — Panel de control</span>
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
      </Header>
      <Layout>
        <Sider width={220} style={{ borderRight: "1px solid #d9dee3" }}>
          <Menu
            mode="inline"
            selectedKeys={[seccion]}
            items={SECCIONES}
            onClick={({ key }) => onCambiarSeccion(key)}
            style={{ height: "100%", borderInlineEnd: "none" }}
          />
        </Sider>
        <Layout style={{ padding: "16px 24px", minWidth: 0 }}>
          <Content
            style={{
              background: "#fff",
              padding: 16,
              border: "1px solid #d9dee3",
              // 009-central-mejora-visual: contenido ancho (tablas) scrollea
              // dentro del Content en vez de desbordar la página y arrastrar
              // el header/sidebar fuera de vista (iframe angosto, Principio III).
              overflowX: "auto",
              minWidth: 0,
            }}
          >
            {children}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
}
