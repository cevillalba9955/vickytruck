# Feature Specification: Ubicación en vivo ligada al chofer, no al viaje

**Feature Branch**: `012-ubicacion-por-chofer`

**Created**: 2026-08-21

**Status**: Draft

**Input**: User description: "Reporte de ubicación del chofer ruteado por choferId (no por fleteId), con reporte MQTT inmediato al abrir la app y caché cliente-side de la credencial del chofer para seguir reportando ubicación aunque el backend haya perdido el recorrido en memoria (404); más métricas de mensajes MQTT en el backend."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver al chofer moverse apenas abre la app (Priority: P1)

Un operador de Central mira el mapa en vivo. El chofer abre la app en su
celular (para revisar la ruta, o para marcar una acción). Hoy la posición
solo se actualiza si la app estuvo abierta el tiempo suficiente para que
dispare un temporizador interno (hasta 60 segundos) — algo poco frecuente,
porque el chofer normalmente abre la app un momento y sigue manejando. El
operador necesita ver la posición actualizarse en el momento en que el
chofer interactúa con la app, no depender de que la deje abierta.

**Why this priority**: Es el síntoma que motivó esta feature — sin esto, el
mapa en vivo de Central queda desactualizado la mayor parte del tiempo,
socavando la confianza de los operadores en la herramienta.

**Independent Test**: Abrir la app del chofer con conectividad normal y
confirmar que Central refleja la nueva posición sin esperar al ciclo
periódico habitual.

**Acceptance Scenarios**:

1. **Given** un chofer con un viaje asignado y GPS disponible, **When** abre
   la app, **Then** Central recibe una posición actualizada en pocos segundos,
   sin depender del temporizador periódico.
2. **Given** la app ya estaba abierta y el temporizador periódico sigue
   activo, **When** pasa el intervalo normal, **Then** la posición se sigue
   reportando igual que antes (este comportamiento no se retira, solo deja de
   ser el único disparador).

---

### User Story 2 - Seguir viendo al chofer aunque el backend haya perdido el viaje (Priority: P2)

El backend en la nube guarda los viajes solo en memoria; un reinicio o
despliegue los borra hasta que el sistema de origen (Oracle) los vuelve a
enviar. Hoy, cuando eso pasa, el chofer abre la app, recibe un error de
"enlace inválido", y el reporte de posición se corta por completo hasta que
alguien note el problema y resincronice. El operador de Central necesita
seguir viendo la última posición conocida del chofer durante ese lapso, en
vez de perderla por completo.

**Why this priority**: Ya ocurrió en producción y generó confusión
operativa ("parece que no funciona" cuando en realidad es un problema de
sincronización transitorio). Reduce directamente ese tipo de incidente, pero
depende de que la identidad del chofer (no del viaje) sea la base del reporte
de posición (User Story 1 la establece primero).

**Independent Test**: Con un chofer que ya usó la app exitosamente al menos
una vez en ese dispositivo, simular que el backend ya no reconoce su viaje
actual (enlace inválido) y confirmar que el dispositivo igual intenta seguir
reportando su posición usando la identidad de chofer conocida previamente en
ese mismo dispositivo.

**Acceptance Scenarios**:

1. **Given** un chofer que cargó su viaje exitosamente en este dispositivo
   al menos una vez, **When** el backend deja de reconocer el viaje actual
   (por ejemplo tras perder sus datos en memoria), **Then** el dispositivo
   sigue intentando reportar la posición del chofer, aunque la pantalla de
   ruta muestre error.
2. **Given** un dispositivo que nunca reportó ubicación exitosamente antes
   (chofer nuevo en ese teléfono, o sin ningún viaje resuelto todavía),
   **When** el backend no reconoce el viaje, **Then** no hay ninguna
   identidad de chofer previa disponible y el reporte de posición
   simplemente no ocurre hasta que el viaje se resuelva (no hay nada que
   inventar).

---

### User Story 3 - Diagnosticar la salud del canal de ubicación sin salir del sistema (Priority: P3)

Cuando alguien del equipo sospecha que la posición en vivo no está
llegando, hoy la única forma de confirmarlo es entrar a la consola del
proveedor de mensajería externo. El equipo necesita poder consultar, dentro
del propio sistema, cuántos reportes de ubicación llegaron recientemente,
cuántos se descartaron por ser duplicados o inválidos, y si el canal está
conectado — para diagnosticar sin depender de una herramienta externa.

**Why this priority**: Es una mejora de observabilidad que acelera el
diagnóstico de las Historias 1 y 2, pero no es indispensable para que ambas
funcionen — por eso queda en tercera prioridad.

**Independent Test**: Consultar el estado del canal de ubicación y
verificar que refleja la actividad reciente (o la ausencia de ella) sin
necesidad de acceder a ninguna herramienta externa.

**Acceptance Scenarios**:

1. **Given** reportes de ubicación llegando con normalidad, **When** se
   consulta el estado del canal, **Then** se ven contadores de mensajes
   recibidos/procesados que reflejan esa actividad reciente.
2. **Given** el canal de mensajería no está configurado en este entorno,
   **When** se consulta el estado, **Then** la respuesta lo indica
   claramente en vez de fallar o devolver datos engañosos.

---

### Edge Cases

- ¿Qué pasa si el chofer nunca usó la app en este dispositivo (sin identidad
  de chofer conocida) y además el viaje actual tampoco resuelve? No hay
  ninguna base para reportar posición — se documenta como limitación
  aceptada, no como falla a resolver acá.
- ¿Qué pasa si dos choferes distintos comparten el mismo dispositivo en
  turnos distintos? La identidad de chofer guardada en el dispositivo
  corresponde siempre al último que lo usó — al chofer siguiente se le
  actualiza en cuanto carga su propio viaje con éxito.
- ¿Qué pasa si el chofer deniega el permiso de GPS? Ningún disparador nuevo
  de esta feature cambia ese comportamiento existente: sin coordenadas
  disponibles, simplemente no hay nada que reportar en ese ciclo.
- ¿Qué pasa si el chofer abre la app repetidamente en pocos segundos (varios
  reloads)? Cada apertura puede intentar un reporte inmediato; está aceptado
  que esto pueda generar reportes algo más frecuentes de lo estrictamente
  necesario, priorizando no perder la oportunidad de reportar sobre evitar
  reportes de más.
- ¿Qué pasa con la posición de un chofer sin ningún viaje activo asociado?
  Se retiene igual como "última posición conocida de ese chofer", aunque por
  ahora ningún panel la muestre — es una base para uso futuro, no una
  funcionalidad visible en esta entrega.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE identificar y encaminar cada reporte de
  posición del chofer por su identidad de chofer (estable en el tiempo), no
  por el viaje o asignación vigente en ese momento.
- **FR-002**: El sistema DEBE intentar un reporte de posición apenas la app
  del chofer se activa (se abre o vuelve a primer plano), sin esperar a que
  transcurra el intervalo periódico normal.
- **FR-003**: El reporte de posición periódico existente (por intervalo, y
  el disparo ya existente al volver de segundo plano) se mantiene sin
  cambios, en paralelo al disparo inmediato de FR-002.
- **FR-004**: El dispositivo del chofer DEBE recordar localmente la
  identidad y credencial de ubicación del último chofer que lo usó
  exitosamente, para poder seguir intentando reportar posición aunque el
  servidor deje de reconocer el viaje/enlace vigente.
- **FR-005**: Cuando el servidor no reconoce el viaje/enlace actual pero el
  dispositivo tiene una identidad de chofer recordada (FR-004), el sistema
  DEBE seguir intentando reportar la posición de ese chofer igualmente.
- **FR-006**: Cuando llega un reporte de posición de un chofer que no tiene
  ningún viaje activo asociado en ese momento, el sistema DEBE retener esa
  posición como "última conocida de ese chofer" en vez de descartarla,
  aunque todavía no se muestre en ningún panel.
- **FR-007**: El sistema DEBE exponer, para consulta autenticada interna, un
  resumen del estado reciente del canal de ubicación: cantidad de mensajes
  recibidos, procesados, descartados por duplicado, descartados por
  inválidos, reconexiones, marca de tiempo del último mensaje procesado, y si
  el canal está conectado en este momento.
- **FR-008**: Si el canal de mensajería de ubicación no está configurado en
  el entorno actual, la consulta de estado (FR-007) DEBE indicarlo
  explícitamente en vez de fallar o simular actividad.
- **FR-009**: El reporte de acciones del viaje (marcar llegada, marcar
  descarga completa, etc., ya existente) NO debe verse afectado por esta
  feature — sigue funcionando exactamente igual.

### Key Entities

- **Chofer**: identidad estable de la persona que conduce, independiente de
  cualquier viaje puntual — es la clave con la que ahora se encamina el
  reporte de posición.
- **Recorrido/Viaje**: la asignación de trabajo vigente (puntos de entrega,
  estado), que puede estar activa, pendiente o ya no reconocida por el
  servidor en un momento dado — deja de ser indispensable para que la
  posición se siga reportando.
- **Reporte de ubicación**: un evento puntual con coordenadas y momento,
  asociado siempre a un chofer; puede o no estar asociado también a un viaje
  activo en el momento de procesarse.
- **Estado del canal de ubicación**: resumen agregado y reciente de cuántos
  reportes de ubicación llegaron, se procesaron o se descartaron, consultable
  bajo demanda.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Al abrir la app, la posición del chofer se refleja en el
  panel de Central en segundos, sin depender de que la app permanezca
  abierta un minuto completo.
- **SC-002**: Ante una pérdida temporal de los datos del viaje en el
  servidor, Central sigue mostrando la última posición conocida del chofer
  (recibida después del incidente) sin necesitar ninguna acción manual de
  resincronización antes de volver a verla moverse.
- **SC-003**: El equipo puede confirmar si el canal de ubicación está
  recibiendo mensajes con normalidad consultando únicamente el propio
  sistema, sin acceder a ninguna consola externa.
- **SC-004**: El reporte de acciones del viaje (llegada, descarga) mantiene
  el mismo comportamiento y tasa de éxito que antes de esta feature.

## Assumptions

- El dispositivo del chofer es, en la práctica, de uso personal/1-a-1: la
  identidad recordada localmente (FR-004) representa "el último chofer que
  usó este teléfono", sin necesidad de manejar múltiples identidades
  simultáneas en un mismo dispositivo.
- La credencial de ubicación del chofer ya es de larga duración y no
  depende del viaje vigente (según el sistema de mensajería actual) — esta
  feature reutiliza esa propiedad, no la introduce.
- Guardar la última posición conocida de un chofer sin viaje activo
  (FR-006) es solo una retención en memoria de corto plazo, sin garantías de
  persistencia más allá de la vida del proceso del servidor — no reemplaza
  ningún registro histórico/auditable existente.
- Ningún panel de Central necesita mostrar todavía la posición de un chofer
  sin viaje activo (FR-006); queda como base para una decisión de producto
  futura, fuera de esta entrega.
- No se requieren cambios en cómo se solicita o maneja el permiso de GPS del
  navegador — el disparo inmediato (FR-002) reutiliza la misma obtención de
  ubicación ya existente.
