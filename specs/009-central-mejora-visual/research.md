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

---

## Decisiones post-implementación (Historias 4-6, 2026-08-19)

Tras cerrar el MVP (Decisiones 1-5, PR #17), el usuario pidió una serie de
refinamientos concretos en la misma conversación. Se documentan acá porque
varios requirieron ampliar el alcance original de "cero cambios de datos"
(ver spec.md, nota de alcance y FR-006 ampliado).

## Decisión 6 — Indicador de MQTT: ícono de color en el header, no texto en el contenido

**Decisión**: el aviso "Canal tiempo real MQTT: {estado}" pasa de un
`Alert` de antd en el contenido a un `Badge` tipo "status dot" en el header
de `AppShell` (a la derecha del título), color-codeado por estado
(`success`/`processing`/`error`/`warning`), con el texto disponible en un
`Tooltip` y en un `<span className="sr-only" role="status">` para lectores
de pantalla.

**Rationale**: pedido explícito del usuario ("solo el icono... sin texto").
Mantener el texto accesible (tooltip + sr-only) evita perder la información
para quien no puede ver el color, sin ocupar espacio en el contenido.

**Alternativas consideradas**: dejar el `Alert` pero más chico — se
descartó porque seguía ocupando una fila completa del contenido, que es
justo lo que el pedido buscaba evitar.

## Decisión 7 — Progreso como barra Completados/Total

**Decisión**: la columna "Progreso" de Monitoreo pasa de texto
("X completados / Y en curso / Z pendientes") a `Progress` de antd con
`format` custom mostrando "Completados / Total", `strokeColor` verde al
100% y azul primario mientras está en curso; el desglose completo queda en
un `Tooltip`.

**Rationale**: pedido explícito del usuario ("barra porcentual... hacela
linda"). Verde/azul reutiliza colores ya establecidos en el resto de la app
(verde = "completado"/"reciente", azul primario = tema).

**Alternativas consideradas**: ninguna relevante — el pedido especificaba
el formato exacto.

## Decisión 8 — Exponer chofer y cliente por punto a Central

**Decisión**: `GET /api/central/recorridos/activos` expone `chofer:
{id, nombre}|null` (además del `flete` ya existente) y `puntoActivo:
{id, orden, cliente}|null` — datos que `integracionStore.js` ya trackeaba
(`choferId`/`choferNombre` desde la feature 005; `cliente` por punto desde
la feature 005/Oracle) pero no servía a Central. Cambio aditivo en
`backend/src/state/integracionStore.js`, sin tocar el contrato de push de
Oracle/APEX.

**Rationale**: Monitoreo necesitaba mostrar "quién maneja" (distinto del
flete) y "a qué cliente" corresponde el punto activo (Historia 4); ese dato
ya existía en memoria, solo faltaba serializarlo.

**Alternativas consideradas**: pedirle a Oracle un nuevo campo — descartado,
el dato ya estaba disponible en el backend cloud sin tocar Oracle.

## Decisión 9 — Historial expone flete/chofer con nombre; tiempo total se calcula en el frontend

**Decisión**: `GET /api/central/recorridos/historial` agrega `flete:
{id, nombre}` y `chofer: {id, nombre}|null` al objeto de cada recorrido
(antes solo `fleteId` crudo). El "tiempo total" (Historia 5) se calcula
100% en el frontend, sin tocar el backend: desde el `inicioEn` más
temprano entre los puntos (fallback a `arriboEn` si falta) hasta el
`cierreEn` del recorrido — mismo dato que ya viajaba en `puntos[]`.

**Rationale**: igual que Decisión 8, el nombre ya estaba en memoria. El
cálculo de tiempo total no requiere nuevo dato del backend porque
`inicioEn`/`cierreEn` ya se exponían desde la feature 008; centralizarlo en
`central/src/services/tiempo.js` (`primerEventoIso`,
`calcularTiempoTotalMin`) evita otro roundtrip y se reutiliza también en
RecorridoDetalle (Decisión 10).

**Alternativas consideradas**: calcular el tiempo total en el backend y
exponerlo ya formateado — descartado por innecesario (Principio VII): el
dato fuente ya viaja, no hace falta duplicar el cálculo ni el mantenimiento
en dos lenguajes.

## Decisión 10 — Grilla de puntos con verificación de proximidad GPS (radio de 500 m)

**Decisión**: `RecorridoDetalle` reemplaza la lista de texto por una
`Table` de antd (Cliente, Estado, Hora de llegada, Hora de descarga). Cada
hora se acompaña de un `Badge` de color: verde si la distancia Haversine
entre la posición GPS capturada al marcar (`arriboLat/arriboLon` o
`descargaLat/descargaLon`) y el destino del punto (`lat`/`lon`) es ≤ 500 m,
rojo si es mayor, sin color si no hay GPS para ese evento. Requirió exponer
`arriboLat/arriboLon/descargaLat/descargaLon` y `cliente` por punto en
`serializarPuntosCentral` (antes explícitamente excluidos, ver comentario
histórico en `integracionStore.js`) — `inicioLat/inicioLon/cierreLat/cierreLon`
se mantienen fuera de alcance (contrato verificado por
`backend/tests/contract/get-recorrido-detalle.test.js`).

El cálculo de distancia (`distanciaMetros`, fórmula de Haversine) se agrega
a `central/src/services/marcadores.js` (utilidad geográfica pura, mismo
archivo que ya tenía lógica de coordenadas).

**Rationale**: pedido explícito del usuario. El radio de 500 m es una señal
visual de revisión manual, no una regla de negocio — el sistema nunca tuvo
geocerca (specs/008-registro-inicio-fin-recorrido/spec.md lo aclara
explícitamente), así que no se bloquea ninguna acción del chofer ni se
agrega validación server-side.

**Alternativas consideradas**: bloquear o advertir al chofer en el momento
de marcar si está lejos del punto — fuera de alcance (cambiaría la app del
Chofer, Principio I, y agregaría una regla de negocio no pedida); acá es
puramente informativo para Central.

## Decisión 11 — RecorridoDetalle se refresca con el mismo polling que Monitoreo

**Decisión**: el `useEffect` de polling en `central/src/main.jsx` que ya
refrescaba `activos` ahora también refresca `detalle` (vía
`Promise.all`) cuando la vista de Detalle está abierta y proviene de
Monitoreo/Mapa (no de Historial, que muestra recorridos ya finalizados sin
razón para refrescarse). Se usa `detalle?.recorrido?.id` como dependencia
del efecto (no el objeto `detalle` completo) para no reiniciar el intervalo
en cada tick.

**Rationale**: gap detectado por el usuario — antes `detalle` se cargaba
una sola vez al abrir "Ver detalle" y quedaba congelado, mientras que
`activos` sí se actualizaba en vivo. Reusar el mismo `pollEvery` (en vez de
un segundo intervalo independiente) mantiene una sola fuente de cadencia
(Principio V).

**Alternativas consideradas**: un `useEffect`/intervalo separado solo para
`detalle` — descartado por duplicar la lógica de cadencia dinámica
(MQTT conectado vs. respaldo) que ya existe para `activos`.

## Decisión 12 — Botón "Volver" como `extra` del Card, no en fila propia

**Decisión**: `RecorridoDetalle` recibe un prop `accionVolver` (nodo React)
que se pasa al `extra` del `Card` de antd, quedando a la derecha del título
"Recorrido {id}". `main.jsx` y `HistorialView.jsx` arman ahí su propio
botón ("Volver al monitoreo"/"Volver al historial" respectivamente) en vez
de renderizarlo en una fila separada arriba del `Card`.

**Rationale**: pedido explícito del usuario ("maximizar el área de
visión"). `accionVolver` como prop opcional mantiene `RecorridoDetalle`
desacoplado de quién lo abre (Monitoreo vs. Historial tienen textos/
handlers de vuelta distintos).

**Alternativas consideradas**: ícono solo (sin texto) para ahorrar más
espacio horizontal — no se aplicó porque el pedido especificaba "botón con
icono", no ícono solo; se interpretó como mantener el texto.
