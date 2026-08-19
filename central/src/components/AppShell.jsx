import { Layout, Menu } from "antd";
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

export function AppShell({ seccion, onCambiarSeccion, children }) {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center" }}>
        <span style={{ color: "#fff", fontSize: 18, fontWeight: 600 }}>Central — Panel de control</span>
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
