# Feature Specification: Rediseño visual de Central

**Feature Branch**: `009-central-mejora-visual`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "iu-central, mejorar la interfaz grafica, copiar estilos de C:\AI\rs956\frontend"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Panel con jerarquía visual clara (Priority: P1)

Como operador de Central, al abrir el panel veo una navegación lateral clara y
un área de contenido con jerarquía visual definida (encabezados, tablas con
estilo consistente, espaciado uniforme), de manera que puedo ubicar
rápidamente la información de cada recorrido activo sin esfuerzo adicional de
lectura, igual que en las demás herramientas internas de escritorio de la
organización.

**Why this priority**: es el cambio que más impacta la percepción diaria del
operador — Central se usa durante toda la jornada operativa, y una interfaz
poco estructurada aumenta el tiempo para encontrar información y la
probabilidad de pasar por alto un recorrido que necesita atención.

**Independent Test**: puede probarse abriendo cada vista existente
(Monitoreo, Mapa, Historial, Detalle) y verificando que presentan
navegación, encabezados y tablas con un estilo visual consistente entre sí,
sin que cambie ningún dato mostrado.

**Acceptance Scenarios**:

1. **Given** el operador abre Central, **When** carga el panel, **Then** ve
   una navegación con las secciones disponibles (Monitoreo, Mapa, Historial)
   y la sección activa está visualmente distinguida del resto.
2. **Given** el operador está en la vista de Monitoreo, **When** observa la
   tabla de recorridos activos, **Then** las filas y columnas tienen
   separación y estilo consistentes (encabezados diferenciados, bordes,
   espaciado), sin cambios en los datos que ya se mostraban.
3. **Given** el operador abre el Detalle de un recorrido, **When** la vista
   se renderiza, **Then** la información (estado, cierre, línea de tiempo de
   puntos, mapa) se presenta dentro de un panel con jerarquía visual clara en
   vez de texto plano sin estructura.

---

### User Story 2 - Navegación entre vistas sin perder contexto (Priority: P2)

Como operador, cuando cambio entre Monitoreo, Mapa, Historial y el Detalle de
un recorrido, quiero que quede claro en qué sección estoy y cómo volver a la
anterior, para no perder contexto durante el seguimiento de una operación en
curso.

**Why this priority**: la navegación actual (botones simples en fila) ya
funciona pero no comunica visualmente en qué parte de la aplicación está el
operador; mejorarla reduce errores de navegación sin ser tan crítico como la
legibilidad general de P1.

**Independent Test**: puede probarse navegando entre las cuatro vistas
(incluyendo entrar y salir de un Detalle desde Monitoreo y desde Historial) y
verificando que la sección activa se indica visualmente en todo momento y que
existe una acción clara para volver a la vista anterior.

**Acceptance Scenarios**:

1. **Given** el operador hace clic en "Historial", **When** la vista cambia,
   **Then** el indicador de navegación muestra "Historial" como sección
   activa.
2. **Given** el operador abre el Detalle de un recorrido desde Monitoreo,
   **When** quiere volver, **Then** encuentra una acción de retorno
   visualmente clara que lo regresa a Monitoreo conservando el estado de la
   navegación.

---

### User Story 3 - Estados e indicadores siguen siendo distinguibles (Priority: P3)

Como operador, quiero seguir distinguiendo de un vistazo los recorridos con
ubicación no reciente, el estado de viaje (Detenido / Manejando /
Descargando / Regresando a base) y el estado del canal MQTT, ahora con un
estilo visual prolijo, para no perder la señal operativa que ya me daba la
versión actual al mismo tiempo que mejora la estética.

**Why this priority**: es una condición de no-regresión sobre una capacidad
que ya existe (Historia 1 de la feature 002 y feature 005/008); tiene menor
prioridad que P1/P2 porque no agrega valor nuevo, solo preserva el existente
bajo el nuevo estilo visual.

**Independent Test**: puede probarse comparando, antes y después del
rediseño, que un recorrido con ubicación no reciente y uno en estado
"Regresando a base" siguen siendo identificables visualmente en la tabla de
Monitoreo.

**Acceptance Scenarios**:

1. **Given** un recorrido activo cuya última ubicación no es reciente,
   **When** el operador ve la tabla de Monitoreo, **Then** esa fila sigue
   siendo visualmente distinguible de las filas con ubicación reciente.
2. **Given** el canal MQTT está desconectado o degradado, **When** el
   operador mira el panel, **Then** el aviso de estado del canal sigue
   siendo visible con el nuevo estilo.

---

### Edge Cases

- ¿Qué pasa cuando no hay recorridos activos? El estado vacío existente
  ("No hay recorridos activos en este momento") debe mantenerse, ahora
  presentado con el mismo lenguaje visual que el resto del panel en vez de
  texto suelto.
- ¿Qué pasa cuando Central está embebida en un iframe angosto dentro de
  Oracle APEX? El diseño debe degradarse con scroll dentro del contenido en
  vez de romper la navegación o superponer elementos.
- ¿Qué pasa si el operador reduce el ancho de la ventana (acceso directo, no
  embebido)? El panel puede recortar o apilar contenido, pero no debe volverse
  inutilizable ni perder la navegación (Central sigue sin ser mobile-first).
- ¿Qué pasa con recorridos en estados especiales ya existentes (p. ej.
  "Regresando a base" de la feature 008)? Deben conservar una señal visual
  equivalente o mejor a la actual, no perderla en el nuevo estilo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Central DEBE presentar una navegación persistente (p. ej.
  lateral) con las secciones Monitoreo, Mapa e Historial, indicando en todo
  momento cuál está activa.
- **FR-002**: Las tablas de Monitoreo, Historial y la línea de tiempo del
  Detalle DEBEN usar un estilo tabular consistente entre sí (encabezados
  diferenciados del cuerpo, separación de filas, bordes uniformes).
- **FR-003**: La vista de Detalle de un recorrido DEBE presentarse dentro de
  un panel con jerarquía visual clara (encabezado del recorrido, metadatos de
  estado/cierre, línea de tiempo de puntos, mapa), reemplazando el bloque de
  texto plano actual.
- **FR-004**: Central DEBE usar una paleta de colores y tipografía
  consistentes en todas sus vistas, alineadas visualmente con la identidad
  usada en `rs956/frontend` (tono de navegación, estilo de bordes y
  tipografía de interfaz).
- **FR-005**: Los indicadores de estado ya existentes (ubicación reciente/no
  reciente, estado de viaje, estado del canal MQTT, error de actualización)
  DEBEN seguir siendo visualmente distinguibles después del rediseño.
- **FR-006**: El rediseño NO DEBE alterar el comportamiento funcional
  existente: mismos datos mostrados, misma cadencia de actualización
  (polling/MQTT), mismas acciones disponibles (ver detalle, volver, cambiar
  de vista).
- **FR-007**: Central DEBE seguir funcionando correctamente tanto embebida en
  un iframe de Oracle APEX como accedida directamente por su propia URL, sin
  degradar ninguno de los dos modos (Constitución, Principio III).
- **FR-008**: El diseño DEBE mantenerse orientado a uso de escritorio (no
  mobile-first), consistente con el uso actual de Central.
- **FR-009**: El estado vacío de cada vista (por ejemplo "No hay recorridos
  activos") DEBE mantenerse informativamente equivalente, presentado con el
  mismo lenguaje visual que el resto del panel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las pantallas de Central (Monitoreo, Mapa,
  Historial, Detalle) conserva los mismos datos y la misma cadencia de
  actualización que antes del rediseño, verificable por comparación
  funcional antes/después.
- **SC-002**: Un operador que no participó del rediseño puede identificar en
  qué sección de Central se encuentra y cómo volver a la vista anterior sin
  instrucciones adicionales, en una prueba de uso informal.
- **SC-003**: Central funciona sin regresiones tanto embebida en iframe como
  en acceso directo tras el rediseño, verificado manualmente en ambos modos.
- **SC-004**: Una revisión visual side-by-side confirma que la paleta de
  colores, tipografía y estilo de navegación/tablas de Central es coherente
  con la identidad visual de `rs956/frontend` (mismo lenguaje de diseño, no
  necesariamente los mismos textos o secciones).
- **SC-005**: Los recorridos con ubicación no reciente o en estados
  especiales (p. ej. "Regresando a base") siguen siendo identificables en
  menos de 5 segundos de inspección visual de la tabla de Monitoreo, igual
  o mejor que antes del rediseño.

## Assumptions

- "Copiar estilos de `rs956/frontend`" se interpreta como adoptar su
  identidad visual (paleta de colores, tipografía, estilo de navegación
  lateral, estilo de tablas y paneles) para dar consistencia entre las
  herramientas internas de escritorio de la organización — no como copiar
  código, componentes o funcionalidad específica del dominio de RS956
  (presentismo), que es un sistema distinto sin relación funcional con
  Central.
- El alcance es exclusivamente visual/estructural sobre las vistas ya
  existentes de Central (Monitoreo, Mapa, Historial, Detalle de recorrido);
  no se agregan secciones, datos ni funcionalidad nueva.
- El rediseño aplica únicamente a la aplicación Central. La aplicación del
  Chofer conserva su propio diseño mobile-first (Constitución, Principio I)
  y queda fuera de alcance de esta feature.
- Los indicadores de estado de dominio (ubicación no reciente, estados de
  viaje, estado del canal MQTT) mantienen su significado actual; solo cambia
  su presentación visual.
- Central sigue sirviéndose como aplicación de escritorio, no mobile-first,
  compatible con embebido en iframe y con acceso directo (Constitución,
  Principio III), sin cambios en esa restricción.
