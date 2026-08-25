# Feature Specification: Registro de inicio y fin de recorrido con regreso a base

**Feature Branch**: `008-registro-inicio-fin-recorrido`

**Created**: 2026-08-13

**Updated**: 2026-08-25 — se agrega User Story 3: exponer a Central las coordenadas GPS de los eventos de inicio y cierre (ya capturadas y guardadas desde la versión original, pero no expuestas — ver Decisión 4 en research.md).

**Status**: Draft

**Input**: User description: "nueva spec: registrar inicio y final de recorrido; debe guardar ubicacion y hora cuando chofer presiona iniciar en cada punto y cuando presiona finalizar recorrido. ademas para considerar el tiempo de regreso a base, el finalizar recorrido deja de ser automatico en el ultimo punto."

**Update input (2026-08-25)**: "Registrar ubicacion al iniciar y finalizar el recorrido" — al revisar el estado actual se confirmó que el sistema ya registra fecha/hora en ambos eventos, y ya captura la ubicación GPS internamente, pero no la expone a Central. Esta actualización agrega esa exposición.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registrar hora y ubicación al iniciar cada punto (Priority: P1)

Cuando el chofer toca INICIAR sobre un punto de entrega (pasando el viaje a estado Manejando), el sistema registra en ese instante la fecha/hora de servidor y la ubicación GPS del chofer si está disponible, además de fijar ese punto como activo. Este registro queda disponible como parte de la trazabilidad del punto, junto a los ya existentes de arribo y descarga completa.

**Why this priority**: Sin este registro no se puede medir cuánto tarda el chofer en llegar a cada punto desde que sale hacia él, dato necesario para el análisis operativo y para el objetivo general de esta feature (medir tiempos reales de recorrido, incluyendo el regreso a base).

**Independent Test**: Con un recorrido con puntos pendientes en estado Detenido, se toca INICIAR sobre el primer punto y se verifica que queda registrada la fecha/hora y (si el dispositivo la provee) la ubicación GPS asociadas a ese evento de inicio, visibles luego para Central.

**Acceptance Scenarios**:

1. **Given** el viaje en estado Detenido con puntos pendientes, **When** el chofer toca INICIAR sobre el punto activo, **Then** el sistema registra fecha/hora de servidor y ubicación GPS del chofer (si está disponible) asociadas a ese punto como su evento de inicio.
2. **Given** que el dispositivo no puede obtener ubicación GPS en el momento de tocar INICIAR, **When** el chofer confirma igualmente la acción, **Then** el evento de inicio se registra con fecha/hora igual, indicando que la ubicación no estaba disponible, sin bloquear el cambio de estado a Manejando.
3. **Given** un punto que ya tiene registrado su evento de inicio, **When** Central consulta el recorrido, **Then** puede ver la fecha/hora (y ubicación, si existe) en que el chofer inició el trayecto hacia ese punto.

---

### User Story 2 - Finalizar el recorrido de forma explícita, registrando el regreso a base (Priority: P1)

Al completar el último punto de entrega, el recorrido ya no se da por finalizado automáticamente. El chofer conserva un botón FINALIZAR que debe tocar de forma explícita cuando efectivamente termina su jornada (por ejemplo, al llegar de regreso a la base); al tocarlo, el sistema registra la fecha/hora y la ubicación GPS de ese momento como el cierre real del recorrido, y recién ahí el recorrido pasa a estado finalizado.

**Why this priority**: Es el cambio central de esta feature: hoy el recorrido se considera finalizado a nivel de datos apenas se completa el último punto, lo cual ignora el tiempo del trayecto de regreso a base. Sin este cambio no es posible medir ese tramo.

**Independent Test**: Con un recorrido donde ya se completó el último punto pendiente, se verifica que el recorrido permanece en estado activo (no finalizado) hasta que el chofer toca FINALIZAR; al tocarlo, se verifica que queda registrada la fecha/hora y ubicación de ese instante, y que el recorrido pasa a estado finalizado recién en ese momento.

**Acceptance Scenarios**:

1. **Given** que el chofer completó (DESCARGA COMPLETA) el último punto pendiente del recorrido, **When** el viaje vuelve a estado Detenido, **Then** el sistema muestra el botón FINALIZAR pero el recorrido permanece en estado activo (no finalizado) hasta que el chofer lo toque.
2. **Given** el botón FINALIZAR visible tras completar todos los puntos, **When** el chofer lo toca, **Then** el sistema registra la fecha/hora de servidor y la ubicación GPS del chofer (si está disponible) como cierre del recorrido, y el recorrido pasa a estado finalizado.
3. **Given** que el dispositivo no puede obtener ubicación GPS al tocar FINALIZAR, **When** el chofer confirma igualmente la acción, **Then** el cierre del recorrido se registra igual (con fecha/hora), indicando que la ubicación no estaba disponible, sin bloquear la finalización.
4. **Given** que el recorrido ya fue finalizado (FINALIZAR ya tocado), **When** Central consulta ese recorrido, **Then** puede ver la fecha/hora (y ubicación, si existe) de cierre, distinta y posterior a la del evento de descarga completa del último punto.

---

### User Story 3 - Ver en Central la ubicación GPS de los eventos de inicio y cierre (Priority: P2)

Central ya puede ver la fecha/hora de cuándo el chofer tocó INICIAR en cada punto y FINALIZAR el recorrido. Ahora, cuando esos eventos tengan una ubicación GPS asociada, Central también puede ver la latitud/longitud de dónde ocurrieron, con el mismo nivel de visibilidad que ya tiene para los eventos de arribo y descarga completa.

**Why this priority**: Es una mejora de visibilidad sobre datos que el sistema ya captura y guarda desde la versión original de esta feature; no cambia el comportamiento del chofer ni la lógica de estados, por eso es P2 y no P1.

**Independent Test**: Con un recorrido que tiene al menos un punto con evento de inicio registrado con ubicación GPS, y un cierre de recorrido también con ubicación GPS, se consulta el recorrido desde Central y se verifica que la latitud/longitud de ambos eventos está disponible en la respuesta, no solo la fecha/hora.

**Acceptance Scenarios**:

1. **Given** un punto con evento de inicio registrado con ubicación GPS, **When** Central consulta el recorrido (activo o en historial), **Then** puede ver la latitud/longitud de esa ubicación además de la fecha/hora.
2. **Given** un recorrido finalizado con ubicación GPS registrada en el momento del cierre, **When** Central lo consulta, **Then** puede ver la latitud/longitud del cierre además de la fecha/hora.
3. **Given** un evento de inicio o de cierre sin ubicación GPS disponible (el dispositivo no pudo obtenerla), **When** Central lo consulta, **Then** ve la fecha/hora sin coordenadas asociadas, sin error ni dato inconsistente.
4. **Given** un recorrido cuyos eventos de inicio/cierre con ubicación fueron registrados antes de esta actualización, **When** Central lo consulta después de esta actualización, **Then** también puede ver esas coordenadas, sin necesidad de que el chofer repita la acción.

---

### Edge Cases

- ¿Qué pasa si el chofer pierde conectividad justo al tocar INICIAR o FINALIZAR? La acción debe quedar encolada localmente y reintentarse automáticamente al recuperar señal, sin que el chofer deba repetirla manualmente ni pueda duplicarla (mismo mecanismo ya usado para arribo/descarga completa).
- ¿Qué pasa si el chofer completa el último punto y nunca toca FINALIZAR (por ejemplo, cierra la app)? El recorrido queda indefinidamente en estado activo, mostrando el botón FINALIZAR pendiente cada vez que el chofer reabre su enlace, hasta que efectivamente lo toque.
- ¿Qué pasa si el chofer toca INICIAR sobre el primer punto y luego CANCELAR (funcionalidad ya existente)? El evento de inicio registrado para ese punto queda descartado junto con el resto de la reversión, igual que ya ocurre con los demás datos del punto al cancelar.
- ¿Qué pasa si dos dispositivos abren el mismo enlace único? El estado de finalización del recorrido y los eventos de inicio por punto deben verse igual desde ambos, igual que ocurre hoy con el resto del estado del recorrido.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Al tocar INICIAR sobre un punto de entrega, el sistema MUST registrar la fecha/hora de servidor de ese instante como el evento de inicio de ese punto.
- **FR-002**: Al tocar INICIAR, el sistema MUST registrar además la ubicación GPS del chofer en ese instante si el dispositivo la provee; la ausencia de ubicación GPS MUST NOT bloquear el registro del evento de inicio ni el cambio de estado a Manejando.
- **FR-003**: El sistema MUST conservar el evento de inicio de cada punto (fecha/hora y ubicación si existe) de forma consultable por Central, igual que ya ocurre con los eventos de arribo y descarga completa.
- **FR-004**: El sistema MUST dejar de derivar automáticamente el estado "finalizado" de un recorrido a partir de que todos sus puntos estén en estado completado; el recorrido MUST permanecer en estado activo tras completarse el último punto, hasta que ocurra el evento explícito de FINALIZAR.
- **FR-005**: Al tocar FINALIZAR, el sistema MUST registrar la fecha/hora de servidor de ese instante como el evento de cierre del recorrido.
- **FR-006**: Al tocar FINALIZAR, el sistema MUST registrar además la ubicación GPS del chofer en ese instante si el dispositivo la provee; la ausencia de ubicación GPS MUST NOT bloquear el registro del evento de cierre ni el cambio de estado del recorrido a finalizado.
- **FR-007**: El sistema MUST cambiar el estado del recorrido a finalizado únicamente como consecuencia de que el chofer toque FINALIZAR, y no por ninguna otra condición automática.
- **FR-008**: El botón FINALIZAR MUST seguir mostrándose únicamente cuando el estado de viaje sea Detenido y no queden puntos pendientes, igual que en el comportamiento ya existente.
- **FR-009**: Las acciones de INICIAR y FINALIZAR realizadas sin conectividad MUST quedar encoladas localmente y reintentarse automáticamente al recuperar conexión, sin duplicarse ni perderse, siguiendo el mismo mecanismo ya usado para arribo/descarga completa.
- **FR-010**: El sistema MUST sincronizar hacia Central, en tiempo (casi) real, el nuevo estado de finalización del recorrido y los eventos de inicio por punto, de modo que Central pueda ver reflejado el tiempo transcurrido entre la descarga completa del último punto y el cierre efectivo del recorrido (tiempo de regreso a base).
- **FR-011**: El sistema MUST exponer a Central la latitud/longitud del evento de inicio de cada punto cuando estén disponibles, con el mismo nivel de visibilidad con el que ya expone las de los eventos de arribo y descarga completa.
- **FR-012**: El sistema MUST exponer a Central la latitud/longitud del evento de cierre del recorrido cuando estén disponibles, con el mismo nivel de visibilidad con el que ya expone las de los eventos de arribo y descarga completa.
- **FR-013**: La ausencia de ubicación GPS en un evento de inicio o cierre ya registrado MUST seguir representándose como dato faltante (sin coordenadas), sin bloquear ni alterar la consulta del resto del recorrido por parte de Central.

### Key Entities

- **Evento de inicio (por punto)**: Marca de tiempo de servidor y ubicación GPS opcional del chofer en el instante en que se tocó INICIAR sobre ese punto; se agrega a los eventos ya existentes de arribo y descarga completa de cada punto de entrega. Tanto la fecha/hora como la latitud/longitud (si existe) son consultables por Central.
- **Evento de cierre de recorrido**: Marca de tiempo de servidor y ubicación GPS opcional del chofer en el instante en que se tocó FINALIZAR; determina la transición del recorrido a estado finalizado y reemplaza la derivación automática anterior basada únicamente en el estado de los puntos. Tanto la fecha/hora como la latitud/longitud (si existe) son consultables por Central.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para el 100% de los puntos de entrega iniciados, queda registrada una fecha/hora de inicio verificable, con ubicación GPS asociada en los casos en que el dispositivo la proveyó.
- **SC-002**: Para el 100% de los recorridos completados, el cierre (estado finalizado) ocurre únicamente tras una acción explícita del chofer, nunca antes de que toque FINALIZAR.
- **SC-003**: Central puede calcular, para cualquier recorrido finalizado, el tiempo transcurrido entre la descarga completa del último punto y el cierre del recorrido, sin necesidad de cálculos externos al sistema.
- **SC-004**: El chofer puede finalizar su recorrido con un único toque adicional sobre FINALIZAR, sin pasos ni pantallas intermedias, igual que en el flujo ya existente.
- **SC-005**: Para el 100% de los eventos de inicio y cierre que tienen ubicación GPS registrada, Central puede ver su latitud/longitud sin necesidad de otra fuente de datos ni de cálculos externos.

## Assumptions

- Esta especificación extiende el flujo de estados de viaje ya definido en la feature 005 (Detenido/Manejando/Descargando, INICIAR/LLEGUE/DESCARGA COMPLETA/FINALIZAR); no introduce nuevos botones ni nuevos estados de viaje, solo agrega registro de fecha/hora/ubicación a INICIAR y convierte la derivación automática de "finalizado" en una transición explícita disparada por FINALIZAR.
- El evento de cierre de recorrido (FINALIZAR) se registra sobre el recorrido en su conjunto, no sobre un punto de entrega en particular; no se modela un "punto base" como entidad de datos en esta especificación, ya que no fue solicitado.
- El mecanismo de cola offline y reintento ya definido en las features 001 y 007 se reutiliza sin cambios de diseño para las acciones INICIAR y FINALIZAR.
- No se agrega validación de geocerca (radio permitido) alrededor de la base al tocar FINALIZAR; se registra la ubicación reportada por el dispositivo sin bloquear la acción, consistente con el criterio ya usado para arribo/descarga completa.
- (User Story 3) La captura y guardado de la ubicación GPS de INICIAR/FINALIZAR ya existe desde la versión original de esta feature (FR-002, FR-006); esta extensión no cambia esa captura, solo agrega su exposición hacia Central, revirtiendo la Decisión 4 documentada en `research.md` a la luz del precedente sentado después por la feature 009 (que sí expone `arriboLat`/`arriboLon`/`descargaLat`/`descargaLon`).
- (User Story 3) No se requiere ninguna acción del chofer ni reprocesamiento de recorridos ya finalizados: las coordenadas ya guardadas en el store para recorridos previos quedan disponibles automáticamente al exponerse el campo.
