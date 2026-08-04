# Feature Specification: Central — Panel de Control de Recorridos y Fletes

**Feature Branch**: `002-panel-control-central`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "panel de control"

## Clarifications

### Session 2026-08-03

- Q: ¿Central crea/edita los recorridos (puntos de entrega y su orden), o solo asigna a un flete recorridos que ya llegan precargados a Oracle desde otro proceso? → A: Solo asignación — los recorridos ya existen precargados en Oracle (import u otro proceso externo); Central únicamente los selecciona y asigna a un flete.
- Q: ¿La mensajería interna Central↔chofer (Principio VI) entra en el alcance de este panel? → A: Fuera de alcance — se especifica como feature independiente, tal como ya se asumió en la spec del chofer (001-chofer-recorrido).
- Q: ¿El panel permite dar de alta/editar fletes (choferes), o solo consume un listado ya existente? → A: Solo consumir listado existente — el alta/edición de fletes se gestiona fuera de este panel.

### Session 2026-08-03 (enmienda de constitución v2.0.0)

- Q: ¿Central debe seguir bloqueando/degradando su funcionalidad cuando se accede fuera de un iframe de Oracle APEX? → A: No — se elimina esa restricción (Principio III de la constitución, ahora v2.0.0). El acceso directo por URL pasa a ser un modo de uso válido y soportado, sin perder la compatibilidad con el embebido en APEX cuando corresponda.

### Session 2026-08-03 (fuente de la posición en tiempo real)

- Q: ¿La vista `V_FLETES` en Oracle incluye la última ubicación del flete, o solo datos estáticos? → A: Solo datos estáticos (identificador, nombre, etc.); `V_FLETES` no tiene ni tendrá columnas de ubicación.
- Q: Si `V_FLETES` no tiene ubicación, ¿de dónde sale entonces la "última ubicación conocida" que muestra Central (Historia 1)? → A: Principalmente de la estructura en memoria del backend compartido con la app del chofer (ver FR-014 a FR-017 de 001-chofer-recorrido, alimentada por el reporte periódico del chofer mientras el recorrido está activo). Si no hay una posición en memoria para ese flete (por ejemplo, el backend se reinició recién y todavía no llegó un nuevo reporte), Central usa como respaldo la ubicación del último evento "arribo" o "descarga" ya persistido en Oracle para el recorrido activo de ese flete.
- Q: ¿El umbral de "reciente/no reciente" (FR-014) se aplica igual a la posición en memoria y a la de respaldo en Oracle? → A: Sí, se aplica el mismo umbral configurado (`UBICACION_STALE_MS`) sin distinguir el origen del dato, para mantener una única regla simple (Principio VII).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Monitorear en vivo los recorridos activos (Priority: P1)

Un operador de Central abre el panel y ve, de un vistazo, todos los recorridos actualmente activos: para cada uno, el flete asignado, cuántos puntos están pendientes/arribados/completados, y la última ubicación conocida del flete. Esta vista se mantiene al día sin que el operador tenga que recargar la página.

**Why this priority**: Es el valor central de Central (visibilidad operativa en vivo, Principio V); sin esto el panel no cumple su propósito aunque existan otras funciones.

**Independent Test**: Con dos o más recorridos activos en distintos estados (algunos puntos completados, uno recién arribado), se abre el panel y se verifica que refleja el estado y la última ubicación de cada flete, y que un cambio de estado hecho desde la app del chofer se refleja en el panel sin recargar manualmente.

**Acceptance Scenarios**:

1. **Given** tres recorridos activos con distintos niveles de avance, **When** el operador abre el panel, **Then** ve para cada uno el flete asignado, el conteo de puntos pendientes/arribados/completados y la última ubicación reportada del flete.
2. **Given** el panel abierto y un recorrido activo, **When** el chofer marca "arribo" o "descarga completa" en un punto desde su app, **Then** el panel refleja ese cambio de estado sin que el operador recargue la página, en un tiempo acotado.
3. **Given** un flete que no ha reportado ubicación en un tiempo prolongado, **When** el operador observa ese recorrido en el panel, **Then** el panel indica visualmente que la ubicación es antigua/no reciente en lugar de mostrarla como si fuera actual.
4. **Given** un recorrido sin ningún flete asignado activo, **When** el operador consulta el panel, **Then** ese recorrido no aparece en la vista de "recorridos activos".

---

### User Story 2 - Asignar un recorrido precargado a un flete (Priority: P1)

Un operador selecciona un recorrido precargado (ya existente en Oracle, sin flete asignado) y lo asigna a un flete disponible. La asignación queda registrada de inmediato en Oracle y genera el enlace único que ese flete usará en su app.

**Why this priority**: Sin esta acción no hay recorridos activos que monitorear ni fletes operando; es la puerta de entrada de todo el ciclo operativo (Principio IV).

**Independent Test**: Con un recorrido precargado sin asignar y un flete disponible, se ejecuta la asignación desde el panel y se verifica que el recorrido pasa a estado "activo" vinculado a ese flete, con un enlace único generado, consumible por la app del chofer.

**Acceptance Scenarios**:

1. **Given** un recorrido precargado sin flete asignado, **When** el operador lo asigna a un flete disponible, **Then** el sistema persiste la asignación en Oracle de inmediato y genera un enlace único para ese recorrido/flete.
2. **Given** una asignación recién creada, **When** el operador la consulta, **Then** el panel muestra el enlace único generado, listo para ser entregado al flete.
3. **Given** un recorrido ya asignado y activo a un flete, **When** el operador intenta asignarlo nuevamente a otro flete mediante la acción de asignación simple (no la de reasignación explícita), **Then** el sistema lo impide y explica que el recorrido ya está activo.
4. **Given** un flete que ya tiene un recorrido activo en curso, **When** el operador intenta asignarle un segundo recorrido activo simultáneo, **Then** el sistema lo impide o advierte claramente antes de confirmar.

---

### User Story 3 - Ver el detalle de un recorrido (Priority: P2)

Desde la vista general, el operador entra al detalle de un recorrido puntual y ve la lista ordenada completa de sus puntos de entrega, el estado individual de cada uno y la línea de tiempo de eventos (arribo/descarga) con sus marcas de tiempo y ubicación registrada.

**Why this priority**: Aporta la información necesaria para resolver dudas puntuales o incidentes, pero el monitoreo general (Historia 1) ya cubre la visibilidad mínima operativa.

**Independent Test**: Se abre el detalle de un recorrido con puntos en distintos estados y se verifica que se listan todos en el orden correcto, con su estado y los eventos registrados (fecha/hora, ubicación si existe).

**Acceptance Scenarios**:

1. **Given** un recorrido con 6 puntos en estados mixtos, **When** el operador abre su detalle, **Then** ve los 6 puntos en el orden definido, cada uno con su estado actual y, si corresponde, fecha/hora y ubicación de sus eventos registrados.

---

### User Story 4 - Reasignar un recorrido activo a otro flete (Priority: P2)

Ante un imprevisto (por ejemplo, avería del vehículo), el operador reasigna explícitamente un recorrido activo desde el flete original a otro flete disponible, sin perder los estados ya registrados en los puntos.

**Why this priority**: Es una operación de excepción necesaria para la continuidad del reparto, pero no bloquea el uso básico del panel (Historias 1 y 2 ya dan valor sin esta función).

**Independent Test**: Con un recorrido activo con algunos puntos ya completados, se ejecuta la reasignación a otro flete y se verifica que los puntos completados conservan su estado y que el nuevo flete queda vinculado con un enlace único vigente.

**Acceptance Scenarios**:

1. **Given** un recorrido activo con 2 de 8 puntos completados, **When** el operador lo reasigna a otro flete disponible, **Then** el recorrido queda vinculado al nuevo flete, los 2 puntos completados conservan su estado, y se genera/actualiza el enlace único correspondiente al nuevo flete.
2. **Given** un recorrido recién reasignado, **When** el flete original intenta usar su enlace único anterior, **Then** el sistema ya no lo reconoce como válido para ese recorrido.

---

### User Story 5 - Consultar historial de recorridos finalizados (Priority: P3)

El operador consulta recorridos ya finalizados (todos sus puntos completados) para revisar cómo se ejecutaron, con fines de seguimiento o auditoría.

**Why this priority**: Valor de consulta/reporte posterior; no afecta la operación en curso, por lo que es la de menor prioridad.

**Independent Test**: Con al menos un recorrido finalizado, se accede a la sección de historial y se verifica que aparece con su línea de tiempo completa de eventos.

**Acceptance Scenarios**:

1. **Given** un recorrido con todos sus puntos en estado "completado", **When** el operador lo busca en el historial, **Then** lo encuentra con su línea de tiempo completa de eventos y el flete que lo ejecutó.

---

### Edge Cases

- ¿Qué pasa si dos operadores intentan asignar el mismo recorrido precargado a dos fletes distintos casi al mismo tiempo? Solo una asignación MUST prevalecer; la segunda MUST rechazarse con un mensaje claro, sin dejar el recorrido en un estado ambiguo.
- ¿Qué pasa si el panel se abre fuera del iframe de Oracle APEX (acceso directo a la URL)? MUST funcionar igual que embebido, sin bloquear ni degradar ninguna funcionalidad por esa sola razón (acceso directo es un modo de uso soportado).
- ¿Qué pasa si un flete asignado deja de reportar ubicación por mucho tiempo (GPS denegado, dispositivo apagado, o el backend se reinició y todavía no llegó un nuevo reporte)? El panel MUST intentar primero la posición en memoria del backend; si no hay ninguna, MUST usar como respaldo la ubicación del último evento arribo/descarga persistido en Oracle para ese recorrido; si tampoco existe ninguna de las dos, MUST indicar claramente que no hay ubicación disponible. En todos los casos, MUST distinguir visualmente "reciente" de "no reciente" según el mismo umbral (FR-014), sin mostrar una ubicación vieja como si fuera actual.
- ¿Qué pasa si el recorrido precargado en Oracle tiene datos inconsistentes (por ejemplo, más de 10 puntos)? El panel MUST señalarlo como no asignable en vez de permitir una asignación inválida.
- ¿Qué pasa si se reasigna un recorrido y el flete original todavía tenía acciones pendientes de sincronizar (offline)? Los eventos ya registrados en el servidor antes de la reasignación MUST conservarse; el enlace único anterior deja de ser válido para nuevas acciones.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrar, para cada recorrido activo, el flete asignado, el conteo de puntos pendientes/arribados/completados y la última ubicación conocida reportada por ese flete.
- **FR-002**: El sistema MUST actualizar la información de estado y ubicación de los recorridos activos de forma automática, sin requerir que el operador recargue manualmente la página.
- **FR-003**: El sistema MUST listar los recorridos precargados en Oracle que no tienen actualmente un flete asignado activo, como candidatos disponibles para asignación.
- **FR-004**: El sistema MUST listar los fletes existentes (según el directorio ya presente en Oracle) como candidatos disponibles para recibir una asignación.
- **FR-005**: El sistema MUST permitir al operador asignar un recorrido precargado disponible a un flete disponible, persistiendo la asignación en Oracle de inmediato antes de considerarla efectiva.
- **FR-006**: Al confirmarse una asignación, el sistema MUST generar (o exponer) el enlace único correspondiente a ese recorrido/flete, visible para el operador.
- **FR-007**: El sistema MUST impedir asignar mediante la acción de asignación simple un recorrido que ya tiene un flete activo, indicando claramente que ya está asignado.
- **FR-008**: El sistema MUST permitir al operador ver el detalle completo y ordenado de los puntos de un recorrido (asignado o no), incluyendo el estado individual de cada punto y las marcas de tiempo/ubicación de sus eventos registrados.
- **FR-009**: El sistema MUST permitir al operador reasignar explícitamente un recorrido activo a un flete distinto, conservando el estado ya registrado de los puntos e invalidando el enlace único previamente asociado al flete original.
- **FR-010**: El sistema MUST permitir al operador consultar un historial de recorridos finalizados (todos los puntos en estado "completado"), incluyendo su línea de tiempo de eventos y el flete que los ejecutó.
- **FR-011**: El sistema MUST funcionar correctamente cuando se lo embebe como iframe dentro de una página Oracle APEX, sin asumir que es la ventana de nivel superior.
- **FR-012**: El sistema MUST funcionar igual (sin bloquear, degradar ni limitar funcionalidad) cuando se accede directamente por su propia URL, fuera de cualquier iframe; el acceso directo es un modo de uso válido y soportado.
- **FR-013**: El sistema MUST resolver la identidad/sesión del operador a partir del contexto provisto por la página APEX contenedora cuando está embebido; cuando se accede directamente (sin ese contexto), MUST operar igual sin implementar un mecanismo de login propio adicional.
- **FR-014**: El sistema MUST distinguir visualmente, para cada flete monitoreado, si su última ubicación reportada es reciente o si excede un umbral de antigüedad razonable, en lugar de presentarla siempre como dato actual.
- **FR-015**: El sistema MUST evitar que dos asignaciones concurrentes sobre el mismo recorrido precargado produzcan un estado ambiguo: solo una MUST prevalecer y la otra MUST rechazarse con aviso claro.
- **FR-016**: El sistema MUST obtener la última ubicación conocida de un flete en este orden de prioridad: (1) la posición en memoria del backend compartido con la app del chofer (FR-014 a FR-017 de 001-chofer-recorrido); (2) si no hay una posición en memoria, la ubicación del último evento "arribo" o "descarga" ya persistido en Oracle para el recorrido activo de ese flete; (3) si no existe ninguna de las dos, MUST indicarlo claramente en vez de mostrar un dato inventado o vacío sin explicación.
- **FR-017**: El sistema MUST aplicar el mismo umbral de antigüedad (FR-014) para determinar si una ubicación es "reciente" o no, sin importar si proviene de la posición en memoria o del respaldo persistido en Oracle (FR-016).

### Key Entities

- **Recorrido**: Igual que en la especificación del chofer (hasta 10 puntos ordenados); desde este panel se le añade un estado de asignación (sin asignar / asignado-activo / finalizado) y, cuando corresponde, el flete que lo tiene asignado.
- **Flete (chofer)**: Entidad ya existente en el directorio de Oracle (datos estáticos: identificador, nombre); para este panel interesa además su disponibilidad para asignación (derivada de si tiene un recorrido activo). Su última ubicación conocida NO forma parte de este directorio estático: se obtiene de la "Ubicación instantánea (en memoria)" definida en 001-chofer-recorrido, con respaldo en la última ubicación de evento (arribo/descarga) persistida en Oracle cuando no hay dato en memoria (FR-016).
- **Asignación**: Vínculo entre un recorrido precargado y un flete, con fecha/hora de asignación y el enlace único generado; puede terminar por finalización del recorrido o por reasignación explícita a otro flete.
- **Punto de entrega**: Igual que en la especificación del chofer; este panel solo lo consulta (no lo crea ni edita), mostrando su posición, estado y eventos registrados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede ver el estado y la última ubicación conocida de todos los recorridos activos en menos de 5 segundos desde que abre el panel.
- **SC-002**: Un cambio de estado registrado por un chofer (arribo/descarga) se refleja en el panel en menos de 10 segundos, sin que el operador recargue la página manualmente.
- **SC-003**: Un operador puede completar la asignación de un recorrido precargado a un flete en 3 pasos o menos.
- **SC-004**: El panel funciona correctamente tanto embebido dentro de una página Oracle APEX como accedido directamente por su URL, en el 100% de las verificaciones realizadas, sin errores de bloqueo por frame ni por falta de embebido.
- **SC-005**: Ninguna asignación duplicada o inconsistente se produce cuando dos operadores intentan asignar el mismo recorrido casi simultáneamente.
- **SC-006**: Un operador sin capacitación previa puede encontrar y asignar un recorrido precargado a un flete en su primer intento sin asistencia externa.

## Assumptions

- Los recorridos precargados (puntos, orden, coordenadas) se generan e ingresan a Oracle mediante un proceso externo a este panel; Central solo los consulta y asigna, no los crea ni edita.
- La mensajería interna Central↔chofer (Principio VI) se especifica como una feature independiente, no incluida en el alcance de este panel.
- El alta y edición del directorio de fletes/choferes (datos de contacto, vehículo, etc.) se gestiona fuera de este panel; aquí solo se consume el listado ya existente para elegir a quién asignar.
- La identidad del operador dentro de Central se resuelve mediante el contexto de sesión de la página Oracle APEX contenedora cuando está embebida (Restricción Técnica de Integración APEX); cuando se accede directamente por URL no hay ese contexto ni un login propio que lo reemplace, siguiendo la misma decisión de simplicidad ya tomada para el chofer (sin sistema de cuentas). El acceso directo queda, por diseño, sin control de acceso propio de la aplicación; restringir quién puede llegar a esa URL (red, firewall, etc.) es responsabilidad de quien despliega Central, no de esta especificación.
- "Recorrido precargado disponible" se interpreta como un recorrido existente en Oracle sin flete asignado activo en este momento (nunca asignado, o cuya asignación anterior ya finalizó).
- El umbral de "ubicación no reciente" (Historia 1, FR-014) es un valor razonable por definir en la fase de planificación (por ejemplo, unos pocos minutos sin reporte), no fijado por esta especificación.
- El directorio de fletes en Oracle (`V_FLETES` u otra fuente equivalente) es puramente estático (identificador, nombre, etc.); no tiene ni tendrá columnas de ubicación. La "última ubicación conocida" que muestra Central depende del backend compartido con la app del chofer (memoria de proceso) definido en 001-chofer-recorrido, con el respaldo en Oracle descrito en FR-016. Esta especificación asume que ese backend compartido y su mecanismo en memoria ya existen (o se implementan junto con esta feature) — no se modela aquí una fuente de datos alternativa.
