# Feature Specification: Entrega de Recorrido y Token de Bróker para Frontend Desplegado en la Nube

**Feature Branch**: `004-chofer-cloud-broker`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "desplegar frontend en cloud (por ej cloudflare) requiere establecer un mecanismo para recibir un payload con detalle de puntos de entrega, junto con token para publicar en broker, (puede ser un link enviado por whatsapp) luego toda la comunicacion es unicamente contra el broker. la aplicacion no conoce ip de servidor local"

## Clarifications

### Session 2026-08-04

- Q: ¿Cómo recibe la app del chofer el payload inicial (puntos de entrega + token de bróker) al abrir el enlace? → A: Embebido en el enlace — el enlace enviado por WhatsApp lleva el payload completo (puntos de entrega + token) codificado en la propia URL; abrirlo no requiere ninguna llamada de red a un servicio propio del backend, la app arranca directamente con esa información.
- Q: Si Central modifica el recorrido (agrega/quita un punto) mientras el chofer ya tiene la app abierta con el payload recibido, ¿cómo se entera la app del cambio? → A: No soportado — queda fuera de alcance de esta funcionalidad. Si Central necesita cambiar el recorrido de un flete que ya tiene su enlace abierto, debe finalizar/revocar el recorrido actual y generar/reenviar un enlace nuevo con el payload actualizado.
- Q: Dado que un enlace de WhatsApp puede reenviarse fácilmente a terceros, ¿qué validez debe tener el token de publicación una vez entregado? → A: Atado al primer dispositivo — el token de publicación queda vinculado al primer dispositivo desde el cual se usa para publicar en el bróker; un intento de uso del mismo token desde un dispositivo distinto se rechaza. Esto reemplaza, específicamente para el token de publicación en el bróker, el comportamiento multi-dispositivo ya definido para el enlace único en `001-chofer-recorrido` (ver Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abrir el recorrido desde un enlace sin depender de la red local (Priority: P1)

Central genera el recorrido de un flete y se lo envía por un canal externo (por ejemplo WhatsApp) como un enlace único. El chofer abre ese enlace desde su celular y ve de inmediato su recorrido completo, aunque la app esté alojada en un proveedor de hosting en la nube (por ejemplo Cloudflare) que no tiene ninguna conexión de red hacia el backend local de la empresa, ni el enlace ni la app revelan en ningún momento una dirección IP o nombre de host del servidor local.

**Why this priority**: Es el objetivo declarado de la funcionalidad: permitir que el frontend se sirva desde infraestructura pública en la nube sin exponer la red interna de la empresa. Sin este mecanismo, desplegar el frontend fuera de la red local es inviable.

**Independent Test**: Con la app del chofer desplegada en un hosting público separado de la red donde corre el backend, generar un enlace de recorrido, abrirlo desde un dispositivo fuera de la red de la empresa, y verificar que el recorrido se ve completo sin que en ningún momento la app realice ni intente una conexión directa hacia una dirección IP o nombre de host del backend local.

**Acceptance Scenarios**:

1. **Given** un recorrido asignado a un flete y su enlace único generado, **When** el chofer abre ese enlace en un dispositivo con acceso a internet pero sin acceso a la red interna de la empresa, **Then** ve la lista completa y ordenada de puntos de entrega del recorrido, igual que si estuviera dentro de la red interna.
2. **Given** la app del chofer cargada desde el hosting en la nube, **When** se inspecciona su tráfico de red durante el uso normal (carga inicial, marcado de arribo/descarga, reporte de ubicación), **Then** ninguna conexión tiene como destino una dirección IP o nombre de host del backend local; toda comunicación posterior a la carga inicial tiene como destino exclusivamente el bróker en la nube.
3. **Given** un enlace único ya utilizado por un chofer, **When** ese mismo chofer recarga la página o vuelve a abrir el enlace más tarde (mismo recorrido, todavía activo), **Then** vuelve a ver su recorrido correctamente sin degradación.

---

### User Story 2 - Publicar ubicación y acciones sin conocer la red del backend (Priority: P1)

Una vez que la app del chofer tiene el recorrido cargado y su token de publicación, todas las acciones del chofer (reportar ubicación, marcar "Llegué", marcar "Descarga completa") se envían exclusivamente al bróker en la nube usando ese token, sin que la app necesite en ningún momento la dirección del backend local.

**Why this priority**: Es la continuación operativa del objetivo de la Historia 1: no alcanza con cargar el recorrido sin exponer la red local si luego, al operar, la app necesitara hablarle directamente al backend. Ambas historias juntas cierran el objetivo completo de la funcionalidad.

**Independent Test**: Con el recorrido ya cargado en la app, marcar "Llegué" en un punto y verificar que el evento llega al backend exclusivamente a través del bróker (canal ya definido en la funcionalidad de transporte vía bróker), sin generar ninguna solicitud de red hacia el backend local desde el dispositivo del chofer.

**Acceptance Scenarios**:

1. **Given** el token de publicación recibido junto con el recorrido, **When** el chofer marca "Llegué" en un punto, **Then** el evento se publica en el bróker usando ese token, y el backend lo recibe a través de su suscripción al bróker (sin conexión directa chofer→backend).
2. **Given** el token de publicación recibido, **When** el recorrido está activo, **Then** la app reporta su ubicación periódica al bróker usando ese mismo token, sin requerir ninguna otra credencial ni endpoint adicional.
3. **Given** un token de publicación correspondiente a un recorrido ya finalizado o revocado por Central, **When** la app intenta publicar con ese token, **Then** el bróker rechaza la publicación y la app se lo indica al chofer de forma clara.

---

### User Story 3 - Generar y distribuir el enlace desde Central (Priority: P2)

Un operador de Central, al asignar o confirmar un recorrido a un flete, obtiene un enlace listo para enviar por un canal externo (por ejemplo copiarlo para pegarlo en WhatsApp), sin pasos manuales adicionales de configuración de red ni de generación de credenciales por separado.

**Why this priority**: Sin una forma simple de generar y distribuir el enlace, el mecanismo de las Historias 1 y 2 no es utilizable en la operación diaria; sin embargo, no bloquea la validación técnica del mecanismo en sí (que puede probarse con un enlace generado manualmente para pruebas).

**Independent Test**: Desde Central, asignar un recorrido a un flete y verificar que se obtiene un único enlace copiable que, al abrirse, reproduce exactamente el comportamiento validado en la Historia 1.

**Acceptance Scenarios**:

1. **Given** un recorrido recién asignado a un flete desde Central, **When** el operador solicita el enlace para ese flete, **Then** recibe un único enlace listo para copiar y enviar por el canal externo que prefiera.
2. **Given** un enlace ya generado para un recorrido, **When** el operador lo vuelve a solicitar antes de que el recorrido finalice, **Then** obtiene el mismo enlace (no se generan enlaces adicionales sin necesidad para el mismo recorrido).

---

### Edge Cases

- ¿Qué pasa si el enlace se abre desde un dispositivo sin conectividad a internet en ese momento? Como el payload viaja embebido en el propio enlace, la app puede mostrar el recorrido igualmente al abrir el archivo local del enlace; solo la publicación posterior en el bróker (ubicación, acciones) requiere conectividad, y la app debe indicar claramente que no puede publicar hasta recuperarla.
- ¿Qué pasa si el bróker en la nube no está disponible al momento de abrir el enlace o durante el uso? La app debe informar que no puede establecer comunicación en este momento y permitir reintentar, sin perder el payload ya recibido (que ya llegó embebido en el enlace, no depende del bróker para mostrarse).
- ¿Qué pasa si alguien intenta abrir el frontend en la nube directamente por su URL raíz, sin un enlace de recorrido válido? La app debe mostrar una pantalla que indique que se requiere un enlace de recorrido válido, sin exponer ni sugerir información de otros recorridos o fletes.
- ¿Qué pasa si el hosting en la nube del frontend deja de estar disponible (caída del proveedor)? El chofer no puede abrir ni continuar usando la app hasta que el proveedor se restablezca; esto es un riesgo operativo aceptado del proveedor externo, igual que ya se acepta para el bróker en la funcionalidad de transporte vía bróker.
- ¿Qué pasa si el token recibido es válido pero corresponde a un recorrido que aún no fue marcado como activo por Central? La app debe indicar que el recorrido todavía no está disponible, sin permitir publicar acciones hasta que corresponda.
- ¿Qué pasa si Central necesita modificar un recorrido (agregar/quitar un punto) después de haber enviado el enlace? No está soportado como edición en caliente: Central debe finalizar/revocar el recorrido actual (invalidando su token) y generar/reenviar un enlace nuevo con el payload actualizado; el chofer sigue usando el enlace viejo hasta ese momento sin ver el cambio.
- ¿Qué pasa si el chofer abre el mismo enlace desde un segundo dispositivo (por ejemplo, cambia de celular a mitad del recorrido)? A diferencia del enlace único general de `001-chofer-recorrido` (que permite reabrir desde cualquier dispositivo), el token de publicación en el bróker queda atado al primer dispositivo que lo usó; el segundo dispositivo puede ver el recorrido (payload embebido) pero el bróker rechaza sus intentos de publicar, y la app debe indicarlo claramente e instruir a contactar a Central para obtener un enlace de reemplazo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El frontend de la app del chofer MUST poder alojarse en un proveedor de hosting público en la nube, completamente separado de la red donde corre el backend local, sin requerir que ese hosting tenga conectividad de red hacia el backend.
- **FR-002**: El sistema MUST proveer un mecanismo para que el chofer reciba, a través de un enlace único, tanto el detalle de los puntos de entrega de su recorrido como el token necesario para publicar en el bróker en la nube.
- **FR-002a**: El payload (puntos de entrega) y el token de publicación MUST viajar embebidos en el propio enlace único; abrir el enlace y mostrar el recorrido completo MUST ser posible sin que la app realice ninguna llamada de red adicional para obtenerlos (ni al backend local ni a ningún otro servicio).
- **FR-003**: La app del chofer MUST poder mostrar el recorrido completo y comenzar a operar (publicar ubicación y acciones) sin realizar ninguna llamada de red dirigida a una dirección IP o nombre de host del backend local, en ningún momento de su ciclo de uso.
- **FR-004**: Toda comunicación de la app del chofer posterior a la recepción del enlace (publicación de ubicación, publicación de eventos "Llegué"/"Descarga completa") MUST dirigirse exclusivamente al bróker en la nube ya definido en la funcionalidad de transporte vía bróker, usando el token recibido.
- **FR-005**: El sistema MUST invalidar el token de publicación asociado a un recorrido cuando ese recorrido finaliza o es revocado por Central, consistente con la invalidación ya definida para el enlace único y para el acceso al canal del bróker.
- **FR-005a**: El sistema MUST vincular el token de publicación en el bróker al primer dispositivo desde el cual se usa para publicar; un intento de publicar en el bróker con ese mismo token desde un dispositivo distinto MUST ser rechazado, y la app MUST informarlo claramente al chofer indicando que necesita un enlace de reemplazo de Central. Esta restricción no aplica a la sola visualización del recorrido (payload embebido), que puede verse desde cualquier dispositivo que abra el enlace.
- **FR-005b**: Cuando Central necesite modificar los puntos de un recorrido cuyo enlace ya fue enviado al chofer, el sistema MUST requerir finalizar/revocar el recorrido y token actuales y generar un enlace nuevo con el payload actualizado; el sistema no MUST ofrecer edición en caliente del recorrido ya cargado en la app del chofer como parte de esta funcionalidad.
- **FR-006**: Central MUST poder obtener, para cualquier recorrido activo asignado a un flete, un único enlace listo para distribuir por un canal externo (por ejemplo WhatsApp), sin pasos de configuración manual adicionales.
- **FR-007**: El sistema MUST manejar de forma visible para el chofer los casos en que el enlace no puede resolverse (recorrido inexistente, finalizado o revocado), sin exponer información de otros recorridos o fletes.
- **FR-008**: El sistema MUST manejar de forma visible para el chofer los casos en que no hay conectividad a internet o el bróker no está disponible al momento de abrir el enlace o durante el uso, permitiendo reintentar sin perder el progreso ya registrado localmente.
- **FR-009**: El sistema MUST proteger la confidencialidad del token de publicación durante su transporte hasta el chofer, de forma consistente con la protección de confidencialidad ya exigida para los mensajes del bróker.

### Key Entities

- **Enlace de recorrido para hosting en la nube**: Enlace único distribuible por un canal externo (ej. WhatsApp) que permite a la app del chofer, alojada en un hosting público, obtener el recorrido asignado y el token de publicación sin contactar al backend local; sustituye, para el frontend desplegado en la nube, al mecanismo de carga de recorrido que hoy depende de contactar directamente al backend.
- **Token de publicación en el bróker**: Credencial asociada a un recorrido y a un flete que habilita a la app del chofer a publicar ubicación y acciones en el canal del bróker correspondiente a ese recorrido; válida mientras el recorrido esté activo y revocada cuando finaliza.
- **Payload de recorrido**: Conjunto de datos (puntos de entrega ordenados, con sus coordenadas y estado) que la app del chofer necesita para mostrar y operar el recorrido, entregado junto con el token de publicación como parte del mecanismo de esta funcionalidad.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un chofer puede abrir su enlace de recorrido desde fuera de la red interna de la empresa y ver su recorrido completo en menos de 5 segundos desde una conexión móvil típica, igual que hoy dentro de la red interna.
- **SC-002**: El 100% del tráfico de red generado por la app del chofer, desde la apertura del enlace hasta el cierre del recorrido, tiene como destino el hosting del frontend o el bróker en la nube; 0% tiene como destino una dirección IP o nombre de host del backend local.
- **SC-003**: Un operador de Central puede obtener el enlace listo para distribuir de un recorrido asignado en una sola acción, sin pasos de configuración de red manual.
- **SC-004**: El 100% de los enlaces correspondientes a recorridos finalizados o revocados dejan de permitir publicar en el bróker, verificable en pruebas de rechazo del token.
- **SC-005**: El 100% de los intentos de publicar en el bróker con un token de publicación desde un dispositivo distinto al primero que lo usó son rechazados, verificable en pruebas de rechazo por dispositivo.

## Assumptions

- Esta funcionalidad se refiere específicamente al frontend de la app del chofer/flete (single-page application definida en `001-chofer-recorrido`); el frontend de Central no cambia su modelo de despliegue como parte de esta funcionalidad.
- El backend local y Oracle continúan siendo la fuente de verdad para los recorridos y su estado (Principio IV de la constitución); esta funcionalidad no cambia dónde ni cómo se persisten los datos, solo cómo llegan el payload inicial y el token de publicación al frontend desplegado en la nube.
- El bróker en la nube y el canal de mensajería por flete/recorrido ya están definidos por la funcionalidad de transporte vía bróker (`003-mqtt-broker-fletes`); esta funcionalidad reutiliza ese mismo bróker y esos mismos canales, y no introduce un bróker o mecanismo de mensajería adicional.
- El proveedor de hosting en la nube del frontend (por ejemplo Cloudflare u otro equivalente de hosting de sitios estáticos) es una decisión de `/speckit-plan`, no de esta especificación; esta especificación solo exige que el hosting elegido no requiera conectividad hacia la red local del backend.
- El enlace único de recorrido sigue siendo generado por Central/backend (ya definido en `001-chofer-recorrido`); esta funcionalidad extiende qué información transporta ese enlace (payload y token), no quién lo genera.
- Esta funcionalidad restringe, específicamente para el token de publicación en el bróker, el comportamiento multi-dispositivo asumido en el edge case de `001-chofer-recorrido` ("qué pasa si el chofer abre el mismo enlace único desde dos dispositivos distintos"): la sola visualización del recorrido (payload embebido en el enlace) sigue funcionando desde cualquier dispositivo, pero la capacidad de publicar en el bróker (ubicación, arribo, descarga) queda atada al primer dispositivo que la usa. Un cambio de dispositivo a mitad de recorrido requiere que Central emita un enlace de reemplazo.
- Un recorrido cuyo enlace ya fue enviado no admite edición en caliente (agregar/quitar puntos) en esta funcionalidad; cualquier cambio de Central sobre un recorrido con enlace ya distribuido requiere finalizarlo/revocarlo y generar un enlace nuevo.
- El uso de WhatsApp (u otro canal externo similar) en esta funcionalidad se limita a la distribución de un enlace único de onboarding (un solo envío por recorrido, sin conversación de ida y vuelta); esto es distinto de la "mensajería interna" que exige el Principio VI de la constitución (canal propio del sistema, con mensajes asociados a un flete/recorrido y confirmación de entrega/lectura), que sigue especificándose como feature independiente y no depende de WhatsApp.
