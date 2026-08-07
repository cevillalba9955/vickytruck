# Research: App Chofer — Información de Recorrido y Estados de Viaje Guiados

Este documento resuelve las decisiones técnicas no cerradas por la spec (que
define el QUÉ y los criterios de aceptación, no el CÓMO) y dos tensiones
reales detectadas al confrontar la spec contra el código existente.

## Decisión 1: dónde vive el estado de viaje

**Decisión**: `viajeEstado` (`detenido`/`manejando`/`descargando`),
`puntoActivoId` y `ultimaOperacion` (para CANCELAR) se agregan como campos
del **recorrido**, no del punto, en `backend/src/state/integracionStore.js`
— paralelo a como `estado` ya vive por punto pero coordinado a nivel de
recorrido completo.

**Rationale**: FR-005 a FR-013 describen un único estado de viaje por
recorrido activo (no por punto); un chofer no puede estar "Manejando" hacia
dos puntos a la vez. Vivir en el registro del recorrido evita duplicar el
dato y mantiene una sola fuente de verdad para "cuál es el punto activo".

**Alternativas consideradas**: guardar el estado de viaje en el punto activo
mismo (`punto.esActivo: true` + estado). Descartada porque obliga a buscar
"cuál punto tiene esActivo" en vez de leerlo directo, y complica CANCELAR
(que necesita revertir tanto el punto como el estado de viaje de forma
atómica).

## Decisión 2: nuevos endpoints REST `/viaje/*` en vez de reusar `/puntos/:id/arribo|descarga`

**Decisión**: se agregan endpoints nuevos bajo
`POST /api/recorridos/:token/viaje/{iniciar|llegue|descarga-completa|ir-primero|cancelar}`.
Los endpoints existentes `POST /:token/puntos/:puntoId/arribo` y `.../descarga`
(001-chofer-recorrido) **se mantienen sin cambios** en el backend — el
endpoint `llegue` internamente llama a la misma función `marcarArribo` que ya
usan, y `descarga-completa` a `marcarDescarga` — pero el frontend del chofer
deja de llamarlos directo: a partir de esta feature, el flujo guiado pasa
siempre por `/viaje/*`, que agrega el gating server-side (Decisión 7).
`FINALIZAR` (FR-013) **no necesita endpoint nuevo**: es una confirmación
puramente client-side cuando `progreso.pendientes === 0`, el mismo dato que
ya expone `GET /:token` hoy — el estado `finalizado` del recorrido sigue
derivándose como ya definía 001-chofer-recorrido.

**Rationale**: los endpoints por-punto siguen siendo válidos como primitiva
de más bajo nivel (los reusa `/viaje/llegue` y `/viaje/descarga-completa`
internamente) y no hay necesidad de romper su contrato ni los tests
existentes (`post-arribo.test.js`, `post-descarga.test.js`). Modelar
`/viaje/*` como recurso separado deja claro en la URL qué opera sobre "el
punto activo del viaje en curso" (sin `puntoId` en el body salvo en
`ir-primero`, que sí lo necesita) vs. qué opera sobre un punto arbitrario.

**Alternativas consideradas**: agregar un query param o header de "modo
guiado" a los endpoints existentes. Descartada por ser más implícita y más
difícil de testear que un recurso `/viaje/*` explícito.

## Decisión 3: el límite de CANCELAR (FR-020) se ata a si Oracle ya leyó el cambio, no a si nuestro backend ya lo aplicó

**Problema detectado**: FR-020 dice que CANCELAR deja de estar disponible
"una vez que la operación se confirmó/sincronizó **con éxito hacia el
backend/Oracle**". Pero en la arquitectura actual, nuestro backend cloud
aplica cualquier transición de forma **síncrona e inmediata** (mutación
directa sobre el `Map` en memoria, sin cola ni proceso asíncrono) — si
"confirmado hacia el backend" se interpretara como "la respuesta HTTP 200 ya
volvió", CANCELAR tendría una ventana de uso casi nula en condiciones
normales de red, lo cual contradice SC-005 ("el 100% de los toques
accidentales... pueden corregirse con CANCELAR inmediatamente después") y
las Acceptance Scenarios de la Historia 4, que asumen que CANCELAR funciona
también después de una transición ya aplicada normalmente (no solo mientras
está en tránsito).

**Decisión**: "confirmado hacia el backend/Oracle" (FR-020) se interpreta
como *"Oracle ya leyó ese cambio via `GET /api/integracion/estado`"* — el
único punto real donde Oracle se entera de algo que pasó en el cloud (ver
`integracion-api.md`, "vía polling"). Mecanismo concreto:

- Cada vez que una operación de viaje (INICIAR/LLEGUE/DESCARGA
  COMPLETA/IR PRIMERO) se aplica, el recorrido guarda
  `ultimaOperacion = { tipo, puntoId, snapshotPrevio, sincronizada: false, en }`.
- Cuando `GET /api/integracion/estado` sirve una respuesta que incluye ese
  recorrido (con o sin `recorridoId` explícito — cualquier poll de Oracle que
  lo incluya cuenta), el backend marca `ultimaOperacion.sincronizada = true`
  para ese recorrido, **después** de serializar la respuesta (Oracle ya "vio"
  ese estado).
- `POST /viaje/cancelar` solo aplica si existe `ultimaOperacion` y
  `ultimaOperacion.sincronizada === false`; revierte usando
  `snapshotPrevio` (viajeEstado + puntoActivoId + el/los campos del punto que
  cambiaron) y limpia `ultimaOperacion`.
- FR-018 (solo la última operación) se cumple porque `ultimaOperacion` se
  **reemplaza**, no se apila, en cada nueva operación.
- FR-020a (cancelar mientras está en la cola offline) sigue siendo 100%
  client-side: si la request nunca salió del dispositivo, ni siquiera llegó
  a existir del lado del backend — `offlineQueue.js` la descarta sin red.

**Por qué esto no rompe el modelo de transiciones existente**: revertir
`arribado→pendiente` o `completado→arribado` no es una transición pública
nueva del state-machine de `PUNTO_ESTADO_TRANSICION` (que sigue siendo
unidireccional, igual que documenta 001-chofer-recorrido/data-model.md) —
es una restauración interna desde un snapshot explícito, solo alcanzable
por este mecanismo acotado (última operación, no sincronizada), no una
transición general disponible en cualquier momento.

**Trade-off aceptado**: en la práctica, Oracle sondea `GET /estado` a un
intervalo propio (fuera del control de este backend); mientras ese intervalo
sea razonablemente mayor que el tiempo de reacción humano ante un toque
accidental (segundos), CANCELAR sigue siendo útil en el uso real. Si en el
futuro Oracle empieza a sondear en un intervalo muy corto, esta ventana se
angosta — aceptable por ahora (Principio VII, no se sobre-diseña para un
caso no confirmado).

## Decisión 4: el reordenamiento de IR PRIMERO debe sobrevivir al próximo push de Oracle

**Problema detectado**: `mergearPunto()` hoy sobrescribe `orden` de forma
incondicional para cualquier punto no `arribado`/`completado` en cada
`POST /api/integracion/recorridos` — si Oracle vuelve a pushear el
recorrido (con su orden original, todavía no actualizado del lado Oracle)
después de un `IR PRIMERO`, el reordenamiento del chofer se perdería
silenciosamente.

**Decisión**: mismo mecanismo de "sincronizada" de la Decisión 3.
`mergearPunto` NO sobrescribe `orden` para puntos `pendiente` mientras el
recorrido tenga `ultimaOperacion.tipo === 'ir-primero' && !sincronizada`
— conserva el orden que fijó el chofer hasta que `GET /estado` le haya dado
a Oracle la oportunidad de leerlo y (del lado Oracle/APEX, fuera de este
backend) persistirlo en `V_PUNTOS_ENTREGA` antes de su próximo push.

**Dependencia cruzada fuera de este backend**: para que el reordenamiento
sea real order autoritativo end-to-end (FR-016), el job/proceso Oracle que
hoy solo lee `estado`/`arriboEn`/`descargaEn` de `GET /estado`
(`integracion_cloud_api` del lado Oracle no lee ese endpoint hoy — es Oracle
quien lo expone vía APEX/scheduler, fuera del alcance de este repo) debe
empezar a leer también `orden` y escribirlo de vuelta en
`V_PUNTOS_ENTREGA.ORDEN`. Este plan solo puede garantizar el contrato del
lado cloud (exponer `orden` en `GET /estado`, Decisión 5); el trabajo del
lado Oracle queda anotado como dependencia externa en Complexity
Tracking/tasks, no como algo que este plan implemente.

## Decisión 5: contrato `GET /api/integracion/estado` se extiende con `orden`

**Decisión**: `serializarEstado()` en `backend/src/routes/integracion.js`
agrega `orden` a cada punto (hoy no lo expone, ver
`specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`, Endpoint 2
— solo trae `estado`/timestamps/GPS de evento). Se documenta como cambio de
contrato en `contracts/integracion-api-orden.md` de esta feature.

**Rationale**: es el único canal existente cloud→Oracle; sin esto, Oracle no
tiene forma de enterarse de que el orden cambió (Decisión 4).

## Decisión 6: `viajeEstado`/`puntoActivoId` llegan a Central por el polling existente, no por MQTT nuevo

**Decisión**: se agregan `viajeEstado` y `puntoActivoId` a
`listarActivos()`/`serializarPuntosCentral()` en `integracionStore.js`,
consumidos por Central vía el mismo polling de 5s
(`central/src/services/polling.js`) ya usado desde 002-panel-control-central
y 004-mapa-seguimiento-central.

**Rationale**: `specs/003-arquitectura-cloud-mqtt/plan.md` documenta
explícitamente que los tópicos MQTT de estado/control se diseñaron pero
nunca se implementaron ("MQTT es solo ubicación" es la convención vigente,
ver `mqtt-topics.md`), y en producción Central depende hoy 100% del polling
(el cliente MQTT de Central está implementado pero dormido, sin credenciales
configuradas). Agregar un tópico MQTT nuevo solo para esto sería la primera
ruptura de esa convención sin necesidad real: el polling de 5s ya cumple
"tiempo (casi) real" (Principio V) para este dato, igual que ya lo hace para
ubicación/progreso.

**Alternativas consideradas**: nuevo tópico MQTT `chofer/{fleteId}/estado`.
Descartada por ahora (Principio VII): no hay precedente construido, y el
polling ya cumple el requisito sin nueva infraestructura.

## Decisión 7: el gating de qué botón está disponible se aplica también server-side

**Decisión**: `POST /viaje/llegue` valida `viajeEstado === 'manejando'` antes
de aplicar `marcarArribo` sobre `puntoActivoId`; `POST /viaje/iniciar` valida
`viajeEstado === 'detenido'`; etc. — no es solo una restricción de qué
botones muestra `DeliveryPointCard.jsx`.

**Rationale**: el estado autoritativo vive en el servidor (ya establecido
por 001-chofer-recorrido); dos dispositivos abriendo el mismo enlace (edge
case ya documentado) o una acción encolada offline que se reproduce fuera de
orden podrían violar el gating si solo viviera en el cliente. Devuelve
`409 transicion_invalida` (mismo patrón que ya usan `marcarArribo`/
`marcarDescarga` hoy) cuando la operación no es válida para el
`viajeEstado` actual — el frontend ya sabe resincronizar ante un 409
(`cargarRecorrido()` en `main.jsx`).

## Decisión 8: remito_id(s) no se exponen al chofer; sí quedan disponibles para Central

**Decisión**: `remitoIds: string[]` (posiblemente vacío) se agrega a
`mergearPunto`/`upsertRecorridos`, se expone en `serializarPuntosCentral`
(Central) y en `serializarEstado` (Oracle, que ya es su origen). **Se omite
explícitamente** de `serializePunto` en `backend/src/routes/recorrido.js`
(chofer) — la única función que el frontend del chofer consume.

**Rationale**: cumple FR-003 literalmente (dato interno de Central, nunca
visible al chofer) sin necesidad de un campo "oculto" en el payload del
chofer que dependa de que el frontend simplemente no lo renderice (defensa
en profundidad: si no viaja en el payload del chofer, no hay forma de que
aparezca ahí ni por error).
