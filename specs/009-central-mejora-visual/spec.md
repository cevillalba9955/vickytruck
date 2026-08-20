# Feature Specification: Rediseño visual de Central

**Feature Branch**: `009-central-mejora-visual`

**Created**: 2026-08-19

**Status**: Implementado (MVP + refinamientos post-implementación, ver Historias 4-6)

**Input**: User description: "iu-central, mejorar la interfaz grafica, copiar estilos de C:\AI\rs956\frontend"

**Nota de alcance (2026-08-19, post-implementación)**: tras completar el MVP
(Historias 1-3, PR #17), el usuario pidió en la misma conversación una serie
de refinamientos concretos sobre Monitoreo, Historial y RecorridoDetalle
(Historias 4-6 abajo). Varios de esos refinamientos requirieron exponer a
Central datos que el backend ya trackeaba pero no servía (chofer, cliente
por punto, GPS de auditoría de arribo/descarga) — algo que la Historia 1
original excluía explícitamente ("sin tocar ningún dato... existente", ver
plan.md Summary). Esa restricción se **amplía** desde Historia 4 en adelante:
se permite exponer datos adicionales de solo lectura ya trackeados en el
backend, siempre de forma aditiva (nunca removiendo ni cambiando de forma un
campo existente) y sin tocar Oracle ni el contrato de sincronización
(Principio IV). Ver research.md Decisiones 6-12 y data-model.md para el
detalle de cada campo agregado.

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

### User Story 4 - Monitoreo con más contexto operativo por recorrido (Priority: P2)

Como operador, además de flete y estado quiero ver de un vistazo quién es el
**chofer** al volante, a **qué cliente** corresponde el punto que se está
trabajando ahora mismo, el **progreso** como una barra Completados/Total en
vez de una oración larga, y el estado del canal MQTT como un ícono discreto
en el header en vez de un cartel de texto en el contenido — para que la
tabla de Monitoreo comunique más información operativa sin ocupar más
espacio ni distraer del dato principal (qué recorridos necesitan atención).

**Why this priority**: pedido directo del usuario tras ver el MVP en uso;
no es parte del alcance mínimo original (Historia 1-3) pero es una mejora de
la misma naturaleza (legibilidad/densidad de información), sin la cual
Monitoreo sigue siendo usable — de ahí P2, igual que Historia 2.

**Independent Test**: abrir Monitoreo con recorridos en distintos estados
(con/sin chofer asignado, con/sin punto activo, con/sin cliente informado
para ese punto) y verificar que cada columna muestra el dato correcto o un
`—` cuando falta, sin romper las columnas existentes.

**Acceptance Scenarios**:

1. **Given** un recorrido con chofer asignado, **When** el operador ve la
   tabla de Monitoreo, **Then** el nombre del chofer aparece en su propia
   columna, en 3er lugar (después de Recorrido y Flete).
2. **Given** un recorrido con un punto activo cuyo cliente está informado,
   **When** el operador ve la fila, **Then** la columna "Punto" muestra el
   nombre del cliente (no el id interno del punto); si el cliente todavía no
   está informado, muestra "Punto {orden}" en vez de dejarlo vacío.
3. **Given** un recorrido con progreso parcial, **When** el operador ve la
   columna Progreso, **Then** ve una barra con el texto "Completados / Total"
   (p. ej. "3 / 6"), con el detalle completo (en curso/pendientes)
   disponible al pasar el mouse.
4. **Given** el canal MQTT cambia de estado, **When** el operador mira el
   header, **Then** ve un punto de color (verde=conectado, azul
   pulsante=reconectando, rojo=desconectado/error, naranja=error de datos)
   sin texto visible, con el detalle disponible en un tooltip y para
   lectores de pantalla.

---

### User Story 5 - Historial con información completa de cada viaje (Priority: P2)

Como operador, en Historial quiero ver la fecha de cierre, el flete, el
chofer, la cantidad de clientes visitados y el tiempo total de cada
recorrido finalizado (no solo un id de flete crudo y una cantidad de
puntos), para poder evaluar un recorrido pasado sin tener que abrir su línea
de tiempo completa.

**Why this priority**: mismo criterio que Historia 4 — mejora de legibilidad
pedida después del MVP, no bloqueante para el uso básico de Historial.

**Independent Test**: abrir Historial con recorridos finalizados variados
(con/sin chofer, con/sin evento de inicio registrado) y verificar que cada
columna nueva muestra el dato correcto o "—" cuando no se puede calcular.

**Acceptance Scenarios**:

1. **Given** un recorrido finalizado, **When** el operador ve la fila en
   Historial, **Then** ve Fecha (con la hora de cierre como detalle),
   Flete, Chofer, Cantidad de clientes y Tiempo total.
2. **Given** un recorrido sin ningún evento de inicio registrado (dato
   histórico anterior a la feature 008), **When** se calcula el tiempo
   total, **Then** la columna muestra "—" en vez de un número inventado.

---

### User Story 6 - Detalle de recorrido con verificación de proximidad y actualización en vivo (Priority: P2)

Como operador, al abrir el Detalle de un recorrido quiero ver un encabezado
con fecha, flete, chofer, hora de inicio, hora final y tiempo total; una
grilla de puntos con cliente, estado y horas de llegada/descarga marcadas
con un color según si la posición GPS que registró el chofer cayó cerca del
destino real del punto; que la vista se siga actualizando sola mientras la
tengo abierta (igual que Monitoreo); y que el botón para volver esté junto
al título en vez de ocupar su propia fila, para aprovechar mejor el
espacio vertical disponible.

**Why this priority**: mismo criterio que Historias 4-5 — conjunto de
mejoras pedidas después del MVP sobre una vista que ya cumplía su función
básica (Historia 1, Acceptance Scenario 3).

**Independent Test**: abrir el Detalle de un recorrido activo (desde
Monitoreo) y de uno finalizado (desde Historial); verificar que el
encabezado, la grilla y el color de proximidad son correctos en ambos casos,
y que — solo para el recorrido activo — los datos se refrescan solos sin
recargar la página mientras la vista sigue abierta.

**Acceptance Scenarios**:

1. **Given** el operador abre el Detalle de un recorrido, **When** la vista
   carga, **Then** el encabezado muestra Fecha, Flete, Chofer, Estado, Hora
   inicio, Final y Tiempo total; para un recorrido todavía activo, Final
   queda en "—" y Tiempo total muestra lo transcurrido hasta el momento.
2. **Given** un punto cuya posición GPS registrada al marcar arribo/descarga
   cae dentro de un radio de 500 m del destino del punto, **When** el
   operador ve la grilla, **Then** esa hora se marca en verde; si cae fuera
   del radio, se marca en rojo; si no hay GPS capturado para ese evento, se
   muestra la hora sin color.
3. **Given** el chofer marca un evento (arribo, descarga) mientras el
   operador tiene el Detalle de ese recorrido abierto, **When** pasa el
   siguiente ciclo de actualización, **Then** la grilla y el encabezado
   reflejan el cambio sin que el operador tenga que volver a Monitoreo y
   abrir el Detalle de nuevo.
4. **Given** el operador está viendo el Detalle, **When** busca la acción
   para volver, **Then** la encuentra como un botón con ícono a la derecha
   del título del panel, no en una fila separada arriba.

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
- ¿Qué pasa si un recorrido todavía no tiene chofer asignado, o el punto
  activo todavía no tiene cliente informado? Las columnas/campos
  correspondientes muestran "—" (o "Punto {orden}" para el caso del
  cliente), nunca un valor vacío sin explicación ni un error.
- ¿Qué pasa si no hay GPS capturado para un evento de arribo/descarga (el
  chofer no tenía señal o denegó el permiso)? La hora se muestra igual, sin
  color de proximidad — no hay con qué compararla, y eso no debe leerse
  como "fuera de rango".
- ¿Qué pasa con un recorrido histórico (anterior a la feature 008) sin
  ningún evento de inicio registrado? "Hora inicio" y "Tiempo total" quedan
  en "—" en vez de calcular un valor incorrecto.

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
  de vista). **Ampliado por Historias 4-6**: se permite exponer a Central
  datos adicionales de solo lectura que el backend ya trackeaba pero no
  servía (chofer, cliente por punto, GPS de auditoría de arribo/descarga),
  siempre de forma aditiva y sin tocar Oracle ni el contrato de
  sincronización (Principio IV) — ver Assumptions.
- **FR-007**: Central DEBE seguir funcionando correctamente tanto embebida en
  un iframe de Oracle APEX como accedida directamente por su propia URL, sin
  degradar ninguno de los dos modos (Constitución, Principio III).
- **FR-008**: El diseño DEBE mantenerse orientado a uso de escritorio (no
  mobile-first), consistente con el uso actual de Central.
- **FR-009**: El estado vacío de cada vista (por ejemplo "No hay recorridos
  activos") DEBE mantenerse informativamente equivalente, presentado con el
  mismo lenguaje visual que el resto del panel.
- **FR-010** (Historia 4): Monitoreo DEBE mostrar el chofer del recorrido en
  su propia columna (distinto del flete), y el cliente del punto activo en
  vez de solo su id interno, con un fallback explícito cuando falte
  cualquiera de los dos datos.
- **FR-011** (Historia 4): La columna Progreso de Monitoreo DEBE presentarse
  como una barra Completados/Total, con el desglose completo
  (completados/en curso/pendientes) disponible sin ocupar espacio fijo en la
  tabla.
- **FR-012** (Historia 4): El estado del canal MQTT DEBE mostrarse como un
  indicador de color en el header (sin texto visible en la tabla/contenido),
  manteniendo el texto disponible para tooltip y lectores de pantalla.
- **FR-013** (Historia 5): Historial DEBE mostrar, por recorrido finalizado:
  fecha de cierre, nombre de flete, nombre de chofer, cantidad de clientes
  visitados y tiempo total del recorrido.
- **FR-014** (Historia 6): El encabezado del Detalle de un recorrido DEBE
  mostrar fecha, flete, chofer, estado, hora de inicio, hora final y tiempo
  total; para un recorrido activo (sin cierre), hora final y tiempo total
  DEBEN reflejar el estado "todavía en curso" en vez de un dato falso.
- **FR-015** (Historia 6): La grilla de puntos del Detalle DEBE marcar cada
  hora de llegada/descarga según si la posición GPS registrada por el
  chofer cayó dentro de un radio de 500 m del destino del punto (verde
  dentro, rojo fuera, sin color si no hay GPS capturado) — señal visual de
  revisión, sin bloquear ninguna acción existente.
- **FR-016** (Historia 6): Mientras la vista de Detalle de un recorrido
  activo está abierta, DEBE actualizarse con la misma cadencia que
  Monitoreo, sin requerir que el operador la vuelva a abrir manualmente.
- **FR-017** (Historia 6): La acción para volver a la vista anterior desde
  el Detalle DEBE ubicarse junto al título del panel, no en una fila propia
  que reduzca el área vertical disponible para el contenido.

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
- **SC-006** (Historia 4-5): Un operador puede identificar el chofer, el
  cliente del punto activo (Monitoreo) y el flete/chofer/tiempo total de un
  recorrido pasado (Historial) sin abrir ninguna vista adicional.
- **SC-007** (Historia 6): Un operador puede detectar, solo con inspección
  visual de la grilla de puntos, si la posición GPS registrada en algún
  evento de arribo/descarga quedó fuera del radio esperado del punto, sin
  tener que calcular distancias manualmente.
- **SC-008** (Historia 6): Un cambio de estado hecho por el chofer (arribo,
  descarga) se refleja en el Detalle abierto en Central dentro del mismo
  intervalo de polling que ya aplica a Monitoreo (5 s de respaldo / 30 s con
  MQTT conectado), sin acción manual del operador.

## Assumptions

- "Copiar estilos de `rs956/frontend`" se interpreta como adoptar su
  identidad visual (paleta de colores, tipografía, estilo de navegación
  lateral, estilo de tablas y paneles) para dar consistencia entre las
  herramientas internas de escritorio de la organización — no como copiar
  código, componentes o funcionalidad específica del dominio de RS956
  (presentismo), que es un sistema distinto sin relación funcional con
  Central.
- **MVP original (Historias 1-3)**: el alcance fue exclusivamente
  visual/estructural sobre las vistas ya existentes de Central (Monitoreo,
  Mapa, Historial, Detalle de recorrido); no se agregaron secciones, datos
  ni funcionalidad nueva. Esa restricción se amplía desde Historia 4 en
  adelante — ver el bullet siguiente y la Nota de alcance al inicio del
  documento.
- El rediseño aplica únicamente a la aplicación Central. La aplicación del
  Chofer conserva su propio diseño mobile-first (Constitución, Principio I)
  y queda fuera de alcance de esta feature.
- Los indicadores de estado de dominio (ubicación no reciente, estados de
  viaje, estado del canal MQTT) mantienen su significado actual; solo cambia
  su presentación visual.
- Central sigue sirviéndose como aplicación de escritorio, no mobile-first,
  compatible con embebido en iframe y con acceso directo (Constitución,
  Principio III), sin cambios en esa restricción.
- **Historias 4-6**: "chofer" y "flete" son entidades distintas en este
  dominio (choferId/choferNombre vs. fleteId/fleteNombre, ya trackeadas en
  el backend desde la feature 005 pero no expuestas a Central hasta ahora).
  Exponerlas, junto con el cliente por punto y el GPS de auditoría de
  arribo/descarga, es una ampliación aditiva y de solo lectura del contrato
  `GET /api/central/recorridos/*` — no requiere cambios en Oracle/APEX ni en
  el contrato de sincronización (Principio IV), y no reemplaza ni modifica
  ningún campo ya existente.
- El radio de proximidad de 500 m (Historia 6) es un valor fijo definido en
  el frontend, no configurable ni persistido — es una señal visual de
  revisión para el operador, no una regla de negocio ni una geocerca (el
  sistema nunca tuvo geocerca, ver specs/008-registro-inicio-fin-recorrido).
- El campo `inicioLat`/`inicioLon`/`cierreLat`/`cierreLon` (GPS de auditoría
  de INICIAR/FINALIZAR, distinto del GPS de arribo/descarga) permanece fuera
  de alcance — no se expone a Central en esta feature.
