# Feature Specification: Unificar Monitoreo y Mapa

**Feature Branch**: `011-unificar-monitoreo-mapa`

**Created**: 2026-08-20

**Status**: Implementado (documentado retroactivamente — ver Notas de proceso)

**Input**: User description: "unificar paginas Monitoreo y mapa, colocar mapa debajo de la grilla de monitoreo, para maximizar area de visualizacion eliminar menu lateral ya que solo quedan 2 comandos y colocar en la barra superior un boton que alterne entre monitoreo/historial"

## Notas de proceso

Esta feature se implementó directamente en la misma conversación en la que
se pidió (sin pasar primero por `/speckit-clarify`/`/speckit-plan`/
`/speckit-tasks`), porque las instrucciones ya eran una decisión de diseño
concreta y acotada, no una ambigüedad a resolver. Este documento la deja
registrada retroactivamente para que quede trazable junto con el resto de
las features de Central. No hay `plan.md`/`research.md`/`tasks.md`
separados: el diseño y la implementación fueron el mismo paso.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Monitoreo y Mapa en una sola pantalla (Priority: P1)

Como operador de Central, quiero ver la grilla de recorridos activos y el
mapa consolidado en la misma pantalla (el mapa debajo de la grilla), para
no tener que ir y volver entre dos secciones para relacionar una fila de la
tabla con su ubicación en el mapa.

**Why this priority**: es el pedido central — Monitoreo y Mapa mostraban la
misma información de fondo (los recorridos activos) en dos pestañas
separadas; unificarlas es lo que habilita el resto de esta feature
(eliminar el menú, que ya no tendría 3 secciones que justificar).

**Independent Test**: con recorridos activos cargados, abrir la sección
Monitoreo y verificar que la grilla y el mapa aparecen ambos en la misma
pantalla, sin ninguna navegación adicional.

**Acceptance Scenarios**:

1. **Given** hay recorridos activos, **When** el operador abre la sección
   Monitoreo, **Then** ve la grilla de recorridos y, debajo, el mapa
   consolidado (mismos datos que la grilla, sin pedido de red adicional).
2. **Given** el operador hace click en "Ver detalle" de una fila o en un
   marcador del mapa, **When** el click se procesa, **Then** se abre el
   Detalle de ese recorrido igual que antes (comportamiento preservado).
3. **Given** el operador vuelve desde el Detalle ("Volver al monitoreo"),
   **When** la navegación se completa, **Then** regresa a la pantalla
   unificada (grilla + mapa), no solo a la grilla.

---

### User Story 2 - Barra superior en vez de menú lateral (Priority: P1)

Como operador, quiero navegar entre Monitoreo y Historial con un control en
la barra superior en vez de un menú lateral, para que el contenido
disponga de todo el ancho de la pantalla (más relevante aún ahora que
Monitoreo incluye el mapa debajo de la grilla).

**Why this priority**: consecuencia directa de la Historia 1 — al quedar
solo 2 secciones (Monitoreo unificado, Historial), un menú lateral de varios
ítems deja de justificar el espacio horizontal que le resta al contenido.

**Independent Test**: abrir Central y verificar que no hay ningún menú
lateral; en su lugar, un botón en la barra superior permite pasar de
Monitoreo a Historial y viceversa, con el contenido ocupando el ancho
completo.

**Acceptance Scenarios**:

1. **Given** el operador está en Monitoreo, **When** mira la barra
   superior, **Then** ve un botón que dice "Ver Historial" (no un menú
   lateral).
2. **Given** el operador hace click en ese botón, **When** la navegación se
   completa, **Then** ve Historial, y el botón de la barra superior ahora
   dice "Ver Monitoreo".
3. **Given** el operador está viendo el Detalle de un recorrido (abierto
   desde Monitoreo), **When** hace click en el botón de la barra superior,
   **Then** navega directamente a Historial (mismo comportamiento que antes
   tenía el menú lateral: no hace falta volver a Monitoreo primero).

---

### Edge Cases

- ¿Qué pasa si no hay recorridos activos? La grilla muestra su estado vacío
  ya existente y el mapa, debajo, muestra igual el punto de salida por
  defecto (010-mapa-central-unificado, US4) — ninguno de los dos se oculta
  por la unificación.
- ¿Qué pasa en un iframe angosto (embebido en Oracle APEX, Principio III)?
  El contenido (grilla + mapa apilados verticalmente) sigue conteniendo su
  propio scroll dentro del `Content`, sin desbordar ni arrastrar el header
  fuera de vista — mismo mecanismo ya vigente, ahora sin el ancho fijo que
  le restaba el Sider.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mostrar la grilla de recorridos activos y el
  mapa consolidado en una única sección ("Monitoreo"), con el mapa ubicado
  debajo de la grilla.
- **FR-002**: El sistema NO DEBE mostrar un menú de navegación lateral.
- **FR-003**: El sistema DEBE ofrecer, en la barra superior, un control que
  alterne entre la sección Monitoreo (unificada) y la sección Historial.
- **FR-004**: El control de alternar DEBE reflejar en todo momento hacia
  qué sección navega (no solo la sección actual).
- **FR-005**: El sistema NO DEBE degradar ningún comportamiento ya
  existente de Monitoreo, Mapa o el Detalle de un recorrido (abrir Detalle
  desde una fila o un marcador, volver desde el Detalle, refresco
  automático, compatibilidad con iframe).

### Key Entities

- Sin entidades de datos nuevas — es un cambio de organización visual sobre
  datos ya existentes (`recorridos activos`, ya cubiertos por
  004-mapa-seguimiento-central y 010-mapa-central-unificado).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El operador ve la grilla y el mapa sin ninguna navegación
  adicional, en el 100% de los casos.
- **SC-002**: El operador identifica hacia dónde lo llevará el control de
  navegación de la barra superior sin necesidad de hacer click primero (el
  texto del botón ya lo indica).
- **SC-003**: Ningún test existente de Monitoreo, Mapa, Detalle o Historial
  cambia sus aserciones de datos como consecuencia de esta feature (solo
  cambian los tests de `AppShell`, que verifican la navegación en sí).

## Assumptions

- El botón de alternar es un control único (no un menú de 2 ítems visibles
  a la vez) que muestra la sección de destino, según lo pedido
  explícitamente ("un botón que alterne").
- El Detalle de un recorrido sigue teniendo su propio botón "Volver al
  monitoreo" (ya existente); el botón de la barra superior es un atajo de
  navegación adicional, no un reemplazo de ese botón.
- Esta unificación no cambia ningún contrato de backend ni el modelo de
  datos — es exclusivamente una reorganización del frontend de Central
  (`central/src/components/AppShell.jsx`, `central/src/main.jsx`).
