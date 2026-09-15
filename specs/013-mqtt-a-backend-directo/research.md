# Research: Reporte de ubicación directo al backend (broker opcional)

No quedaron `NEEDS CLARIFICATION` en el Technical Context del plan — el
contexto se investigó a fondo antes de escribir el spec y durante la
planificación (lectura directa de `ubicacionPeriodica.js`, `ubicacionMqtt.js`,
`mqttBridge.js`, `integracionStore.js`, `ubicacionEnMemoria.js`,
`recorrido.js`, `integracion.js`, y el paquete `central/` completo). Este
documento consolida las decisiones tomadas.

## Decisión 1 — Un solo flag de configuración server-side, cero cambios en la app del chofer

**Decisión**: Un nuevo helper `backend/src/config/ubicacionCanal.js` lee
`UBICACION_CANAL_PREFERIDO` (`"directo"` por defecto — cualquier valor
ausente o distinto de `"broker"` cae a `"directo"`; `"broker"` restaura el
comportamiento actual sin cambios). `mqttConfigPara(choferId)` en
`recorrido.js` devuelve `null` inmediatamente cuando el canal preferido no
es `"broker"`, antes de evaluar `EMQX_WSS_URL`/`choferId`.

**Rationale**: El frontend del chofer (`ubicacionMqtt.js`,
`createPublisherUbicacionMqtt`) ya trata `mqttConfig == null` (o sin `.url`)
como "no publicar por MQTT" y devuelve un publisher no-op cuyo `publicar()`
resuelve `false` — `ubicacionPeriodica.js` ya cae al POST REST cuando eso
pasa. Es decir: el mecanismo de fallback que hoy existe para "no hay
credencial todavía" es exactamente el mecanismo que necesitamos para "el
modo preferido es directo". Reusarlo cumple FR-002/FR-005/FR-006/FR-007 sin
tocar una sola línea de `frontend/`, con el footprint mínimo que exige el
Principio VII de la constitución.

**Alternativas consideradas**:
- *Flag leído también en el frontend (`VITE_UBICACION_CANAL_PREFERIDO`)*:
  descartada — violaría FR-005 (requeriría rebuildear/redistribuir la app
  del chofer para cambiar el modo) y duplicaría la fuente de verdad del
  modo en dos lugares (build-time frontend + runtime backend).
- *Flag booleano simple (`UBICACION_PREFERIR_BROKER=true/false`)*:
  considerada válida y más simple todavía, pero se prefirió un string
  enumerado (`"directo"|"broker"`) porque es más legible en logs/config de
  Fly.io y dejar la puerta abierta a un tercer modo futuro no cuesta nada
  hoy (sin sobre-diseñar: no se agrega ningún modo extra en esta feature).

## Decisión 2 — Retirar `ubicacionEnMemoria.js`, escribir directo en `integracionStore`

**Decisión**: `POST /:token/ubicacion` deja de escribir en el store
huérfano `ubicacionEnMemoria.js` y en su lugar llama al mismo método que ya
usa el bridge MQTT — `integracionStore.actualizarUbicacionPorChofer(choferId,
{ lat, lon, en })` — usando el `choferId` que ya resuelve
`repository.obtenerPorToken(token)` en ese mismo handler. Si el recorrido
no tiene `choferId` todavía, el reporte se descarta silenciosamente (mismo
criterio best-effort que ya aplica hoy a este dato efímero) pero la
respuesta HTTP sigue siendo `200 { ok: true }` — no es un error del
cliente. El módulo `ubicacionEnMemoria.js` y su test unitario dedicado se
eliminan.

**Rationale**: Es el hallazgo central de esta investigación — hoy
`POST /:token/ubicacion` (el fallback REST ya existente) escribe en un
`Map` que **ningún** camino de lectura de Central consulta en producción.
`server.js` pasa `ubicacionStore` como `undefined` a `createApp`, así que
`createRecorridoRouter` usa su default (`ubicacionEnMemoriaCompartida`), un
store completamente aislado del `integracionStore` que sí lee Central (`GET
/api/central/recorridos/activos` → `listarEstado` → `resolverUbicacion`
sobre `recorrido.ultimaUbicacion`, poblado solo por
`actualizarUbicacionPorChofer`). Sin este fix, FR-003 (Central debe ver la
posición igual de bien en modo directo) sería falso: el "modo directo" ya
existe en el código de hoy como fallback silencioso, pero nunca llegó a
Central. Sin este fix, invertir la preferencia a "directo por defecto"
literalmente apagaría el mapa en vivo de Central en vez de mantenerlo.
Reusar `actualizarUbicacionPorChofer` (en vez de escribir a ambos stores)
respeta el Principio VII: menos código, un solo store operacional para
ubicación en vivo, consistente con cómo ya lo describe el propio comentario
histórico de `ubicacionEnMemoria.js`.

**Alternativas consideradas**:
- *Mantener `ubicacionEnMemoria.js` y además escribir en `integracionStore`
  (doble escritura)*: descartada — ningún caso de uso reintroducido
  necesita el store viejo (nada en producción lee `.obtener()`, solo tests
  unitarios propios del módulo); mantenerlo sería complejidad sin
  beneficio, exactamente lo que esta feature busca reducir.
- *Pasar `integracionStore` como el parámetro `ubicacionStore` de
  `createRecorridoRouter` sin tocar el handler*: descartada — el contrato
  de `ubicacionStore.registrar(recorridoId, {...})` está indexado por
  `recorridoId`, no por `choferId`; `actualizarUbicacionPorChofer` necesita
  `choferId` (mismo identificador que ya usa el bridge MQTT). Cambiar el
  handler para resolver `choferId` desde el `recorrido` ya obtenido es más
  directo que introducir una capa de adaptación entre las dos formas.

## Decisión 3 — `central/` no requiere ningún cambio de código

**Decisión**: El paquete `central/` (frontend de escritorio, package
`vickytruck-frontend-central`) no se modifica en esta feature.

**Rationale**: Durante la investigación se encontró que `central/` tiene su
**propia** suscripción MQTT directa desde el navegador
(`central/src/services/mqttClient.js`, `conectarUbicacionEnTiempoReal`),
independiente del bridge del backend — usada para actualizar el mapa en
vivo por push (`aplicarUbicacionViva`) y para un badge de estado en
`AppShell.jsx` ("Canal tiempo real MQTT: conectado/…"), con polling REST
como respaldo a distinta cadencia según ese estado. Esta suscripción ya
maneja "sin broker configurado" (`VITE_MQTT_BROKER_URL` sin setear) como
estado `"disabled"` — el badge simplemente no se muestra y el polling usa
la cadencia rápida de respaldo (`INTERVALO_POLLING_RESPALDO_MS`). Es decir:
el mismo patrón de "opcional por configuración, sin código nuevo" que ya
decidimos para el backend/chofer (Decisión 1) ya está soportado en
`central/` — alcanza con no configurar `VITE_MQTT_BROKER_URL` en el build
de Central cuando el sistema opera en modo directo, y su polling REST
(alimentado correctamente gracias a la Decisión 2) sigue mostrando
posiciones actualizadas sin degradación.

**Hallazgo colateral, fuera de alcance de esta feature**: el matching de
`aplicarUbicacionViva` en `central/src/main.jsx` compara
`evento.fleteId` contra `r.flete?.id`, pero el payload MQTT que publican
tanto `ubicacionMqtt.js` (chofer) como `mqttBridge.js` (backend) desde la
migración 012-ubicacion-por-chofer (2026-08-21) ya no incluye `fleteId`,
solo `choferId`. Esto sugiere que el push en tiempo real de Central vía
MQTT directo ya está silenciosamente roto desde esa fecha (el badge puede
mostrar "conectado" sin que ningún evento actualice el mapa; el polling de
respaldo sigue funcionando y evita que sea un problema visible). Es un bug
preexistente, independiente de esta migración — no se corrige acá porque
no forma parte del alcance de FR-004 (que exige mantener el broker
"igual de funcional que hoy", no mejorarlo), pero se documenta para
seguimiento aparte.

**Alternativas consideradas**:
- *Actualizar `mqttClient.js`/`main.jsx` para matchear por `choferId`*:
  fuera de alcance — es un fix de un bug preexistente no relacionado con
  "directo vs. broker", se sugiere como tarea separada.
- *Apagar explícitamente la suscripción MQTT de Central con código nuevo
  según el modo activo*: descartada — redundante, ya se logra sin código
  vía `VITE_MQTT_BROKER_URL` sin configurar (mismo mecanismo que ya existe).

## Decisión 4 — Endpoint de estado: agregar `canalPreferido`, sin contadores nuevos

**Decisión**: `GET /api/integracion/mqtt/estado` agrega un campo
`canalPreferido: "directo" | "broker"`, siempre presente (incluso con
`habilitado: false`), reflejando el mismo helper de la Decisión 1. No se
agregan contadores de actividad para el canal directo (recibidos/procesados/etc.).

**Rationale**: Resuelve FR-009/FR-010 exactamente como se acordó en la
sesión de clarificación del spec: la evidencia de actividad del canal
directo es la última ubicación conocida por chofer (ya expuesta a Central
gracias a la Decisión 2), no un contador agregado nuevo. El campo
`canalPreferido` es lo mínimo necesario para que alguien consultando este
endpoint distinga "el broker está inactivo porque el sistema prefiere
directo" (`canalPreferido: "directo"`, aunque `habilitado`/`conectado`
puedan ser `true` si el bridge igual está suscripto) de "el broker debería
estar recibiendo mensajes pero no lo hace" (`canalPreferido: "broker"` con
`conectado: false` o `recibidos` estancado).

**Alternativas consideradas**:
- *No tocar este endpoint, dejar que el operador infiera el modo de otra
  forma (variable de entorno visible solo en el panel de Fly.io)*:
  descartada — viola FR-009 explícitamente (la funcionalidad existente debe
  seguir indicando esto desde dentro del propio sistema, sin depender de
  una consola externa de infraestructura).
- *Agregar contadores de mensajes recibidos/procesados/descartados también
  para el canal directo*: descartada explícitamente en la sesión de
  clarificación del spec (respuesta recomendada y aceptada: reusar última
  ubicación conocida, sin contadores dedicados nuevos).
