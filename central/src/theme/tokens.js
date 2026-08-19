// Paleta y tipografía alineadas con la identidad visual ya usada en
// rs956/frontend (Ant Design + tema propio inspirado en Oracle APEX
// Universal Theme): header/navegación azul marino oscuro, bordes rectos y
// tablas con líneas grises definidas (009-central-mejora-visual, FR-004).
// No se usa `theme.compactAlgorithm`: deriva los tamaños de fuente de una
// escala reducida fija, así que ignora cualquier `fontSize` mayor que se
// configure acá (mismo motivo documentado en rs956/frontend/src/theme/tokens.js).
export const themeConfig = {
  token: {
    colorPrimary: '#2c5f8a',
    colorInfo: '#2c5f8a',
    colorLink: '#2c5f8a',
    colorBgLayout: '#f2f4f6',
    colorBorderSecondary: '#d9dee3',
    borderRadius: 2,
    fontSize: 16,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Layout: {
      headerBg: '#1a3b5d',
      headerColor: '#ffffff',
      siderBg: '#ffffff',
      bodyBg: '#f2f4f6',
    },
    Menu: {
      itemSelectedBg: '#e6eef5',
      itemSelectedColor: '#1a3b5d',
      itemHeight: 36,
    },
    Table: {
      headerBg: '#eef1f4',
      headerColor: '#333333',
      borderColor: '#d9dee3',
      cellPaddingBlockSM: 6,
    },
    Card: {
      headerBg: '#eef1f4',
    },
  },
};
