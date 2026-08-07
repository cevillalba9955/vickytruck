# Feature Specification: App Chofer — Información de Recorrido y Estados de Viaje Guiados

**Feature Branch**: `005-chofer-estados-viaje`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "IU chofer, agregar informacion de recorrido: Nombre Cliente, direccion, rango horario, notas entrega. esa informacion va a ser provista por oracle en el mismo payload de sincronizar_recorrido, incluye tambien remito_id para control. Agregar estado de viaje [Manejando, Descargando, Detenido]. en modo detenido se muestra lista de puntos de entrega pendientes, el primer punto muestra boton INICIAR, los siguientes puntos muestran boton IR PRIMERO, esto le permite al chofer mover el punto al primer puesto. en modo Manejando se muestran el boton LLEGUE (solo en el primer punto) dejando los siguientes puntos de entrega desactivados y en menor tamaño para no ocupar lugar en pantalla. En modo Descargando se muestra boton DESCARGA COMPLETA. volviendo al modo Detenido. Cuando no hay mas viajes pendiente se muestra boton FINALIZAR. en cada estado agregar boton cancelar permitiendo revertir ultima operacion."

## Clarifications

### Session 2026-08-07

- Q: El botón "IR PRIMERO" mueve un punto de entrega al primer puesto. El Principio II de la constitución establece que "el orden de la lista es autoritativo y solo puede modificarse desde la Central; el chofer no puede reordenar". ¿Qué alcance tiene este reordenamiento? → A: Reordenamiento persistente — IR PRIMERO actualiza el orden autoritativo (se sincroniza hacia Oracle/Central), no solo la vista local del chofer. **Esto requiere enmendar el Principio II de la constitución** (hoy prohíbe explícitamente que el chofer reordene); ver nota en Assumptions.
- Q: El botón "CANCELAR" debe permitir "revertir la última operación". ¿Qué se revierte exactamente y hasta cuándo puede usarse? → A: Solo antes de que la operación (evento de arribo/descarga o cambio de orden) se haya confirmado/sincronizado con éxito hacia el backend/Oracle. Una vez confirmada la sincronización, CANCELAR deja de estar disponible para esa operación.
- Q: El nuevo estado de viaje (Manejando/Descargando/Detenido) ¿debe ser visible para Central en tiempo real, o es un estado local de la app del chofer? → A: Sí, se sincroniza a Central: el estado de viaje y el punto activo del chofer se ven en vivo desde Central, como dato adicional de seguimiento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver información completa del cliente y del remito en cada punto (Priority: P1)

Al abrir su recorrido, el chofer ve para cada punto de entrega, además de la ubicación, el nombre del cliente, la dirección, el rango horario acordado para la entrega, las notas de entrega dejadas por Central y el número de remito asociado, para poder identificar y controlar la entrega sin llamar a Central.

**Why this priority**: Sin esta información el chofer no puede verificar que está en el destino correcto ni controlar el remito contra la mercadería física; es la base de datos que sostiene todas las demás historias de esta feature.

**Independent Test**: Se sincroniza un recorrido con puntos que incluyen cliente, dirección, rango horario, notas y remito_id; al abrir el enlace se verifica que los 5 campos se muestran correctamente por cada punto.

**Acceptance Scenarios**:

1. **Given** un recorrido sincronizado desde Oracle con datos completos de cliente, dirección, rango horario, notas de entrega y remito_id por punto, **When** el chofer abre su enlace, **Then** ve esos cinco datos junto a cada punto de entrega.
2. **Given** un punto de entrega cuyo campo "notas de entrega" viene vacío desde Oracle, **When** el chofer lo visualiza, **Then** la app no muestra un espacio vacío confuso ni un error, sino que omite u oculta ese campo con normalidad.
3. **Given** un remito_id provisto para un punto, **When** el chofer revisa ese punto, **Then** puede leer el número de remito con claridad para contrastarlo contra la mercadería antes de descargar.

---

### User Story 2 - Operar el recorrido mediante estados de viaje guiados (Priority: P1)

En lugar de una lista donde puede marcar cualquier punto en cualquier momento, el chofer opera su recorrido a través de tres estados de viaje — Detenido, Manejando, Descargando — que lo guían paso a paso: inicia el trayecto hacia el punto activo, marca que llegó, marca que terminó de descargar, y vuelve a quedar Detenido para elegir el próximo punto. Esto reduce lo que ve en pantalla mientras conduce y evita que marque el punto equivocado.

**Why this priority**: Es el corazón de esta feature: cambia el modelo de interacción de "marcado libre" a un flujo guiado de un punto activo por vez, reduciendo distracción al volante.

**Independent Test**: Con un recorrido de varios puntos pendientes, se recorre el ciclo completo Detenido → (INICIAR) → Manejando → (LLEGUE) → Descargando → (DESCARGA COMPLETA) → Detenido sobre el primer punto, verificando en cada paso qué botones están disponibles y cuáles no.

**Acceptance Scenarios**:

1. **Given** el recorrido en estado Detenido con puntos pendientes, **When** el chofer ve la lista, **Then** el primer punto pendiente muestra el botón INICIAR y ningún otro botón de acción sobre ese punto.
2. **Given** el estado Detenido, **When** el chofer toca INICIAR sobre el primer punto, **Then** el viaje pasa a estado Manejando con ese punto como punto activo.
3. **Given** el estado Manejando, **When** el chofer ve la pantalla, **Then** solo el punto activo (primero) muestra el botón LLEGUE; los demás puntos pendientes se muestran desactivados y en tamaño reducido, sin ocupar espacio adicional en pantalla.
4. **Given** el estado Manejando con el punto activo, **When** el chofer toca LLEGUE, **Then** se registra el arribo a ese punto (fecha/hora y ubicación GPS si está disponible) y el viaje pasa a estado Descargando.
5. **Given** el estado Descargando, **When** el chofer ve la pantalla, **Then** se muestra el botón DESCARGA COMPLETA para el punto activo.
6. **Given** el estado Descargando, **When** el chofer toca DESCARGA COMPLETA, **Then** se registra la descarga completa de ese punto (fecha/hora y ubicación GPS si está disponible), el punto queda completado, y el viaje vuelve a estado Detenido.
7. **Given** el viaje en estado Detenido tras completar un punto, **When** todavía quedan puntos pendientes, **Then** la lista de pendientes se muestra nuevamente con el nuevo primer punto ofreciendo INICIAR.

---

### User Story 3 - Priorizar el próximo punto de entrega con "IR PRIMERO" (Priority: P2)

Estando en estado Detenido, si el orden físico real de la ruta no coincide con el orden original del recorrido, el chofer puede tocar "IR PRIMERO" sobre cualquier punto pendiente que no sea el primero, para que ese punto pase a ser el próximo a trabajar.

**Why this priority**: Da flexibilidad operativa ante desvíos reales de ruta sin depender de que Central reordene en el momento, pero no es indispensable para el ciclo básico de la Historia 2.

**Independent Test**: Con un recorrido de al menos 3 puntos pendientes en estado Detenido, se toca "IR PRIMERO" sobre el tercer punto y se verifica que pasa a mostrarse primero, con el botón INICIAR, mientras los demás conservan IR PRIMERO.

**Acceptance Scenarios**:

1. **Given** el estado Detenido con puntos pendientes P1, P2, P3 en ese orden, **When** el chofer toca IR PRIMERO sobre P3, **Then** P3 pasa a mostrarse primero con el botón INICIAR, y P1, P2 quedan detrás mostrando IR PRIMERO.
2. **Given** que solo queda un punto pendiente, **When** el chofer ve la lista en estado Detenido, **Then** no se ofrece IR PRIMERO (no hay otro punto al cual aplicarlo).
3. **Given** el estado Manejando o Descargando, **When** el chofer intenta acceder a IR PRIMERO, **Then** la acción no está disponible (solo aplica en Detenido).

---

### User Story 4 - Cancelar/deshacer la última operación (Priority: P2)

En cualquiera de los tres estados de viaje, el chofer cuenta con un botón CANCELAR que revierte la última operación realizada, para corregir un toque accidental sin depender de Central.

**Why this priority**: Evita que un error de un solo toque (por ejemplo, tocar LLEGUE antes de tiempo) quede irreversible desde la cabina, pero el flujo principal (Historia 2) es utilizable sin esta protección.

**Independent Test**: Estando en estado Manejando tras tocar INICIAR por error, se toca CANCELAR y se verifica que el viaje vuelve a Detenido con la lista de pendientes intacta, sin ningún evento de arribo registrado.

**Acceptance Scenarios**:

1. **Given** el viaje recién pasó de Detenido a Manejando (INICIAR), **When** el chofer toca CANCELAR, **Then** el viaje vuelve a Detenido y la lista de puntos pendientes queda como estaba antes del INICIAR.
2. **Given** el viaje recién pasó de Manejando a Descargando (LLEGUE), **When** el chofer toca CANCELAR, **Then** el viaje vuelve a Manejando sobre el mismo punto activo.
3. **Given** el viaje recién volvió a Detenido tras DESCARGA COMPLETA, **When** el chofer toca CANCELAR, **Then** el viaje vuelve a Descargando sobre ese mismo punto.
4. **Given** que el chofer ya realizó una operación posterior (por ejemplo, tocó INICIAR sobre el punto siguiente), **When** intenta cancelar la operación anterior a esa, **Then** la app no lo permite: CANCELAR solo revierte la última operación, no un historial completo.

---

### User Story 5 - Finalizar el recorrido (Priority: P3)

Cuando ya no quedan puntos de entrega pendientes, en lugar de la lista de pendientes el chofer ve un botón FINALIZAR para cerrar formalmente el recorrido.

**Why this priority**: Cierra visualmente el ciclo de trabajo del día, pero el recorrido ya queda completado a nivel de datos apenas se marca el último punto (Historia 2); esto es una confirmación explícita adicional.

**Independent Test**: Con un recorrido donde todos los puntos ya están completados, se abre la app en estado Detenido y se verifica que se muestra el botón FINALIZAR en lugar de la lista de pendientes; al tocarlo, el recorrido queda cerrado.

**Acceptance Scenarios**:

1. **Given** que el último punto pendiente se completó (DESCARGA COMPLETA), **When** el viaje vuelve a Detenido, **Then** en vez de la lista de pendientes se muestra el botón FINALIZAR.
2. **Given** el botón FINALIZAR visible, **When** el chofer lo toca, **Then** la app muestra una confirmación de recorrido finalizado.

---

### Edge Cases

- ¿Qué pasa si Central sincroniza un recorrido nuevo (`sincronizar_recorrido`) mientras el chofer ya está en estado Manejando o Descargando sobre un punto? El punto activo y su estado de viaje en curso no deben perderse ni reiniciarse por la sincronización de datos informativos (cliente/dirección/rango horario/notas/remito) de otros puntos.
- ¿Qué pasa si el recorrido llega con un solo punto pendiente? El chofer ve ese punto con INICIAR (sin IR PRIMERO, ya que no hay otro punto), y al completarlo pasa directo a FINALIZAR.
- ¿Qué pasa si dos dispositivos abren el mismo enlace único? El estado de viaje activo (Detenido/Manejando/Descargando) y el punto activo deben verse igual desde ambos, igual que hoy ocurre con el estado por punto.
- ¿Qué pasa si el chofer pierde conectividad justo al tocar LLEGUE, DESCARGA COMPLETA o CANCELAR? La acción debe comportarse igual que las acciones existentes de arribo/descarga: quedar encolada y reintentarse al recuperar señal, sin duplicarse ni perderse.
- ¿Qué pasa si el campo remito_id, notas de entrega o rango horario no vienen en el payload de `sincronizar_recorrido` para un punto? La app debe mostrar el punto igual, omitiendo con normalidad los campos ausentes, sin bloquear ninguna acción.
- ¿Qué pasa si el chofer toca CANCELAR sin ninguna operación previa que revertir (por ejemplo, recién abrió la app)? El botón no debe estar disponible o no debe tener efecto.

## Requirements *(mandatory)*

### Functional Requirements

**Información de recorrido y remito**

- **FR-001**: El sistema MUST recibir, para cada punto de entrega dentro del payload de `sincronizar_recorrido` provisto por Oracle, los campos nombre del cliente, dirección, rango horario de entrega, notas de entrega y remito_id, además de los datos ya existentes (posición, ubicación, estado).
- **FR-002**: El sistema MUST mostrar al chofer, por cada punto de entrega, el nombre del cliente, la dirección, el rango horario y las notas de entrega, de forma legible sin necesidad de navegar a otra pantalla.
- **FR-003**: El sistema MUST mostrar el remito_id de cada punto de forma que el chofer pueda contrastarlo contra la mercadería antes de marcar la descarga como completa.
- **FR-004**: Cuando alguno de los campos informativos (dirección, rango horario, notas de entrega, remito_id) no venga provisto para un punto, el sistema MUST mostrar el punto igualmente, omitiendo el campo ausente sin generar error ni bloquear ninguna acción sobre ese punto.

**Estado de viaje**

- **FR-005**: El sistema MUST mantener, para cada recorrido activo, un estado de viaje que es uno de: Detenido, Manejando, Descargando.
- **FR-006**: Mientras el estado de viaje sea Detenido y existan puntos pendientes, el sistema MUST mostrar la lista completa de puntos pendientes, en la que el primer punto muestra el botón INICIAR y cada uno de los puntos restantes muestra el botón IR PRIMERO.
- **FR-007**: Al tocar INICIAR sobre el primer punto pendiente en estado Detenido, el sistema MUST fijar ese punto como punto activo del viaje y cambiar el estado de viaje a Manejando.
- **FR-008**: Mientras el estado de viaje sea Manejando, el sistema MUST mostrar el botón LLEGUE únicamente sobre el punto activo, y MUST mostrar los demás puntos pendientes desactivados (sin acción disponible) y en un tamaño visual reducido respecto al punto activo.
- **FR-009**: Al tocar LLEGUE en estado Manejando, el sistema MUST registrar el evento de arribo sobre el punto activo (fecha/hora de servidor y ubicación GPS del chofer si está disponible, igual que el evento equivalente ya existente) y cambiar el estado de viaje a Descargando.
- **FR-010**: Mientras el estado de viaje sea Descargando, el sistema MUST mostrar el botón DESCARGA COMPLETA sobre el punto activo.
- **FR-011**: Al tocar DESCARGA COMPLETA en estado Descargando, el sistema MUST registrar el evento de descarga completa sobre el punto activo (fecha/hora de servidor y ubicación GPS del chofer si está disponible), marcar ese punto como completado, y cambiar el estado de viaje a Detenido.
- **FR-012**: Cuando el estado de viaje sea Detenido y no queden puntos pendientes en el recorrido, el sistema MUST mostrar el botón FINALIZAR en lugar de la lista de pendientes.
- **FR-013**: Al tocar FINALIZAR, el sistema MUST mostrar al chofer una confirmación visible de que el recorrido quedó finalizado.

**Reordenamiento (IR PRIMERO)**

- **FR-014**: Al tocar IR PRIMERO sobre un punto pendiente que no es el primero, estando en estado Detenido, el sistema MUST mover ese punto a la primera posición de la lista de pendientes mostrada al chofer, y MUST hacer que sea ese el punto que se activa al tocar INICIAR.
- **FR-015**: El sistema MUST ofrecer IR PRIMERO únicamente sobre puntos pendientes distintos del primero y únicamente en estado Detenido; MUST NOT ofrecerlo en Manejando ni Descargando, ni sobre el primer punto, ni cuando solo queda un punto pendiente.
- **FR-016**: El reordenamiento aplicado por IR PRIMERO MUST persistir como el nuevo orden autoritativo del recorrido (se sincroniza hacia Oracle/Central), de modo que Central vea reflejado el mismo orden que está usando el chofer. Esta capacidad requiere una enmienda previa al Principio II de la constitución del proyecto (ver Assumptions).
- **FR-016a**: Si Central modifica el orden del recorrido (agrega/quita/reordena puntos vía `sincronizar_recorrido`) mientras el chofer ya tiene un punto activo en Manejando o Descargando, el sistema MUST preservar ese punto activo y su estado de viaje en curso; el nuevo orden recibido MUST aplicarse únicamente a los puntos aún pendientes no activos.

**Cancelar / deshacer**

- **FR-017**: En cada uno de los tres estados de viaje, el sistema MUST ofrecer un botón CANCELAR que revierte la última operación realizada por el chofer (INICIAR, LLEGUE, DESCARGA COMPLETA), devolviendo el estado de viaje y el punto activo a como estaban inmediatamente antes de esa operación.
- **FR-018**: El sistema MUST limitar CANCELAR a la última operación realizada: una vez que el chofer realiza una nueva operación después de la que quiere revertir, esa operación anterior deja de poder cancelarse.
- **FR-019**: Cuando no exista ninguna operación previa que revertir, el sistema MUST deshabilitar u ocultar el botón CANCELAR.
- **FR-020**: CANCELAR solo MUST estar disponible mientras la operación que revertiría (evento de arribo, evento de descarga completa, o cambio de orden por IR PRIMERO) todavía no fue confirmada/sincronizada con éxito hacia el backend/Oracle. Una vez que esa confirmación se recibe, el sistema MUST retirar la disponibilidad de CANCELAR para esa operación (el evento ya registrado queda firme y solo puede corregirse por los medios existentes fuera de esta feature, por ejemplo intervención de Central).
- **FR-020a**: Mientras la operación a revertir todavía está en la cola de reintento offline (sin confirmar por falta de conectividad), el sistema MUST permitir CANCELAR, descartando el envío pendiente en vez de reintentarlo.

**Visibilidad para Central**

- **FR-021**: El sistema MUST sincronizar hacia Central, en tiempo (casi) real, el estado de viaje actual del chofer (Detenido, Manejando o Descargando) junto con el punto de entrega activo, para que Central pueda monitorearlo sin recargar manualmente la pantalla (consistente con el Principio V de trazabilidad).

### Key Entities

- **Punto de entrega (extendido)**: Además de los campos ya existentes (posición, ubicación, estado, marcas de arribo/descarga), incorpora nombre del cliente, dirección, rango horario de entrega, notas de entrega y remito_id, provistos por Oracle en el payload de `sincronizar_recorrido`.
- **Estado de viaje**: Estado operativo del recorrido activo desde la perspectiva del chofer, con valor Detenido, Manejando o Descargando, y una referencia al punto de entrega activo (relevante solo en Manejando/Descargando).
- **Última operación (para CANCELAR)**: Registro de la operación de estado de viaje más reciente (INICIAR, LLEGUE, DESCARGA COMPLETA o IR PRIMERO) junto con la información necesaria para revertirla; se descarta o reemplaza en cuanto ocurre una nueva operación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El chofer puede identificar el cliente, la dirección, el rango horario y el remito del punto activo sin necesidad de scrollear ni cambiar de pantalla.
- **SC-002**: El chofer completa el ciclo INICIAR → LLEGUE → DESCARGA COMPLETA de un punto con exactamente tres toques, sin pasos ni pantallas intermedias.
- **SC-003**: En estado Manejando, la pantalla muestra como máximo un botón de acción habilitado (LLEGUE) a la vez, reduciendo a cero los botones de acción sobre puntos no activos.
- **SC-004**: El chofer puede priorizar cualquier punto pendiente con IR PRIMERO y ver reflejado el cambio de orden en la lista de forma inmediata (sin recargar la página).
- **SC-005**: El 100% de los toques accidentales sobre INICIAR, LLEGUE o DESCARGA COMPLETA pueden corregirse con CANCELAR inmediatamente después, sin intervención de Central.
- **SC-006**: Cuando se completa el último punto pendiente, el botón FINALIZAR aparece automáticamente sin que el chofer deba recargar la página.

## Assumptions

- Esta especificación reemplaza, para la pantalla principal del chofer, el modelo de "marcado libre" de la feature 001 (cualquier punto pendiente puede marcarse arribo en cualquier momento) por el flujo guiado de un único punto activo por vez descrito aquí; el modelo de datos subyacente por punto (pendiente → arribado → completado) y los eventos que se persisten hacia Oracle no cambian de forma, solo cambia qué acciones ofrece la interfaz y cuándo.
- Los campos nuevos de información (cliente, dirección, rango horario, notas de entrega, remito_id) son de solo lectura para el chofer: se muestran tal como los provee Oracle, sin edición desde la app del chofer.
- El rango horario de entrega se recibe como texto/dato ya formateado desde Oracle (por ejemplo "09:00–12:00"), sin que esta app deba validar ni calcular ventanas horarias.
- FINALIZAR marca el cierre visible del recorrido para el chofer; el estado `finalizado` del recorrido a nivel de datos sigue derivándose de que todos los puntos estén `completado`, tal como ya define la feature 001.
- El límite de 10 puntos por recorrido y el resto de restricciones ya vigentes (Principio VII de datos mínimos) siguen aplicando sin cambios.
- **Conflicto con la constitución vigente (requiere enmienda antes de planificar)**: el Principio II establece hoy que "el orden de la lista es autoritativo y solo puede modificarse desde la Central; el chofer no puede reordenar ni editar los puntos". Esta especificación (FR-016) requiere que IR PRIMERO persista como cambio de orden autoritativo iniciado por el chofer, lo cual contradice esa redacción. Antes de `/speckit-plan` corresponde ejecutar `/speckit-constitution` para enmendar el Principio II (redefinición incompatible → versión MAJOR), dejando explícito que el chofer puede reordenar los puntos pendientes de su propio recorrido activo mediante IR PRIMERO, sincronizado hacia Central.
- Dado que el reordenamiento ahora se sincroniza (FR-016) y el estado de viaje se hace visible a Central (FR-021), esta feature depende de que exista o se extienda un canal de sincronización chofer→Central en (casi) tiempo real; se asume que puede apoyarse en la infraestructura de sincronización ya introducida por la feature 003 (arquitectura cloud/MQTT), sin duplicar mecanismos.
- Si Central reordena/edita el recorrido (vía `sincronizar_recorrido`) y el chofer reordenó localmente con IR PRIMERO antes de que esa sincronización se confirme, gana la última escritura confirmada (mismo criterio ya usado hoy para el estado por punto); esta especificación no define un mecanismo de fusión de conflictos más allá de eso.
