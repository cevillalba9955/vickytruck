# Feature Specification: Mapa Central Unificado

**Feature Branch**: `010-mapa-central-unificado`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "Mapa Central, dado que la cantidad de recorridos es limitada (menos de 10 simultaneos y geograficamente cercanos) es posible mostrar en el mismo mapa toda los puntos y posiciones de fletes al mismo tiempo. para eso en necesario distinguir con colores los puntos correspondientes a cada recorrido, y con mouseover indicar nombre cliente, y al chofer con un icono distinto, Tambien agregar punto de salida (de momento siempre el mismo, pero a futuro podria ser particular de cada recorrido, seria conveniente enviarlo desde Oracle junto con los puntos de entrega)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vista consolidada de todos los recorridos activos, por color (Priority: P1)

Como operador de Central, en la vista de Mapa quiero ver simultáneamente los
puntos de entrega y la posición del flete de **todos** los recorridos
activos (no solo uno a la vez), cada recorrido con su propio color
distintivo, para tener de un vistazo el panorama operativo completo sin
tener que abrir el Detalle de cada recorrido uno por uno.

**Why this priority**: es el pedido central de la feature — hoy la vista de
Mapa solo muestra la posición de los fletes (sin sus puntos de entrega), y
el Detalle solo muestra un recorrido a la vez. Sin la consolidación por
color, mostrar todos los puntos juntos sería una mezcla ilegible; ambas
cosas juntas son el mínimo viable de esta feature.

**Independent Test**: con varios recorridos activos simultáneos (algunos con
puntos en zonas cercanas entre sí), abrir la vista de Mapa general y
verificar que aparecen los puntos de entrega y la posición de flete de cada
uno, y que los marcadores de un mismo recorrido comparten un color que no
se repite con el de otro recorrido activo.

**Acceptance Scenarios**:

1. **Given** hay 3 recorridos activos con puntos de entrega asignados,
   **When** el operador abre la vista de Mapa, **Then** ve en un mismo mapa
   los puntos de entrega de los 3 recorridos y la posición de flete de cada
   uno (cuando la tiene), sin necesidad de seleccionar un recorrido primero.
2. **Given** dos recorridos activos distintos, **When** el operador compara
   sus marcadores en el mapa, **Then** cada recorrido usa un color propio,
   aplicado de forma consistente a la posición de su flete y a todos sus
   puntos (entrega y salida).
3. **Given** un recorrido activo sin ubicación de flete reportada todavía,
   **When** el operador ve el mapa, **Then** los puntos de ese recorrido se
   muestran igual (con su color), sin inventar una posición de flete.
4. **Given** el operador hace click sobre el marcador de posición de un
   flete, **When** el click se procesa, **Then** se abre el Detalle de ese
   recorrido (comportamiento ya existente en la vista de Mapa, preservado).

---

### User Story 2 - Icono distinto para el flete/chofer (Priority: P2)

Como operador, quiero que la posición del flete/chofer se distinga
visualmente (por su forma/ícono) de los puntos de entrega, para reconocer de
un vistazo "dónde está el camión" sin confundirlo con un destino, incluso
antes de leer ningún texto.

**Why this priority**: con varios recorridos superpuestos en el mismo mapa
(Historia 1), la distinción por color ya ayuda a agrupar por recorrido, pero
no alcanza para distinguir "posición actual del flete" de "punto de
entrega" dentro del mismo recorrido; es una mejora de claridad sobre la base
ya funcional de la Historia 1.

**Independent Test**: con al menos un recorrido activo que tenga tanto
posición de flete como puntos de entrega visibles, verificar que el
marcador de la posición del flete usa una forma/ícono distinto al de los
marcadores de punto de entrega, manteniendo igual el color de recorrido en
ambos.

**Acceptance Scenarios**:

1. **Given** un recorrido activo con posición de flete y puntos de entrega
   visibles en el mapa, **When** el operador los mira, **Then** el marcador
   de la posición del flete tiene una forma distinta a la de los marcadores
   de punto de entrega, independientemente de que compartan color.
2. **Given** varios recorridos activos, **When** el operador ve el mapa,
   **Then** todas las posiciones de flete usan la misma familia de ícono
   entre sí (solo cambia el color por recorrido), y lo mismo para todos los
   puntos de entrega.

---

### User Story 3 - Nombre del cliente al pasar el mouse (Priority: P2)

Como operador, quiero ver el nombre del cliente de un punto de entrega
pasando el mouse sobre su marcador en el mapa, sin tener que hacer click ni
abrir el Detalle del recorrido, para identificar rápidamente destinos
mientras reviso el panorama general.

**Why this priority**: mejora la utilidad de la vista consolidada (Historia
1) pero no es indispensable para que esta cumpla su función básica
(distinguir recorridos y ubicaciones por color); el operador ya puede
recurrir al Detalle si necesita el nombre del cliente.

**Independent Test**: con puntos de entrega que tienen cliente informado y
otros que no, pasar el mouse sobre cada marcador y verificar que se muestra
el nombre del cliente cuando está disponible, y un texto de reemplazo (p.
ej. "Punto {orden}") cuando no lo está — igual que ya ocurre en la grilla
del Detalle de recorrido.

**Acceptance Scenarios**:

1. **Given** un punto de entrega con cliente informado, **When** el operador
   pasa el mouse sobre su marcador, **Then** ve el nombre del cliente.
2. **Given** un punto de entrega sin cliente informado, **When** el operador
   pasa el mouse sobre su marcador, **Then** ve "Punto {orden}" en vez de
   dejar el mensaje vacío.
3. **Given** el operador pasa el mouse sobre la posición de un flete,
   **When** el mensaje aparece, **Then** identifica a qué flete/recorrido
   pertenece esa posición (no el nombre de un cliente).

---

### User Story 4 - Punto de salida visible por recorrido (Priority: P3)

Como operador, quiero ver en el mapa el punto de salida de cada recorrido
activo (además de sus puntos de entrega), para tener el panorama completo
del recorrido de punta a punta, incluso sabiendo que hoy todos los
recorridos parten del mismo lugar.

**Why this priority**: es un agregado de información sobre la vista ya
funcional de las Historias 1-3; no bloquea el valor principal (ver
recorridos activos distinguidos por color) y hoy tiene un impacto visual
menor porque el punto de partida es el mismo para todos los recorridos.

**Independent Test**: con varios recorridos activos, verificar que el mapa
muestra un marcador de punto de salida por cada uno (con el color de su
recorrido), distinguible de sus puntos de entrega, y que al pasar el mouse
se identifica como el punto de salida.

**Acceptance Scenarios**:

1. **Given** un recorrido activo, **When** el operador ve el mapa, **Then**
   además de sus puntos de entrega, ve un marcador de punto de salida con el
   color de ese recorrido.
2. **Given** varios recorridos activos que parten del mismo lugar, **When**
   el operador ve el mapa, **Then** cada uno tiene su propio marcador de
   punto de salida superpuesto en esa ubicación (agrupados de forma
   distinguible, igual que ya ocurre hoy cuando varios marcadores coinciden
   en coordenadas), no un único marcador compartido sin identificar a qué
   recorrido pertenece cada uno.
3. **Given** el operador pasa el mouse sobre un marcador de punto de salida,
   **When** el mensaje aparece, **Then** se identifica como el punto de
   salida de ese recorrido (no como un punto de entrega más).

---

### Edge Cases

- ¿Qué pasa cuando hay más recorridos activos que colores fácilmente
  distinguibles entre sí? El sistema debe seguir asignando un color por
  recorrido (reutilizando colores si hace falta) sin dejar de mostrar
  ningún recorrido; dado que la Constitución limita cada recorrido a 10
  puntos y el escenario esperado es menos de 10 recorridos simultáneos
  geográficamente cercanos, no se optimiza para una cantidad mayor.
- ¿Qué pasa si dos o más marcadores (de recorridos distintos o del mismo)
  caen en coordenadas iguales o muy próximas? Deben seguir siendo
  distinguibles y clickeables/hover-eables individualmente, igual que ya
  maneja el mapa hoy para marcadores agrupados.
- ¿Qué pasa con un recorrido activo que todavía no tiene ningún punto con
  coordenadas válidas? No debe romper el mapa; simplemente no aporta
  marcadores de punto (regla ya vigente, ver Principio II de la
  Constitución: todo punto tiene coordenadas obligatorias).
- ¿Qué pasa si el operador está viendo el mapa mientras un recorrido pasa a
  estado finalizado o cambia su progreso? El mapa debe reflejar el cambio en
  el próximo ciclo de actualización automática (mismo comportamiento de
  refresco ya vigente en Monitoreo/Detalle), sin que el operador tenga que
  recargar la página.
- ¿Qué pasa si no hay ningún recorrido activo? Se mantiene el estado vacío
  ya existente ("No hay recorridos activos en este momento"), sin mostrar
  un mapa vacío sin explicación.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mostrar en la vista de Mapa, de forma
  simultánea, los puntos de entrega y la posición de flete de todos los
  recorridos activos (no solo del recorrido seleccionado).
- **FR-002**: El sistema DEBE asignar a cada recorrido activo un color
  distintivo, aplicado de forma consistente a la posición de su flete y a
  todos sus puntos (entrega y salida).
- **FR-003**: El sistema DEBE distinguir visualmente, mediante una forma o
  ícono propio (independiente del color), el marcador de posición de un
  flete/chofer de los marcadores de punto de entrega y de punto de salida.
- **FR-004**: El sistema DEBE mostrar el nombre del cliente de un punto de
  entrega al pasar el mouse sobre su marcador, sin requerir un click; si el
  punto no tiene cliente informado, DEBE mostrar "Punto {orden}" en su
  lugar, igual que la grilla del Detalle de recorrido.
- **FR-005**: El sistema DEBE mostrar, al pasar el mouse sobre la posición
  de un flete, información suficiente para identificar a qué
  flete/recorrido corresponde esa posición.
- **FR-006**: El sistema DEBE mostrar un marcador de punto de salida por
  cada recorrido activo, con el color de ese recorrido, distinguible de sus
  puntos de entrega e identificable como "punto de salida" al pasar el
  mouse.
- **FR-007**: El sistema NO DEBE romper ni degradar el comportamiento ya
  existente de la vista de Mapa (estado vacío sin recorridos activos, click
  sobre un flete para abrir su Detalle, agrupamiento de marcadores
  coincidentes, ausencia de marcador cuando falta una coordenada).
- **FR-008**: El origen de las coordenadas del punto de salida DEBE poder
  variar por recorrido sin requerir cambios en la vista de Mapa, aun cuando
  hoy todos los recorridos activos compartan la misma ubicación de salida.

### Key Entities

- **Recorrido activo (en el mapa)**: agrupa, para efectos de esta vista, la
  posición de flete, el punto de salida y los puntos de entrega de un mismo
  recorrido bajo un color común.
- **Punto de salida**: ubicación (coordenadas) desde la que parte un
  recorrido; hoy es la misma para todos los recorridos activos, pero se
  modela por recorrido para permitir que varíe en el futuro.
- **Punto de entrega**: entidad ya existente (Historia 2 de
  004-mapa-seguimiento-central) — cliente, coordenadas y estado
  (pendiente/arribado/completado).
- **Posición de flete**: entidad ya existente (Historia 1 de
  004-mapa-seguimiento-central) — última ubicación conocida y si es
  reciente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con hasta 10 recorridos activos simultáneos, el operador ve
  los puntos de entrega y la posición de flete de todos ellos en una sola
  pantalla, sin abrir ningún Detalle.
- **SC-002**: El operador identifica a qué recorrido pertenece un marcador
  (punto o posición de flete) por su color, sin necesidad de leer texto ni
  hacer click.
- **SC-003**: El operador obtiene el nombre del cliente de cualquier punto
  de entrega visible en el mapa con una sola acción (pasar el mouse), en el
  100% de los puntos con cliente informado.
- **SC-004**: El operador distingue la posición de un flete de un punto de
  entrega por su forma, sin necesidad de leer ningún texto, en el 100% de
  los casos.
- **SC-005**: El punto de salida de cada recorrido activo es visible en el
  mapa sin necesidad de abrir el Detalle de ese recorrido.

## Assumptions

- La vista de Mapa unificada es la vista general de Mapa ya existente en
  Central (hoy solo muestra posiciones de flete); esta feature la extiende
  para incluir también los puntos de entrega y de salida de todos los
  recorridos activos. El mapa embebido dentro del Detalle de un recorrido
  (que ya muestra solo ese recorrido) no cambia de alcance.
- El esquema de asignación de color por recorrido no requiere que el
  operador pueda elegir o personalizar colores; alcanza con una paleta fija
  de colores distinguibles entre sí, reutilizada si la cantidad de
  recorridos activos superara la paleta (caso hoy fuera del rango esperado
  de "menos de 10 simultáneos").
- Por ahora, el punto de salida de todos los recorridos es el mismo lugar
  (un depósito/base única); el requisito de modelarlo por recorrido (FR-008)
  es para no bloquear que a futuro cada recorrido tenga su propio punto de
  salida particular, enviado junto con los puntos de entrega desde la misma
  fuente de datos que ya provee esos puntos (Oracle), sin requerir otro
  cambio en esta vista cuando eso ocurra.
- Seleccionar/filtrar para ver un único recorrido a la vez dentro de esta
  vista consolidada (por ejemplo, ocultar temporalmente los demás) queda
  fuera de alcance de esta feature; el operador que necesita foco total en
  un recorrido ya cuenta con el Detalle.
