# Phase 0 Research: Transporte de Ubicación y Acciones vía Bróker MQTT en la Nube

## 1. Librería MQTT a usar en los tres componentes

**Decision**: `mqtt` (mqtt.js) en `backend/` (Node.js, `mqtts://`), `frontend/` y
`central/` (navegador, `wss://`).

**Rationale**: es la única librería que funciona igual de bien en Node.js (TCP/TLS
nativo) y en el navegador (MQTT-sobre-WebSocket) sin cambiar de API, lo que evita
depender de dos librerías distintas para el mismo protocolo (Principio VII). Es la
librería de referencia del ecosistema MQTT en JavaScript y la que documentan los propios
SDK/ejemplos de EMQX Cloud para clientes web.

**Alternatives considered**:
- Un cliente MQTT distinto por entorno (p. ej. algo nativo en Node + una librería aparte
  para navegador): descartado, más superficie de dependencias sin beneficio (Principio
  VII).
- SDK propietario de EMQX: descartado, atar el código a un SDK de proveedor cuando el
  protocolo MQTT estándar con `mqtt.js` ya cubre todo lo que pide la spec (aislamiento,
  QoS, retained) sin acoplarse a una API propietaria.

## 2. Autenticación y control de acceso (ACL) en EMQX Cloud

**Decision**: Se usa el tier **Serverless** de EMQX Cloud (acorde a la escala del
proyecto — decenas de fletes simultáneos) con:
- **Autenticación** vía la base de usuarios integrada de EMQX Cloud (usuario/contraseña),
  aprovisionada dinámicamente por `backend/src/mqtt/emqxProvisioning.js` contra la API de
  administración de EMQX Cloud: un usuario MQTT por token de recorrido (`username=token`,
  contraseña generada), creado cuando Central genera el enlace único (extendiendo el flujo
  ya existente de 002 `FR-006`) y revocado cuando el recorrido finaliza o se reasigna
  (FR-008 de esta spec).
- **Autorización (ACL)** vía reglas con *placeholders* de EMQX (`${username}`): una regla
  global de tipo "permitir PUBLISH en `vickytruck/fletes/${username}/#`" cubre
  automáticamente a cualquier flete autenticado, sin necesitar una entrada de ACL por
  usuario. Un usuario de servicio fijo para `backend/` y otro para `central/` (Client
  ID conocido) reciben una regla de ACL explícita de SUBSCRIBE sobre
  `vickytruck/fletes/+/#`. Todo lo demás queda denegado por la regla por defecto
  (deny-all).

**Rationale**: se confirmó (documentación pública de EMQX Cloud, agosto 2026) que el tier
Serverless **no soporta autenticación/autorización externa** (webhooks HTTP hacia un
servidor propio, que hubiera permitido reusar directamente la validación de token ya
existente en `repository.obtenerPorToken`); sí soporta autenticación por usuario/contraseña
en su base integrada y reglas de ACL con placeholders `${username}`/`${clientid}`, que
alcanza exactamente el aislamiento por-flete exigido por FR-006 sin necesitar una entrada
de ACL manual por cada token — solo una regla de ACL global fija más una llamada a la API
de administración por cada alta/baja de token.

**Alternatives considered**:
- Autenticación JWT (plugin de JWT Auth de EMQX): permitiría credenciales de corta
  duración sin llamar a la API por cada token, pero requiere un tier superior a
  Serverless; se descarta por ahora dado el volumen bajo-moderado del proyecto
  (Scale/Scope) y para no incurrir en el costo/complejidad de un tier mayor solo por esto.
  Queda documentado como camino de mejora si el volumen crece.
- Autenticación/ACL externa vía HTTP hacia `backend/` (reusar `obtenerPorToken` tal cual):
  es la opción más simple conceptualmente, pero no está disponible en Serverless; se
  descarta por incompatibilidad de plataforma, no por preferencia de diseño.

## 3. Estructura de tópicos y calidad de entrega (QoS/retained)

**Decision**:
- `vickytruck/fletes/{token}/ubicacion` — QoS 0, **retained**. El último valor publicado
  queda disponible de inmediato para cualquier suscriptor que se conecte después (backend
  tras un reinicio, Central al abrir el panel), sin necesitar un mecanismo aparte de
  snapshot inicial vía MQTT. Pérdida tolerada (FR-012, ya aceptado en 001).
- `vickytruck/fletes/{token}/eventos` — QoS 1, **no retained** (son eventos puntuales, no
  un estado a repetir a un suscriptor tardío). El backend y Central se conectan con sesión
  persistente (`clean: false`) para que el bróker retenga los mensajes QoS1 pendientes
  mientras estén temporalmente desconectados (FR-011).

**Rationale**: el payload de ubicación ya tiene semántica de "último valor conocido"
(igual que `ubicacionEnMemoria.js` hoy), que es exactamente lo que resuelve `retained` sin
código adicional. Los eventos de arribo/descarga, en cambio, deben preservarse hasta ser
procesados exactamente una vez cada uno (ya hay lógica idempotente en
`recorridoRepository` para repeticiones, documentada en 001 research.md §6) — retenerlos
como "último mensaje" sería incorrecto semánticamente (un suscriptor nuevo no debe recibir
un "Llegué" viejo como si fuera actual), por lo que se usa QoS1 + sesión persistente en
lugar de retained.

**Alternatives considered**: QoS 2 (exactly-once) para eventos — descartado, agrega
round-trips adicionales sin necesidad real, dado que ya existe manejo idempotente de
repeticiones en el backend (mismo patrón que ya cubre reintentos duplicados del cliente
HTTP actual).

## 4. Payload de los mensajes

**Decision**: JSON plano, mismo shape que ya reciben hoy los handlers HTTP existentes:
- `ubicacion`: `{ "lat": number, "lon": number, "en": <ISO 8601> }` — igual a los
  parámetros que ya recibe `ubicacionStore.registrar(recorridoId, { lat, lon, en })`.
- `eventos`: `{ "tipo": "arribo" | "descarga", "puntoId": string, "lat": number|null,
  "lon": number|null }` — el backend sigue generando el timestamp de servidor al recibir
  el mensaje (FR-006 de 001: la marca de tiempo es la del servidor, no la del dispositivo),
  igual que hace hoy el handler HTTP.

**Rationale**: reutilizar el mismo shape minimiza el cambio en las funciones de
`recorridoRepository.js` que ya existen y ya están testeadas — el nuevo código en
`mqtt/subscriber.js` es una capa fina que traduce "mensaje MQTT recibido" a la misma
llamada de función que hoy dispara el handler HTTP, sin duplicar lógica de negocio.

## 5. Compatibilidad de la suscripción directa de Central con el embebido en Oracle APEX (Principio III)

**Decision**: la conexión WSS de `central/src/services/mqttClient.js` es una conexión
saliente iniciada por JavaScript de la propia página; no depende de cookies de terceros
ni de ser la ventana de nivel superior, por lo que es compatible con `<iframe>` por
diseño. El único riesgo real es que la página Oracle APEX contenedora (o un proxy
intermedio) tenga una Content-Security-Policy que no incluya el dominio del bróker en
`connect-src`, lo que bloquearía la conexión sin romper el resto de Central (degradación
aceptable: Central sigue funcionando vía el polling REST ya existente de 002, sin la
mejora de push directo). Se documenta como validación manual a realizar contra el entorno
APEX real durante la implementación (mismo tipo de verificación ad-hoc que ya se hizo para
el embebido general en 002).

**Rationale**: no bloquea el diseño ni exige un mecanismo alternativo — el propio diseño
de "MQTT directo es aditivo sobre polling ya existente" (ver plan.md, Structure Decision)
ya provee la degradación segura que pide el Principio III si esa conexión llegara a
fallar por CSP.

## 6. Qué NO cambia (alcance explícitamente fuera de esta feature)

- `GET /:token` sigue siendo HTTP; esta feature no toca la carga inicial del recorrido
  (Assumptions de spec.md).
- La persistencia en Oracle de los eventos de arribo/descarga sigue las mismas reglas ya
  definidas en 001 (FR-006) — solo cambia cómo el mensaje llega al backend.
- El polling REST de Central (002) no se elimina; la suscripción MQTT es aditiva.
- El elegir el tier/plan concreto de EMQX Cloud (límites exactos de conexiones/mensajes)
  y darlo de alta administrativamente es una tarea operativa fuera del código de esta
  feature, no bloquea el diseño técnico documentado aquí.
