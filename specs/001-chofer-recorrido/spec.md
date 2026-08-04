# Feature Specification: App Chofer — Recepción y Ejecución de Recorrido de Entregas

**Feature Branch**: `001-chofer-recorrido`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "App web móvil de página única para el chofer/flete — recibe una lista de entregas ordenada (máximo 10 puntos) con coordenadas lat/long; el chofer marca cuándo arriba a un destino y cuándo completa la descarga."

## Clarifications

### Session 2026-08-03

- Q: ¿El chofer debe marcar arribo/descarga en orden estricto, o puede marcar cualquier punto en cualquier momento? → A: Libre — el chofer puede marcar arribo/descarga de cualquier punto de la lista, en cualquier orden, para cubrir desvíos reales de ruta.
- Q: ¿Al marcar "arribo" se valida la ubicación GPS contra el destino (geocerca)? → A: Sin validación/bloqueo por geocerca, pero el sistema registra la ubicación GPS del dispositivo en el momento del evento (si está disponible), como dato de trazabilidad.
- Q: ¿Cómo identifica el sistema a qué chofer/flete corresponde el dispositivo? → A: Enlace único por recorrido (token en la URL) generado por Central al asignar el recorrido; sin login usuario/clave tradicional.
- Q: ¿La posición instantánea del flete durante el tránsito (no solo al marcar arribo/descarga) se persiste en Oracle o solo en memoria del backend? → A: Solo en memoria del backend, de forma efímera; Oracle únicamente recibe una ubicación cuando el chofer marca arribo y/o descarga en un punto (FR-006).
- Q: ¿Cómo accede Central a esa posición en tránsito si nunca llega a Oracle? → A: A través del mismo proceso backend Express: se expone un endpoint interno que lee la posición en tránsito desde una estructura en memoria compartida entre el router del chofer y el de Central, sin pasar por Oracle.
- Q: ¿Cada cuánto debe reportar el chofer su posición instantánea mientras el recorrido está activo? → A: A un intervalo configurable por variable de entorno del backend, con un valor por defecto largo (60 segundos), no fijado como constante rígida en la especificación.
- Q: ¿Qué pasa con las posiciones instantáneas en memoria si el backend se reinicia? → A: Se pierden sin problema; son datos efímeros y no autoritativos (Principio VII), y el chofer retoma el reporte normalmente en el siguiente ciclo tras reconectar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el recorrido asignado (Priority: P1)

Un chofer recibe de Central un enlace único correspondiente a su recorrido del día. Al abrir ese enlace en el navegador de su celular, ve de inmediato la lista completa y ordenada de los puntos de entrega (hasta 10), cada uno con su posición en la secuencia y su ubicación, sin necesidad de iniciar sesión.

**Why this priority**: Sin esto no existe app: es el requisito mínimo para que el chofer sepa qué debe entregar y dónde. Es la base sobre la que se apoyan las demás historias.

**Independent Test**: Se asigna un recorrido con N puntos (N ≤ 10) a un enlace de prueba; al abrirlo se verifica que se listan los N puntos en el orden correcto con su ubicación, sin pedir credenciales.

**Acceptance Scenarios**:

1. **Given** un recorrido de 5 puntos asignado y un enlace único generado para él, **When** el chofer abre el enlace en su celular, **Then** ve los 5 puntos listados en el orden definido por Central, cada uno con un identificador de posición (1 de 5, 2 de 5, etc.) y su ubicación.
2. **Given** un enlace único válido, **When** el chofer lo abre, **Then** la app no solicita usuario ni contraseña y muestra el recorrido directamente.
3. **Given** un enlace único que no corresponde a ningún recorrido activo (vencido, revocado o inexistente), **When** el chofer lo abre, **Then** la app muestra un mensaje claro de enlace inválido/expirado y no expone datos de otros recorridos.

---

### User Story 2 - Marcar arribo a un destino (Priority: P1)

Estando en camino, el chofer llega físicamente a uno de los puntos de entrega y lo marca como "arribado" desde la app, en el punto de la lista que corresponda (no necesariamente el primero pendiente).

**Why this priority**: Es el primer evento de estado que Central necesita ver para saber que el reparto está en curso en ese punto; es condición previa a poder cerrar la entrega.

**Independent Test**: Con un recorrido cargado, se toca "Llegué" en cualquiera de los puntos pendientes y se verifica que ese punto pasa a estado "arribado" con marca de tiempo, visible para Central, independientemente de si otros puntos anteriores de la lista siguen pendientes.

**Acceptance Scenarios**:

1. **Given** un punto en estado "pendiente", **When** el chofer toca "Llegué" en ese punto, **Then** el punto pasa a estado "arribado" registrando fecha/hora y, si el dispositivo la provee, la ubicación GPS actual del chofer.
2. **Given** un recorrido con varios puntos pendientes, **When** el chofer marca arribo en el punto 4 sin haber marcado antes el 2 o el 3, **Then** el sistema lo permite igualmente y el punto 4 queda "arribado" sin afectar el estado de los puntos 2 y 3.
3. **Given** un punto ya marcado como "arribado", **When** el chofer vuelve a esa pantalla, **Then** la app muestra el estado "arribado" (no ofrece marcar arribo de nuevo) y habilita la acción de marcar descarga completa.
4. **Given** que el dispositivo no puede obtener ubicación GPS en ese momento, **When** el chofer marca arribo, **Then** el evento se registra igual (con fecha/hora) indicando que la ubicación no estaba disponible, sin bloquear la acción.

---

### User Story 3 - Marcar descarga completada (Priority: P1)

Tras finalizar la descarga en un punto, el chofer lo marca como completado, cerrando ese punto del recorrido.

**Why this priority**: Es el evento que efectivamente cierra una entrega; junto con la Historia 2, constituye el ciclo completo de ejecución que Central necesita monitorear.

**Independent Test**: Sobre un punto en estado "arribado", se toca "Descarga completa" y se verifica que pasa a estado "completado" con marca de tiempo, y que el resto del recorrido no se ve afectado.

**Acceptance Scenarios**:

1. **Given** un punto en estado "arribado", **When** el chofer toca "Descarga completa", **Then** el punto pasa a estado "completado" registrando fecha/hora y, si está disponible, la ubicación GPS actual.
2. **Given** un punto todavía en estado "pendiente" (sin arribo marcado), **When** el chofer intenta marcar descarga completa, **Then** la app se lo impide y le indica que primero debe marcar arribo en ese punto.
3. **Given** que todos los puntos del recorrido quedaron en estado "completado", **When** el chofer marca el último, **Then** la app muestra una confirmación de recorrido finalizado.

---

### User Story 4 - Ver progreso general del recorrido (Priority: P2)

En todo momento, el chofer puede ver de un vistazo cuántos puntos de su recorrido están pendientes, arribados y completados.

**Why this priority**: Mejora la experiencia y la orientación del chofer, pero no es indispensable para que el ciclo de entrega funcione (las Historias 1–3 ya lo permiten).

**Independent Test**: Con un recorrido en estado mixto (algunos puntos pendientes, uno arribado, algunos completados), se verifica que la pantalla principal muestra un resumen numérico o visual coherente con esos estados.

**Acceptance Scenarios**:

1. **Given** un recorrido de 10 puntos con 3 completados, 1 arribado y 6 pendientes, **When** el chofer abre la app, **Then** ve un indicador de progreso que refleja esos tres conteos.

---

### Edge Cases

- ¿Qué pasa si Central reasigna o modifica el recorrido (agrega/quita un punto) mientras el chofer ya tiene algunos puntos marcados? El recorrido visible al chofer debe reflejar el cambio sin perder los estados ya registrados en los puntos no afectados.
- ¿Qué pasa si el chofer pierde conectividad justo al tocar "Llegué" o "Descarga completa"? La acción debe quedar encolada localmente y reintentarse automáticamente al recuperar señal, sin que el chofer deba repetirla manualmente ni pueda duplicarla.
- ¿Qué pasa si el chofer abre el mismo enlace único desde dos dispositivos distintos (por ejemplo, se cambia de celular)? Ambos deben ver el mismo estado del recorrido, ya que el estado vive en el servidor, no en el dispositivo.
- ¿Qué pasa si un recorrido tiene menos de 10 puntos (por ejemplo, 3)? La app debe funcionar igual, mostrando solo esos puntos.
- ¿Qué pasa si el chofer intenta marcar un evento sobre un punto que ya está "completado"? La app debe impedirlo y mostrar el estado final del punto.
- ¿Qué pasa si el backend se reinicia mientras hay recorridos activos? Las ubicaciones instantáneas en memoria (FR-014 a FR-017) se pierden sin problema, por ser un dato efímero no autoritativo; el chofer retoma el reporte periódico normalmente en el siguiente ciclo, sin necesidad de reabrir la app ni de intervención manual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST generar, por cada recorrido asignado a un flete, un enlace único (token) que identifica ese recorrido y a ese flete sin requerir usuario/contraseña.
- **FR-002**: Al abrir un enlace único válido, el sistema MUST mostrar la lista completa y ordenada (según el orden definido por Central) de los puntos de entrega del recorrido asociado, con un máximo de 10 puntos.
- **FR-003**: Cada punto de entrega mostrado MUST incluir su posición en la secuencia (ej. "3 de 10"), su ubicación (derivada de latitud/longitud) y su estado actual (pendiente, arribado, completado).
- **FR-004**: El sistema MUST permitir al chofer marcar el evento "arribo" sobre cualquier punto en estado "pendiente" de la lista, sin exigir que los puntos anteriores estén ya completados.
- **FR-005**: El sistema MUST permitir al chofer marcar el evento "descarga completa" únicamente sobre puntos que ya estén en estado "arribado".
- **FR-006**: El sistema MUST registrar, para cada evento ("arribo" y "descarga completa"), la marca de tiempo del servidor y, si el dispositivo provee una ubicación GPS en ese momento, dicha ubicación; la ausencia de ubicación GPS no MUST bloquear el registro del evento.
- **FR-007**: El sistema MUST impedir marcar "arribo" sobre un punto ya "arribado" o "completado", e impedir marcar "descarga completa" sobre un punto ya "completado" o todavía "pendiente".
- **FR-008**: El sistema MUST mostrar al chofer un resumen del progreso del recorrido (cantidad de puntos pendientes, arribados y completados).
- **FR-009**: El sistema MUST mostrar una confirmación visible al chofer cuando todos los puntos del recorrido queden en estado "completado".
- **FR-010**: El sistema MUST encolar localmente las acciones de marcado ("arribo"/"descarga completa") realizadas sin conectividad y reintentar su envío automáticamente al recuperar conexión, sin permitir que se dupliquen ni se pierdan.
- **FR-011**: El sistema MUST reflejar los estados de los puntos de forma consistente sin importar desde qué dispositivo se abra el mismo enlace único (el estado autoritativo reside en el servidor/Oracle, no en el dispositivo).
- **FR-012**: Ante un enlace único inválido, expirado o revocado, el sistema MUST mostrar un mensaje de error claro sin exponer información de otros recorridos.
- **FR-013**: Toda la interacción del chofer descrita arriba MUST ocurrir dentro de una única vista/pantalla (sin navegación multi-página).
- **FR-014**: Mientras un recorrido esté activo, el sistema MUST reportar periódicamente la ubicación GPS instantánea del chofer (más allá de los eventos de "arribo"/"descarga"), a un intervalo configurable por el operador del backend (valor por defecto: 60 segundos).
- **FR-015**: El sistema MUST mantener la ubicación instantánea reportada únicamente en memoria del backend mientras el recorrido está activo, sin persistirla en Oracle; solo la ubicación asociada a los eventos "arribo" y "descarga completa" (FR-006) se persiste en Oracle.
- **FR-016**: El sistema MUST exponer la última ubicación instantánea conocida de cada flete con recorrido activo a través de una interfaz interna del mismo proceso backend, consumible por Central, sin que esa ubicación deba pasar por Oracle.
- **FR-017**: La pérdida de las ubicaciones instantáneas en memoria ante un reinicio del backend MUST considerarse aceptable (dato efímero, no autoritativo); el sistema MUST reanudar el reporte con normalidad en el siguiente ciclo tras reconectar, sin intervención manual del chofer.

### Key Entities

- **Recorrido**: Conjunto ordenado de hasta 10 puntos de entrega asignado a un flete determinado; tiene un enlace único asociado y un estado global (activo, finalizado).
- **Punto de entrega**: Un destino dentro de un recorrido, con posición en la secuencia, ubicación (latitud/longitud), y estado (pendiente, arribado, completado), junto con las marcas de tiempo y ubicación de cada evento registrado.
- **Enlace único (token de acceso)**: Identificador que vincula un dispositivo/chofer a un recorrido específico sin autenticación tradicional; puede estar vigente, expirado o revocado.
- **Ubicación instantánea (en memoria)**: Última posición GPS reportada por un flete mientras su recorrido está activo, distinta de `arriboLat/Lon` y `descargaLat/Lon` de un punto. Vive únicamente en memoria del backend (nunca en Oracle), se sobrescribe con cada reporte periódico y se pierde sin problema si el backend se reinicia; es la fuente que consume Central para mostrar la "última ubicación conocida" del flete (Principio V).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un chofer puede abrir su enlace único y ver el recorrido completo en menos de 5 segundos desde una conexión móvil típica.
- **SC-002**: El chofer puede marcar "arribo" o "descarga completa" en un punto con una sola acción táctil (un toque) desde la vista principal, sin pasos intermedios.
- **SC-003**: El 100% de los eventos de "arribo" y "descarga completa" registrados quedan visibles para Central en menos de 10 segundos cuando hay conectividad.
- **SC-004**: Ningún evento marcado por el chofer se pierde ni se duplica al perder y recuperar conectividad durante la acción.
- **SC-005**: Un chofer nuevo, sin capacitación previa, puede completar el flujo de marcar arribo y descarga de un punto en su primer intento sin asistencia externa.

## Assumptions

- Central es responsable de generar el recorrido (hasta 10 puntos ordenados) y el enlace único, y de precargar esa información en Oracle antes de que el chofer lo reciba; esta especificación cubre solo el lado del chofer (recepción y ejecución), no la creación/asignación del recorrido.
- El servicio de mensajería interna entre Central y choferes se especifica por separado (feature independiente); esta app del chofer no incluye bandeja de mensajes en su alcance inicial.
- El enlace único no tiene fecha de expiración definida más allá del ciclo de vida del recorrido (se invalida cuando Central lo marca como finalizado/revocado); no se asume un tiempo fijo de expiración.
- El dispositivo del chofer es un smartphone con navegador moderno y, opcionalmente, GPS habilitado; no se asume conectividad continua.
- "Ubicación" mostrada al chofer por punto se deriva de las coordenadas lat/long provistas por Central (por ejemplo, mostrando una dirección aproximada o un enlace a mapa), no se asume que Central provea una dirección textual separada.
- El reporte periódico de ubicación instantánea (FR-014) es independiente del reporte de ubicación al marcar arribo/descarga (FR-006): puede implementarse con el mismo mecanismo del navegador (geolocalización best-effort), pero con su propio temporizador y su propio intervalo configurable, sin bloquear ni depender de la cola de reintento offline usada para los eventos de arribo/descarga.
- Esta especificación asume que el backend de Central (feature 002-panel-control-central) y el backend del chofer son el mismo proceso/servicio (según ya se definió en esa feature), por lo que la ubicación instantánea en memoria puede exponerse a Central sin necesitar un mecanismo de mensajería entre procesos separados.
