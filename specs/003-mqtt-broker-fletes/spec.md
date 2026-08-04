# Feature Specification: Transporte de Ubicación y Acciones vía Bróker MQTT en la Nube

**Feature Branch**: `003-mqtt-broker-fletes`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "broker mqtt cloud. objetivo principal: evitar publicar ip propia. los fletes publican ubicacion y acciones (Llegue y descarga completa) , backend es el unico lector"

## Clarifications

### Session 2026-08-04

- Q: ¿Quiénes pueden suscribirse (leer) los mensajes de ubicación y acciones publicados por los fletes en el bróker? → A: Tanto el backend como Central pueden suscribirse directamente al bróker; la restricción de lectura es "solo backend y Central" (los componentes propios del sistema), no "solo backend". Los fletes entre sí y cualquier otro componente externo siguen sin poder leerlos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ubicación en tránsito sin exponer direcciones de red (Priority: P1)

Mientras un flete circula con un recorrido activo, su ubicación instantánea llega a Central casi en tiempo real, sin que el backend ni Central necesiten tener una dirección IP pública alcanzable ni puertos de entrada abiertos, y sin que el dispositivo del chofer necesite aceptar conexiones entrantes de ningún tipo. Toda la comunicación de ubicación pasa a través de un intermediario de mensajería (bróker) alojado en la nube: el dispositivo del chofer solo publica hacia ese intermediario, y backend y Central solo se conectan hacia afuera para leer de él.

**Why this priority**: Es el objetivo principal declarado de la funcionalidad: eliminar la necesidad de exponer la infraestructura propia (backend) o el dispositivo del chofer a conexiones entrantes de internet para lograr visibilidad de ubicación en tiempo (casi) real. Sin esto no hay funcionalidad que entregar.

**Independent Test**: Con un recorrido activo asignado a un flete de prueba, simular movimiento del dispositivo del chofer y verificar que Central refleja la ubicación actualizada, mientras se confirma (revisando la configuración de red del backend) que no existe ningún puerto entrante abierto ni IP pública publicada para recibir esos datos directamente desde el chofer.

**Acceptance Scenarios**:

1. **Given** un flete con recorrido activo y conectividad a internet, **When** su dispositivo reporta una nueva ubicación instantánea, **Then** backend y Central la reciben a través del bróker, sin que exista una conexión directa (IP a IP) entre el dispositivo del chofer y backend o Central.
2. **Given** que el backend está correctamente conectado al bróker, **When** se revisa su configuración de red, **Then** no hay puertos entrantes abiertos ni dirección IP pública publicada específicamente para recibir ubicación o acciones de los fletes.
3. **Given** un flete cuyo dispositivo cambia de red (ej. de datos móviles a wifi, cambiando su IP), **When** continúa publicando su ubicación, **Then** el backend sigue recibiendo las actualizaciones sin ninguna reconfiguración manual ni conocimiento de la nueva IP del dispositivo.

---

### User Story 2 - Registro confiable de arribo y descarga completa (Priority: P2)

Cuando el chofer marca "Llegué" o "Descarga completa" en un punto de su recorrido, ese evento se publica hacia el mismo canal de mensajería y llega al backend de forma confiable, incluso si la conectividad del dispositivo es intermitente en el momento de marcarlo.

**Why this priority**: Estos dos eventos determinan el estado operativo de cada entrega (Principio V de la constitución); a diferencia de la ubicación instantánea, no pueden perderse silenciosamente sin afectar la trazabilidad del recorrido.

**Independent Test**: Con conectividad inestable simulada en el dispositivo del chofer, marcar "Llegué" y luego "Descarga completa" en un punto, y verificar que ambos eventos terminan siendo recibidos por el backend (con su marca de tiempo original) en cuanto la conectividad se restablece, sin intervención manual del chofer.

**Acceptance Scenarios**:

1. **Given** un punto en estado "pendiente", **When** el chofer marca "Llegué" con conectividad normal, **Then** el backend recibe el evento a través del bróker en pocos segundos y actualiza el estado del punto.
2. **Given** un punto en estado "arribado", **When** el chofer marca "Descarga completa" mientras el dispositivo no tiene conectividad momentánea, **Then** el evento se conserva localmente y se publica automáticamente en cuanto la conectividad se restablece, sin que el chofer deba repetir la acción.
3. **Given** un evento de "Llegué" o "Descarga completa" ya publicado por el chofer, **When** el backend está temporalmente desconectado del bróker, **Then** el evento no se pierde: el backend lo recibe apenas restablece su propia conexión al bróker.

---

### User Story 3 - Aislamiento entre fletes y lectura exclusiva de backend y Central (Priority: P3)

Ningún flete puede ver la ubicación ni las acciones publicadas por otro flete, y ningún componente del sistema distinto de backend y Central lee directamente los mensajes publicados en el canal de mensajería: backend y Central son los únicos suscriptores/lectores autorizados del bróker.

**Why this priority**: Es una propiedad de seguridad/privacidad necesaria para que el canal compartido en la nube no se convierta en una fuga de datos operativos o de ubicación entre fletes distintos, ni en un punto de acceso alternativo no controlado a esos datos para cualquier componente externo al sistema.

**Independent Test**: En un entorno de prueba, intentar leer el canal de un flete desde las credenciales/identidad de otro flete y confirmar que es rechazado; intentar leer el canal de cualquier flete desde una identidad que no sea la de backend o Central y confirmar que también es rechazado.

**Acceptance Scenarios**:

1. **Given** dos fletes con recorridos activos distintos, **When** el flete A intenta leer o suscribirse al canal donde publica el flete B, **Then** el sistema lo rechaza.
2. **Given** el canal de mensajería de un flete con recorrido activo, **When** un cliente que no es ni backend ni Central intenta suscribirse a él, **Then** el sistema lo rechaza.
3. **Given** un mensaje de ubicación o de acción publicado por un flete, **When** backend y Central están correctamente conectados al bróker, **Then** ambos pueden recibirlo de forma directa, sin que Central dependa de una redistribución adicional por parte del backend para conocerlo.

---

### Edge Cases

- ¿Qué pasa si el bróker en la nube no está disponible temporalmente (mantenimiento o caída del proveedor)? La publicación de ubicación instantánea se pierde para ese lapso (comportamiento ya aceptado como efímero); los eventos "Llegué"/"Descarga completa" deben quedar pendientes de reintento en el dispositivo del chofer hasta poder publicarse.
- ¿Qué pasa si el backend o Central se reinician mientras el bróker sigue activo? Cada uno debe reconectarse y reanudar la lectura automáticamente, sin requerir que los fletes reinicien su publicación ni pierdan eventos de arribo/descarga ya encolados en el bróker.
- ¿Qué pasa si un chofer abre el mismo enlace de recorrido en dos dispositivos o pestañas a la vez? Ambos pueden publicar bajo la misma identidad de recorrido; el backend procesa los eventos que reciba por orden de llegada, sin necesidad de detectar duplicados como parte de esta funcionalidad.
- ¿Qué pasa si un recorrido finaliza (todos los puntos completados) o se desasigna? El flete deja de tener motivo para publicar y su acceso al canal deja de ser necesario; no debe quedar publicando indefinidamente fuera de un recorrido activo (alineado con el Principio VII de datos mínimos).
- ¿Qué pasa si llega un mensaje de ubicación o acción que no puede asociarse a un flete/recorrido válido (ej. recorrido ya cerrado)? El backend lo descarta sin que eso interrumpa la lectura de los demás mensajes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST transmitir la ubicación instantánea del flete (ya definida en la funcionalidad de recorrido del chofer) a través de un intermediario de mensajería publicar/suscribir alojado en la nube (bróker MQTT), en lugar de una conexión directa entre el dispositivo del chofer y el backend.
- **FR-002**: El sistema MUST transmitir los eventos "Llegué" (arribo) y "Descarga completa" de cada punto de entrega a través del mismo canal de mensajería.
- **FR-003**: El sistema MUST permitir que backend y Central reciban ubicación y eventos de los fletes sin requerir una dirección IP pública ni puertos entrantes abiertos en su infraestructura; toda conexión de backend o Central hacia el bróker MUST iniciarse desde el propio componente hacia afuera.
- **FR-004**: El sistema MUST permitir que el dispositivo del chofer publique su ubicación y sus acciones sin necesidad de aceptar conexiones entrantes ni de exponer su propia dirección IP a otros participantes del sistema.
- **FR-005**: El backend y Central MUST ser los únicos componentes del sistema que leen (se suscriben a) los mensajes de ubicación y acciones publicados por los fletes; ningún otro componente MUST leerlos directamente del bróker.
- **FR-006**: El sistema MUST impedir que un flete lea o se suscriba a los mensajes publicados por otro flete distinto.
- **FR-007**: El sistema MUST poder identificar, para cada mensaje de ubicación o acción recibido, a qué flete y recorrido corresponde, de forma inequívoca.
- **FR-008**: El sistema MUST restringir la capacidad de publicar en el canal de mensajería a fletes con un recorrido activo asignado; el acceso al canal deja de ser válido cuando el recorrido correspondiente finaliza o se desasigna (consistente con el Principio VII de la constitución).
- **FR-009**: El sistema MUST proteger la confidencialidad de los mensajes de ubicación y acciones mientras viajan entre el dispositivo del chofer, el bróker, el backend y Central.
- **FR-010**: Ante pérdida temporal de conectividad del dispositivo del chofer hacia el bróker, el sistema MUST conservar localmente los eventos "Llegué" y "Descarga completa" pendientes y reintentar su publicación automáticamente al recuperar conectividad, sin bloquear la interfaz del chofer (consistente con la Restricción Técnica de conectividad intermitente de la constitución).
- **FR-011**: Ante pérdida temporal de conectividad de backend o Central hacia el bróker, el sistema MUST reanudar la lectura de mensajes automáticamente al reconectar, sin requerir intervención manual ni que los fletes repitan sus publicaciones.
- **FR-012**: La pérdida de mensajes de ubicación instantánea durante una interrupción del bróker o del backend MUST considerarse aceptable, de forma equivalente al comportamiento ya definido para la ubicación efímera en memoria; esta tolerancia NO MUST extenderse a los eventos "Llegué" y "Descarga completa", que deben preservarse hasta poder publicarse.
- **FR-013**: El sistema MUST descartar de forma silenciosa (sin interrumpir la lectura de otros mensajes) cualquier mensaje de ubicación o acción que no pueda asociarse a un flete/recorrido válido.

### Key Entities

- **Canal de mensajería del flete**: Identidad y ruta lógica dentro del bróker en la nube por la cual un flete con recorrido activo publica su ubicación instantánea y sus eventos de arribo/descarga; válida únicamente mientras el recorrido correspondiente está activo.
- **Mensaje de ubicación**: Reporte de posición GPS instantánea publicado por un flete; efímero, no autoritativo, equivalente al ya definido en la funcionalidad de recorrido del chofer, pero transmitido ahora a través del bróker.
- **Mensaje de acción**: Evento "Llegué" o "Descarga completa" publicado por un flete para un punto de entrega específico de su recorrido; debe preservarse hasta ser recibido por el backend, a diferencia del mensaje de ubicación.
- **Suscriptores autorizados (backend y Central)**: Únicos componentes del sistema autorizados a suscribirse y leer los canales de mensajería de los fletes; cada uno se conecta al bróker de forma independiente, sin que Central dependa de una redistribución previa por parte del backend.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Backend y Central reciben ubicación y acciones de los fletes sin tener configurado ningún puerto entrante abierto ni dirección IP pública dedicada a ese fin (0 puertos entrantes expuestos para este flujo, verificable en la configuración de red de ambos).
- **SC-002**: La ubicación de un flete con recorrido activo se refleja en Central dentro de un intervalo comparable al actual (equivalente al ciclo de reporte periódico ya definido), al menos el 95% de las veces bajo conectividad normal del dispositivo.
- **SC-003**: El 100% de los eventos "Llegué" y "Descarga completa" emitidos por un flete llegan finalmente al backend, incluso ante interrupciones de conectividad de hasta varios minutos, sin pérdida silenciosa.
- **SC-004**: En pruebas de aislamiento, el 0% de los intentos de un flete por leer datos de otro flete, o de un componente distinto de backend y Central por leer directamente del bróker, tiene éxito.
- **SC-005**: Al adoptar este mecanismo de transporte, no se requiere ninguna nueva regla de firewall/NAT entrante en la red donde corre el backend para recibir datos de los fletes.

## Assumptions

- Esta funcionalidad reemplaza únicamente el transporte de dos flujos ya definidos en la funcionalidad de recorrido del chofer: la ubicación instantánea (reporte periódico) y los eventos "Llegué"/"Descarga completa"; no cambia qué datos se envían, ni las reglas de persistencia en Oracle ya definidas para los eventos de arribo/descarga.
- El sentido de la comunicación cubierto por esta funcionalidad es únicamente flete → backend/Central (publicar/leer). El envío de información del backend hacia el chofer (por ejemplo, la carga inicial del recorrido o la mensajería interna de la constitución) queda fuera de alcance y sigue su mecanismo actual.
- La identidad de publicación de cada flete en el canal de mensajería está ligada al mismo enlace único de recorrido diario ya definido en la funcionalidad de recorrido del chofer (sin login adicional), y deja de ser válida cuando ese recorrido finaliza.
- Central puede suscribirse directamente al bróker para obtener ubicación y acciones de los fletes, igual que el backend; esto es adicional (no un reemplazo) al mecanismo interno ya definido en la funcionalidad de panel de control central para los datos que sí dependen del backend (ej. estado persistido en Oracle). Ningún componente distinto de backend y Central puede leer directamente del bróker.
- El proveedor del bróker en la nube es un servicio de terceros con su propia disponibilidad; una interrupción prolongada del proveedor está fuera del control de este sistema y se acepta como riesgo operativo conocido.
