# Research: Entrega de Recorrido y Token de Bróker para Frontend Desplegado en la Nube

## 1. Cómo embeber el payload en el enlace sin llamadas de red

**Decision**: El payload (mismo JSON que hoy devuelve `GET /api/recorridos/:token`:
`recorrido.mqtt` + `progreso` + `puntos`) se serializa a JSON compacto, se codifica en
Base64URL y se coloca en el **fragmento** (`#...`) de la URL del frontend, no en el path ni en
la query string: `https://<frontend>/#/r/<payload-base64url>`.

**Rationale**: El fragmento de una URL nunca se envía al servidor en la petición HTTP (ni
siquiera al hosting estático de Cloudflare que sirve el `index.html`/JS) — solo es visible para
JavaScript en el navegador vía `window.location.hash`. Esto cumple FR-002a al pie de la letra:
"abrir el enlace y mostrar el recorrido completo... sin que la app realice ninguna llamada de
red adicional para obtenerlos". Además, al no llegar nunca a ningún servidor, el payload no
queda en logs de acceso de Cloudflare ni de ningún proxy intermedio (refuerza FR-009,
confidencialidad).

**Alternatives considered**:
- **Query string** (`?payload=...`): rechazada — sí se envía al servidor (queda en logs de
  acceso del hosting), violando el espíritu de FR-009 y agregando una superficie de fuga
  innecesaria (Principio VII).
- **Token corto + resolución vía bróker** (la app conecta al bróker y pide el payload usando
  solo un identificador del enlace): rechazada por decisión explícita del usuario en la
  clarificación de `spec.md` (prioriza cero llamadas de red sobre enlaces más cortos); además
  agrega un patrón de mensajería request/response sobre un canal hoy solo pub/sub (complejidad
  adicional no justificada, Principio VII).

**Tamaño del enlace**: con 10 puntos (máximo, Principio II) de ~120–150 bytes JSON cada uno más
~250 bytes de configuración MQTT y progreso, el JSON crudo ronda 1.5–1.8 KB → ~2.1–2.5 KB en
Base64URL. Muy por debajo de los límites prácticos de navegadores modernos (~64 KB o más) y de
lo que WhatsApp transporta sin problema en un mensaje de texto con un enlace.

## 2. Confidencialidad del token en tránsito (FR-009)

**Decision**: Se apoya en dos capas ya existentes, sin agregar cifrado propio:
1. **HTTPS end-to-end** entre el navegador del chofer y el hosting del frontend (Cloudflare
   Pages/Workers sirve HTTPS por defecto) — protege el enlace mientras viaja como URL completa
   si el chofer lo abre desde un enlace HTTPS.
2. **Cifrado de extremo a extremo de WhatsApp** para el contenido del mensaje que transporta el
   enlace — cubre el tramo Central → chofer.

Como refuerzo operativo (no criptográfico) del riesgo de reenvío del enlace, ya cubierto por la
Clarification 3 de `spec.md`, el token de publicación queda atado al primer dispositivo (ver
§3): aunque el enlace se filtre, solo puede *publicar* desde él el primer dispositivo que lo
haya usado.

**Constraint operativa a respetar en la implementación**: ningún sistema de logging/analytics
del frontend (ni de terceros, ej. un error tracker) debe registrar `window.location.href` u
`window.location.hash` completos, para no filtrar el payload+token embebido por un canal
lateral. Se documenta como nota de implementación (`tasks.md`), no como requisito nuevo del
spec.

## 3. Mecanismo para atar el token de publicación al primer dispositivo (FR-005a)

**Decision**: Mecanismo de "detectar y expulsar" (no de "denegar antes de conectar"), construido
enteramente con lo que ya soporta el plan EMQX Cloud Serverless usado por el proyecto:

1. El frontend genera (una sola vez, primera carga) un identificador aleatorio propio
   (`deviceId`) y lo persiste en `localStorage`; lo reutiliza como `clientId` de MQTT en cada
   conexión/reconexión desde ese mismo navegador/dispositivo (`frontend/src/services/deviceId.js`).
2. El backend, además de su suscripción de servicio ya existente
   (`vickytruck/fletes/+/ubicacion`, `.../eventos`), suscribe su mismo cliente MQTT de servicio
   a los tópicos de sistema de eventos de conexión (`$SYS`/eventos de cliente conectado, con
   `clientid` y `username` del evento).
3. Al observar el primer evento de conexión para un `username` (=token) dado, el backend
   registra `{ token, clientId }` en un store efímero en memoria (`vinculoDispositivo.js`,
   mismo patrón que `ubicacionEnMemoria.js` — no persistido en Oracle, Principio VII).
4. Ante un evento de conexión posterior para el mismo `username` con un `clientId` distinto al
   registrado, el backend expulsa esa sesión llamando a la API REST de EMQX Cloud ya usada por
   `emqxProvisioning.js` (mismo host/credenciales de administración) para desconectar ese
   cliente.
5. Una reconexión legítima del mismo dispositivo (mismo `clientId` persistido) no dispara ninguna
   acción — soporta el requisito de conectividad intermitente sin fricción.

**Rationale**: Es el único mecanismo compatible con las capacidades confirmadas del plan
Serverless (ver limitación abajo). Reutiliza infraestructura ya presente (cliente MQTT de
servicio del backend, credenciales de administración de EMQX Cloud) sin introducir dependencias
nuevas.

**Limitación aceptada**: al no ser preventivo (no hay webhook de autenticación que rechace el
`CONNECT` antes de completarse), existe una ventana breve en la que un segundo dispositivo con
el token filtrado podría llegar a publicar uno o pocos mensajes antes de ser expulsado. Se
documenta como riesgo residual aceptado — coherente con el criterio de éxito **SC-005**, que se
mide como "los intentos de publicar son rechazados" en el sentido de "la sesión no persiste",
no como garantía de cero mensajes en el margen de milisegundos entre conexión y expulsión.

**Alternatives considered**:
- **Autenticación HTTP por webhook** (rechazar el `CONNECT` de un `clientId` no autorizado antes
  de que se complete): confirmado por investigación externa que **no está soportado en el plan
  EMQX Cloud Serverless** (la documentación de EMQX Cloud indica explícitamente que la
  autenticación/autorización HTTP externa no aplica a deployments Serverless — solo a
  Dedicated). Sería la opción preventiva ideal, pero requeriría migrar de plan (fuera de
  alcance de esta especificación, ver Complexity Tracking en plan.md).
- **Atar por dirección IP** (banear por IP tras el primer uso): rechazada — rompe el objetivo ya
  establecido en `003-mqtt-broker-fletes` de tolerar cambios de red (datos móviles↔wifi) del
  mismo dispositivo sin reconfiguración; una IP no identifica un dispositivo de forma estable.
- **Un solo `clientId` fijo emitido por el backend en el payload** (en vez de que el dispositivo
  genere el suyo): rechazada — si el enlace se reenvía, el segundo dispositivo tendría el mismo
  `clientId` embebido que el primero, y el mecanismo de detección no podría distinguirlos (el
  `clientId` debe nacer en el dispositivo, no viajar en el enlace).

**Fuentes**: [HTTP Authentication | EMQX Cloud Docs](https://docs.emqx.com/en/cloud/latest/deployments/http_auth.html), [Serverless Connection Guide | EMQX Cloud Docs](https://docs.emqx.com/en/cloud/latest/deployments/port_guide_serverless.html), [System Topics and Client Event Subscriptions | EMQX Cloud Docs](https://docs.emqx.com/en/cloud/latest/connect_to_deployments/sys_topics.html), [Capture Client Connection and Disconnection Event Topic Messages | EMQX Cloud Docs](https://docs.emqx.com/en/cloud/latest/best_practices/connection_disconnection_event_topic.html)

**A confirmar en implementación** (mismo criterio ya usado en `emqxProvisioning.js` para
`authId`): el nombre exacto del tópico `$SYS`/evento de conexión y el endpoint REST de
"kick"/desconexión de cliente pueden variar levemente entre versiones de EMQX Cloud; se deja
como verificación empírica contra el deployment real al implementar
`conexionWatcher.js`, ajustable por variable de entorno si hace falta (sin tocar el resto del
diseño).

## 4. Reconstrucción determinística del enlace (idempotencia de "obtener enlace")

**Decision**: `enlaceRecorrido.js` construye el enlace completo como función pura de los datos
ya existentes en Oracle para ese recorrido/token (puntos, estado) más la credencial MQTT ya
determinística (`derivarPassword`, sin cambios). Central puede pedirlo tantas veces como
necesite (US3, acceptance scenario 2) y siempre obtiene el mismo enlace mientras el recorrido no
cambie, sin necesidad de guardar el enlace en ningún lado.

**Rationale**: Mismo principio de simplicidad ya aplicado en `emqxProvisioning.js`
(`derivarPassword` es determinística "para no depender de cachear nada", ver comentario
original) — se extiende naturalmente al enlace completo.

## 5. Hosting del frontend en Cloudflare

**Decision**: Sin investigación adicional — `frontend/wrangler.jsonc` ya está configurado como
sitio de assets estáticos con fallback de SPA (`not_found_handling:
"single-page-application"`), que es exactamente lo que necesita esta funcionalidad (todas las
rutas devuelven el mismo `index.html`, y el ruteo real ocurre client-side leyendo el fragmento
de la URL). No se requiere ningún cambio de configuración de despliegue para esta feature.
