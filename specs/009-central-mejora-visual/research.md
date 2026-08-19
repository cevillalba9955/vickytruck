# Research: Rediseño visual de Central

## Decisión 1 — Adoptar Ant Design (`antd` v6) en vez de CSS artesanal

**Decisión**: agregar `antd` y `@ant-design/icons` a `central/package.json`
(mismas majors que `rs956/frontend/package.json`: `antd ^6.x`,
`@ant-design/icons ^6.x`), y construir el rediseño sobre sus componentes
(`Layout`, `Sider`, `Menu`, `Table`, `Card`, `Descriptions`, `Alert`,
`Typography`).

**Rationale**: el spec (FR-001 a FR-004) pide replicar la identidad visual de
`rs956/frontend`, que ya está construida sobre `antd` con un `themeConfig`
propio (`rs956/frontend/src/theme/tokens.js`). Reutilizar la misma librería y
el mismo patrón de theming es la forma más simple de lograr paridad visual
real (no solo "parecido"), y evita reinventar en CSS puro comportamientos que
`antd` ya resuelve de forma accesible (navegación por teclado del `Menu`,
`aria-selected`, orden de tablas). Ver Complexity Tracking en `plan.md` para
la justificación frente al Principio VII de la constitución.

**Alternativas consideradas**:
- **CSS artesanal replicando los mismos tokens de color/tipografía**: se
  descartó porque implica reconstruir a mano `Layout`/`Menu`/`Table` con
  paridad de accesibilidad y estados (hover, selected, focus), lo que en la
  práctica es más código propio a mantener que la dependencia, con riesgo de
  divergencia visual futura respecto de `rs956/frontend`.
- **Otra librería de componentes (Material UI, Chakra, etc.)**: se descartó
  porque no reproduce el aspecto específico que pide el spec (estilo Oracle
  APEX Universal Theme que ya logró `rs956/frontend` con `antd`); usar una
  librería distinta obligaría a re-derivar esa identidad visual desde cero.

## Decisión 2 — Theme config propio de Central, espejado del de `rs956/frontend`

**Decisión**: crear `central/src/theme/tokens.js` con un `themeConfig` de
`antd` (`ConfigProvider`) que reutiliza los mismos valores de paleta que
`rs956/frontend/src/theme/tokens.js` (`colorPrimary: '#2c5f8a'`,
`headerBg: '#1a3b5d'`, `colorBgLayout: '#f2f4f6'`, `borderRadius: 2`,
tipografía `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`), sin
copiar literalmente el archivo (Central no tiene rol/menú de RS956; solo
copia la paleta/tipografía/bordes, no el dominio).

**Rationale**: es el mecanismo real por el que `rs956/frontend` logra su
apariencia "Oracle APEX Universal Theme"; duplicar los mismos valores de
token es lo que garantiza que Central se vea consistente con ese sistema, en
línea con SC-004 del spec. No se reutiliza `compactAlgorithm` por la misma
razón documentada en el archivo original: deriva tamaños de fuente de una
escala reducida fija que ignora un `fontSize` mayor configurado.

**Alternativas consideradas**: definir una paleta "inspirada pero distinta"
— se descartó porque el spec pide explícitamente consistencia visual con la
referencia (FR-004, SC-004), no una interpretación libre.

## Decisión 3 — Navegación: `Layout` + `Sider` + `Menu` reemplaza `<nav className="app__nav">`

**Decisión**: nuevo componente `central/src/components/AppShell.jsx`
(análogo a `rs956/frontend/src/components/AppShell.jsx`) con `Layout`/`Sider`
(ancho fijo) + `Menu` en modo `inline`, con las 3 secciones existentes
(Monitoreo, Mapa, Historial) como `items`, y `selectedKeys` marcando la
sección activa. `main.jsx` pasa a renderizar `<AppShell seccion={vista}
onCambiarSeccion={setVista}>{...}</AppShell>` en vez del `<nav>` manual.

**Rationale**: satisface US1/US2 (navegación con sección activa evidente) y
es el mismo patrón ya validado en la referencia. El contenido de Detalle
(hoy una vista separada superpuesta) se mantiene como contenido dentro del
`Content` del `AppShell`, con la acción "← Volver" ya existente.

**Alternativas consideradas**: mantener los botones actuales pero
estilizados a mano con `aria-pressed` — se descartó por ser menos evidente
visualmente que un `Menu` lateral con ítem resaltado, y por no acercarse al
patrón de navegación de la referencia (que sí es lateral).

## Decisión 4 — Preservar contratos de accesibilidad/testing existentes

**Decisión**: al migrar `MonitorView`/`HistorialView` de `<table>` artesanal
a `<Table>` de `antd`, y los mensajes de estado vacío/error de `<p
role="status">`/`<p role="alert">` a componentes de `antd` (`Alert`,
`Typography.Text`), se preservan explícitamente los roles ARIA
(`role="status"`, `role="alert"`) y el texto exacto que ya verifican los
tests (`central/tests/components/MonitorView.test.jsx`,
`RecorridoDetalle.test.jsx`) — usando la prop `role`/`aria-live` de `antd`
donde aplique, o un wrapper explícito cuando el componente de `antd` no
exponga el rol necesario.

**Rationale**: FR-006 exige cero cambio de comportamiento; los tests
existentes son la guardia concreta de esa no-regresión. `antd`'s `Table`
renderiza `<table>`/`<tr>` semánticos por debajo, así que
`screen.getByText(...).closest("tr")` sigue funcionando sin cambios en los
tests existentes — se confirma leyendo la salida DOM de `antd Table` (usa
`<table><tbody><tr data-row-key=...>`).

**Alternativas consideradas**: reescribir los tests para adaptarse a la
estructura interna de `antd` — se descartó como riesgo innecesario; se
prefiere que el restyle preserve el contrato observable (texto, roles,
estructura `tr`) en vez de forzar cambios de tests no relacionados con
comportamiento.

## Decisión 5 — Detalle de recorrido: `Card` + `Descriptions` + lista de línea de tiempo

**Decisión**: `RecorridoDetalle` pasa de `<section className="detalle-view">`
con texto suelto a un `Card` de `antd` con `Descriptions` para
estado/flete/cierre, y la lista de puntos (`<ol>`) se mantiene semánticamente
como lista pero con estilos de `antd` (`List` o CSS residual equivalente al
`.detalle-view__lista` actual), sin cambiar los datos que expone
(`p.orden`, `p.estado`, `p.inicioEn`, `p.arriboEn`, `p.descargaEn`).

**Rationale**: cumple FR-003 (panel con jerarquía visual clara) preservando
el mapa embebido (`MapaSeguimiento`, sin cambios de lógica) y el texto que
verifican los tests (`Arribo: 10:35:20`, `Cierre:` + `regreso a base: 15
min`, etc.).

**Alternativas consideradas**: mantener el layout de texto plano y solo
aplicar CSS — se descartó porque no resuelve la falta de jerarquía visual
que señala US1 (Acceptance Scenario 3).
