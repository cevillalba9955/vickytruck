# Feature Specification: Central — Mapa de Seguimiento de Fletes

**Feature Branch**: `005-mapa-seguimiento-central`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "mapa de seguimiento en central"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver en un mapa la ubicación de todos los fletes activos (Priority: P1)

Un operador de Central abre la vista de mapa y ve, de un vistazo espacial (no solo en una tabla de texto), dónde está cada flete con recorrido activo en este momento, distinguiendo visualmente si esa ubicación es reciente o antigua.

**Why this priority**: Es el valor central de esta feature — hoy la última ubicación de cada flete solo se muestra como texto ("Ubicación reciente"/"no reciente") en la tabla de [MonitorView](../../central/src/components/MonitorView.jsx) de 002-panel-control-central; sin una representación en mapa, el operador no puede ubicar espacialmente a los fletes de un vistazo.

**Independent Test**: Con dos o más recorridos activos con ubicaciones conocidas distintas (una reciente, una antigua), se abre la vista de mapa y se verifica que aparece un marcador por cada flete en su posición correcta, distinguiendo visualmente cuál es reciente y cuál no.

**Acceptance Scenarios**:

1. **Given** tres recorridos activos con última ubicación conocida, **When** el operador abre la vista de mapa, **Then** ve un marcador por cada flete posicionado en sus coordenadas reportadas.
2. **Given** un flete con ubicación reciente y otro con ubicación no reciente, **When** el operador observa el mapa, **Then** puede distinguir visualmente cuál es cuál, sin necesidad de abrir el detalle de cada uno.
3. **Given** el mapa abierto y un recorrido activo, **When** el chofer reporta una nueva ubicación, **Then** el marcador de ese flete se actualiza a la nueva posición sin que el operador recargue la página.
4. **Given** ningún recorrido activo, **When** el operador abre la vista de mapa, **Then** ve el mapa vacío con un mensaje claro, igual que ya ocurre hoy en la vista de lista.

---

### User Story 2 - Ver la ruta de un recorrido junto con la posición del flete (Priority: P2)

Desde el detalle de un recorrido puntual (ya existente, Historia 3 de 002-panel-control-central), el operador ve además, en un mapa, los puntos de entrega ordenados con su estado individual (pendiente/arribado/completado) y, si está disponible, la última posición conocida del flete.

**Why this priority**: Complementa la Historia 1 con contexto espacial de la ruta planificada, útil para entender cuánto falta y en qué orden, pero no bloquea el valor ya entregado por ver el mapa general de fletes activos.

**Independent Test**: Se abre el detalle de un recorrido con puntos en estados mixtos y se verifica que el mapa muestra cada punto en su posición fija con un indicador visual de su estado, además del marcador de posición del flete si existe.

**Acceptance Scenarios**:

1. **Given** un recorrido con 6 puntos en estados mixtos, **When** el operador abre su detalle, **Then** el mapa muestra los 6 puntos en sus coordenadas fijas, cada uno indicando visualmente su estado actual.
2. **Given** un recorrido cuyo flete todavía no reportó ninguna ubicación, **When** el operador abre su detalle, **Then** el mapa igual muestra los puntos de entrega del recorrido, sin marcador de posición del flete.

---

### Edge Cases

- ¿Qué pasa si dos o más fletes activos están en la misma ubicación o muy cerca uno del otro? El mapa MUST permitir distinguir y acceder a cada uno individualmente, sin que un marcador oculte a otro de forma irrecuperable.
- ¿Qué pasa si un flete no tiene ninguna ubicación conocida (ni en memoria del backend ni de respaldo en Oracle, ver FR-016 de 002-panel-control-central)? El mapa MUST omitir el marcador de ese flete en vez de mostrarlo en una posición inventada o por defecto (p. ej. 0,0).
- ¿Qué pasa si el mapa se ve embebido dentro del iframe de Oracle APEX? MUST renderizarse y funcionar igual que accedido directamente por URL (Principio III), sin bloqueos por políticas de frame.
- ¿Qué pasa si no hay recorridos activos? El mapa MUST mostrarse vacío con un mensaje claro, consistente con el comportamiento ya existente de la vista de lista.
- ¿Qué pasa si la última ubicación de un flete es muy antigua (no reciente)? El mapa MUST seguir mostrando su marcador, pero distinguido visualmente como no reciente, no ocultarlo silenciosamente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Central MUST proveer una vista de mapa que muestre, para cada recorrido activo con ubicación de flete conocida, un marcador posicionado en las coordenadas reportadas por ese flete.
- **FR-002**: El mapa MUST actualizar la posición de los marcadores de forma automática a medida que llegan nuevos reportes de ubicación, sin requerir que el operador recargue la página (mismo mecanismo de actualización ya usado por la vista de lista, FR-002 de 002-panel-control-central).
- **FR-003**: El mapa MUST distinguir visualmente, para cada marcador, si la ubicación reportada es reciente o no, usando el mismo umbral ya definido para la vista de lista (FR-014 de 002-panel-control-central) — sin una regla de antigüedad distinta para el mapa.
- **FR-004**: El operador MUST poder alternar entre la vista de lista existente y la vista de mapa (o verlas combinadas) sin perder cuál recorrido tiene seleccionado.
- **FR-005**: Seleccionar el marcador de un flete en el mapa MUST permitir al operador abrir el detalle de ese recorrido (reutilizando la vista de detalle ya existente, Historia 3 de 002-panel-control-central).
- **FR-006**: Al ver el detalle de un recorrido, el mapa MUST mostrar además sus puntos de entrega ordenados, cada uno indicando visualmente su estado actual (pendiente/arribado/completado).
- **FR-007**: El mapa MUST omitir el marcador de posición de un flete sin ubicación conocida, en vez de mostrarlo en una posición inventada o por defecto.
- **FR-008**: La vista de mapa MUST funcionar correctamente tanto embebida en un iframe de Oracle APEX como accedida directamente por la URL propia de Central (Principio III).
- **FR-009**: El mapa MUST permitir distinguir y acceder individualmente a fletes cuyas ubicaciones están muy próximas entre sí o coinciden, sin que un marcador impida ver u operar sobre otro.

### Key Entities

- **Marcador de flete**: representación visual en el mapa de la última ubicación conocida de un flete con recorrido activo; deriva de la misma fuente ya definida para la vista de lista (posición en memoria del backend, con respaldo en el último evento arribo/descarga persistido en Oracle — FR-016 de 002-panel-control-central). No es una entidad con estado propio: se recalcula a partir de `Recorrido`/`Flete` existentes.
- **Punto en mapa**: representación visual de un punto de entrega de un recorrido (mismas coordenadas y estado que la entidad "Punto de entrega" ya definida en 002-panel-control-central), mostrado únicamente en la vista de detalle de un recorrido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede identificar visualmente, en menos de 5 segundos desde que abre la vista de mapa, qué fletes activos tienen ubicación reciente y cuáles no.
- **SC-002**: Un cambio de ubicación reportado por un chofer se refleja en la posición del marcador correspondiente en menos de 10 segundos, sin recarga manual de la página.
- **SC-003**: Un operador puede pasar de la vista general de mapa al detalle de un recorrido específico en 2 acciones (clics) o menos.
- **SC-004**: La vista de mapa funciona correctamente tanto embebida en Oracle APEX como accedida directamente, en el 100% de las verificaciones realizadas, sin errores de bloqueo por frame.
- **SC-005**: Ningún marcador se muestra en una ubicación incorrecta o inventada cuando no hay dato de ubicación disponible para un flete, en el 100% de los casos verificados.

## Assumptions

- El mapa es una vista adicional/alternable dentro del panel de Central ya existente (002-panel-control-central); no reemplaza la vista de lista/tabla actual ([MonitorView](../../central/src/components/MonitorView.jsx)), sino que la complementa.
- El mapa muestra únicamente la última posición conocida de cada flete, no un historial de trayecto recorrido: el store operacional cloud solo persiste la última ubicación reportada por flete, no un log histórico de posiciones (ver Assumptions de 003-arquitectura-cloud-mqtt).
- La fuente de la ubicación mostrada en el mapa es la misma ya definida para la vista de lista (FR-016 de 002-panel-control-central): posición en memoria del backend compartido con la app del chofer, con respaldo en el último evento arribo/descarga persistido en Oracle cuando no hay dato en memoria.
- El umbral de "reciente/no reciente" es el mismo ya definido en 002-panel-control-central (FR-014), sin una regla nueva específica para esta feature.
- El proveedor o tecnología concreta de mapas (biblioteca de renderizado, mosaicos base) se decide en la fase de planificación (`/speckit-plan`), no en esta especificación.
- Esta especificación cubre exclusivamente la app de Central (panel de operador); no introduce ningún mapa en la app del chofer, cuya interfaz permanece fuera de alcance (Principio I, página única móvil-primero).
