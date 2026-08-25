# Research: Registro de inicio y fin de recorrido con regreso a base

No quedaron `NEEDS CLARIFICATION` en el Technical Context del plan (todo se
resolvió por precedente directo del código ya existente en 001/005). Este
documento registra las decisiones de diseño no triviales tomadas para
resolver el "cómo" a partir del "qué" de spec.md.

## Decisión 1 — Dónde vive la validación de "puede finalizar"

**Decisión**: la validación de que un recorrido puede finalizarse
(`viajeEstado === "detenido"` y todos los puntos `completado`) se hace en el
servidor, dentro del nuevo método `finalizarRecorrido` de
`integracionStore.js`, no solo en la UI.

**Rationale**: mismo criterio ya aplicado a INICIAR/LLEGUE/DESCARGA COMPLETA
en 005 (research.md de esa feature, Decisión 7: "el estado autoritativo de
qué acción es válida en cada momento vive en el servidor"). Si solo se
ocultara/mostrara el botón en el cliente, una request directa (o una acción
offline encolada que llega tarde, después de que Central reordenó/editó el
recorrido) podría finalizar un recorrido con puntos todavía pendientes.

**Alternativas consideradas**: validar solo client-side (como hace hoy
`RouteView.jsx` para decidir cuándo mostrar el botón) — rechazada por el
mismo motivo que ya rechazó esa alternativa 005: el cliente no es una fuente
confiable de verdad para gating de transiciones de estado compartido.

## Decisión 2 — Quitar la derivación automática en un solo lugar

**Decisión**: el bloque que hoy asigna `r.estado = "finalizado"`
automáticamente (`integracionStore.js:507-516`, dentro de
`transicionarPunto`) se elimina por completo, sin reemplazo condicional. Es
el único lugar de todo el backend donde se asigna `estado = "finalizado"`
(confirmado por búsqueda exhaustiva), y es compartido tanto por los
endpoints directos de 001 (`POST /puntos/:id/arribo|descarga`) como por los
guiados de 005 (`viaje/llegue`, `viaje/descarga-completa`), así que un único
cambio cubre ambos caminos sin necesidad de tocarlos por separado.

**Rationale**: mantiene el cambio mínimo (Principio VII) — no hace falta
duplicar ni parametrizar `transicionarPunto`, solo remover cinco líneas y
agregar el método nuevo `finalizarRecorrido` que es la única vía que queda
para llegar a `estado = "finalizado"`.

**Alternativas consideradas**: dejar la derivación automática como
"finalización de datos" separada de un flag adicional visible solo para
Central (p. ej. `cerradoPorChofer: boolean`) — rechazada porque contradice
directamente FR-004/FR-007 de spec.md ("el sistema MUST dejar de derivar
automáticamente el estado finalizado... el recorrido MUST permanecer en
estado activo"): la spec pide que `estado` en sí deje de derivarse
automáticamente, no que se agregue un segundo campo paralelo.

## Decisión 3 — `finalizarRecorrido` es idempotente, no falla en reintento

**Decisión**: si `finalizarRecorrido` se llama sobre un recorrido que ya
está `finalizado`, el método devuelve `{ outcome: "ok", ... }` con los datos
de cierre ya guardados (`cierreEn`/`cierreLat`/`cierreLon` originales, sin
sobrescribir), en vez de devolver conflicto.

**Rationale**: mismo patrón ya usado por `transicionarPunto` para
arribo/descarga (`estadoIdempotente`, comentario en
`integracionStore.js:484-486`: "Solo se captura en la transición real, no
en repeticiones idempotentes, para no pisar el primer registro"). Es
necesario porque FINALIZAR pasa por la cola offline (FR-009): si la request
llega al servidor y se aplica pero la respuesta se pierde por la conexión
(el chofer queda offline justo después), el reintento automático de
`offlineQueue.js` va a reenviar el mismo POST — debe tratarse como éxito
silencioso, no como error, y sin correr el riesgo de pisar el `cierreEn`
real con la hora del reintento.

**Alternativas consideradas**: devolver `409 conflict` en un reintento sobre
un recorrido ya finalizado — funciona igual de bien para la cola offline
(`api.js` ya trata cualquier `4xx` como "ya no aplica, no reintentar más"),
pero se descartó porque mezclaría dos causas distintas bajo el mismo
`409 transicion_invalida` (recorrido con puntos pendientes vs. recorrido ya
cerrado), dificultando el diagnóstico. Responder `200 ok` idempotente es más
claro y sigue el precedente ya establecido en el codebase.

## Decisión 4 — Qué se expone a Central: timestamps sí, coordenadas de auditoría no (por ahora)

**Decisión**: `inicioEn` (por punto) y `cierreEn` (por recorrido) se agregan
a las respuestas que consume Central (`listarActivos`, `listarHistorial`,
`obtenerDetalle`, y el mapeo de `GET /api/central/recorridos/historial` en
`central.js`). `inicioLat`/`inicioLon`/`cierreLat`/`cierreLon` se guardan en
el store pero **no** se agregan a ningún serializador de Central en esta
feature.

**Rationale**: FR-003 pide que el evento de inicio quede "consultable por
Central, igual que ya ocurre con los eventos de arribo y descarga
completa" — y el precedente real (`serializarPuntosCentral`,
`integracionStore.js:446-462`) hoy expone `arriboEn`/`descargaEn`
(timestamps) pero **no** `arriboLat`/`arriboLon`/`descargaLat`/`descargaLon`
(las coordenadas GPS de auditoría de esos eventos) a ningún consumidor fuera
del propio store. "Igual que ya ocurre" implica reproducir exactamente ese
nivel de visibilidad, no uno mayor. SC-003 ("Central puede calcular el
tiempo transcurrido... sin cálculos externos") solo requiere los timestamps.

**Alternativas consideradas**: exponer también las coordenadas de auditoría
a Central (útil a futuro para verificar visualmente en el mapa desde dónde
se inició/cerró el recorrido) — no descartada permanentemente, pero fuera
del alcance mínimo de esta spec; queda como extensión natural si una futura
feature lo pide explícitamente (ver Assumptions de spec.md).

## Decisión 5 — Señal de "esperando FINALIZAR" para Central

**Decisión**: se agrega un campo derivado `esperandoFinalizar: boolean` a
la respuesta de `listarActivos()` (consumida por
`GET /api/central/recorridos/activos`), `true` cuando
`viajeEstado === "detenido"` y todos los puntos están `completado` (o sea,
exactamente la condición que antes disparaba la finalización automática, y
que ahora deja al recorrido "colgado" a la espera del toque de FINALIZAR).

**Rationale**: sin esta señal, Central vería un recorrido con
`progreso.completados === total` indefinidamente en la lista de activos sin
forma de distinguir "el chofer está volviendo a base" de cualquier otro
estado `detenido` intermedio entre puntos — degradando la trazabilidad que
exige el Principio V y que motiva FR-010. Es un campo puramente derivado
(no se persiste), calculado igual que `calcularProgreso`.

**Alternativas consideradas**: no agregar ninguna señal explícita y dejar
que Central lo infiera comparando `progreso.completados === progreso
.pendientes + progreso.arribados + progreso.completados` — rechazada por
forzar a cada consumidor de Central a reimplementar la misma lógica
derivada; un campo explícito en el backend es más simple de consumir y más
barato de mantener consistente (Principio VII).

## Decisión 6 — Sin soporte de CANCELAR para FINALIZAR

**Decisión**: `finalizarRecorrido` no participa del mecanismo de
`ultimaOperacion`/CANCELAR de 005 (FR-017 a FR-020). No hay forma de
deshacer un FINALIZAR ya aplicado desde la UI del chofer.

**Rationale**: spec.md (008) no pide esta capacidad, y el propio flujo de
FINALIZAR ya es una confirmación explícita de único toque (SC-004) sobre un
recorrido que no tiene más acciones pendientes — a diferencia de
INICIAR/LLEGUE/DESCARGA COMPLETA, donde CANCELAR existe para corregir un
toque accidental en medio de un flujo todavía en curso. Agregar CANCELAR acá
sería una capacidad no solicitada (contradice la guía de no diseñar para
requisitos hipotéticos).

**Alternativas consideradas**: extender `ultimaOperacion` para cubrir
también `finalizar` — descartada por lo anterior; si en el futuro se
necesita corregir un FINALIZAR accidental, es una feature nueva a
especificar aparte (posible reapertura de recorrido), no una extensión
trivial de CANCELAR.

## Decisión 7 (2026-08-25, User Story 3) — Revertir Decisión 4: sí exponer coordenadas de auditoría a Central

**Decisión**: `inicioLat`/`inicioLon` (por punto) y `cierreLat`/`cierreLon`
(por recorrido) se agregan a los serializadores de Central
(`serializarPuntosCentral`, `listarHistorial`, `obtenerDetalle` en
`integracionStore.js`, y el mapeo explícito de
`GET /api/central/recorridos/historial` en `central.js`). No cambia nada en
la captura (ya existente desde la versión original) ni en lo que ve el
chofer (`GET /api/recorridos/:token` sigue sin exponer estas coordenadas,
igual que antes).

**Rationale**: la Decisión 4 original se apoyaba en el precedente real del
código *al momento de escribirse* (`arriboLat`/`arriboLon`/`descargaLat`/
`descargaLon` tampoco se exponían a Central entonces). Ese precedente
cambió: la feature 009-central-mejora-visual agregó exactamente esos cuatro
campos a `serializarPuntosCentral` para poder mostrar un indicador de
proximidad GPS en `RecorridoDetalle.jsx` (`HoraConProximidad`). El
razonamiento original de Decisión 4 ("reproducir exactamente ese nivel de
visibilidad, no uno mayor") ahora apunta en la dirección contraria: ese
nivel de visibilidad ya incluye coordenadas de auditoría para arribo y
descarga, así que reproducirlo para inicio y cierre es lo consistente. Esto
coincide además con lo que pidió el usuario directamente ("agregar el
registro de ubicación" a inicio/fin), que la implementación original ya
capturaba pero nunca terminó de exponer.

**Alternativas consideradas**: reutilizar tal cual `HoraConProximidad` para
inicio/cierre — descartada porque esa función colorea según distancia a un
punto de referencia (el destino del punto de entrega), y ni "inicio" (el
chofer todavía no llegó al punto cuando toca INICIAR) ni "cierre" (no hay
"punto base" modelado como entidad, ver Assumptions de spec.md) tienen un
punto de referencia no ambiguo contra el cual medir proximidad. Se optó por
mostrar las coordenadas crudas en un tooltip informativo, sin badge de
color ni cálculo de distancia, evitando inventar semántica no pedida.

## Decisión 8 (2026-08-25, User Story 4) — Exponer inicio/cierre también a Oracle/APEX, reutilizando el mecanismo existente

**Decisión**: `GET /api/integracion/estado` (el endpoint que Oracle/APEX ya
consulta para leer de vuelta arribo/descarga de cada punto, spec 003) ahora
también expone `inicioEn`/`inicioLat`/`inicioLon` por punto y
`cierreEn`/`cierreLat`/`cierreLon` a nivel `recorrido`. `INTEGRACION_CLOUD_API
.leer_estado_puntos` (Oracle) los lee y los persiste sobre
`T_PUNTOS_ENTREGA`/`T_RECORRIDOS` respectivamente.

**Rationale**: esta feature nunca declaró expresamente que Oracle quedara
fuera de alcance — la única mención explícita vivía en una nota transversal
del contrato de esta feature (`contracts/chofer-viaje-cierre.md`), no en
`spec.md`. Con Oracle ya sincronizando arribo/descarga por el mismo canal,
dejar inicio/cierre afuera es una inconsistencia de cobertura, no una
decisión de alcance deliberada — mismo razonamiento que motivó revertir la
Decisión 4 para Central (Decisión 7 arriba).

**Alternativas consideradas**: un endpoint/mecanismo nuevo dedicado a
inicio/cierre — descartada por Principio VII (simplicidad): el mecanismo
existente (`GET /api/integracion/estado` + `leer_estado_puntos`) ya
resuelve exactamente este problema (Oracle lee de vuelta eventos que el
chofer marcó en el cloud), agregar campos a una respuesta ya consumida es
más simple que introducir un segundo canal paralelo.

## Decisión 9 (2026-08-25, User Story 4) — "Inicio del recorrido" es derivado, no un evento capturado aparte

**Decisión**: el campo `recorrido.inicioEn`/`inicioLat`/`inicioLon` (nuevo,
a nivel recorrido, distinto de `puntos[].inicioEn`) no tiene captura propia
— se calcula en `serializarEstado()` (`backend/src/routes/integracion.js`,
función `primerInicio()`) como el `inicioEn` más temprano entre los puntos
del recorrido, recalculado en cada request. `null` si ningún punto tiene
`inicioEn` todavía.

**Rationale**: "el momento en que arrancó el recorrido" no es conceptualmente
un evento nuevo — es el mismo evento de INICIAR sobre el primer punto que ya
captura User Story 1 (FR-001/FR-002), solo que puesto a disposición también
a nivel del recorrido para que Oracle no tenga que derivarlo él mismo
recorriendo el array de puntos. Ser derivado (no un campo independiente
escrito una sola vez) además mantiene el comportamiento correcto ante
CANCELAR: si el chofer toca INICIAR y después CANCELAR sobre el primer
punto (edge case ya documentado en spec.md — `inicioEn` de ese punto vuelve
a `null`), el "inicio del recorrido" recalculado también vuelve a `null`
automáticamente, sin necesidad de un mecanismo de reversión aparte.

**Alternativas consideradas**:
- Capturar el inicio del recorrido como un evento independiente y
  persistido (similar a `cierreEn`) — descartada: significa un tercer punto
  de captura además de por-punto y de-recorrido-completo (cierre), agrega
  un campo mutable en el store, y puede desincronizarse del array de puntos
  ante un CANCELAR (quedaría una fecha "fantasma" de un inicio que ya no
  existe en ningún punto) — contradice el criterio ya establecido en Edge
  Cases de spec.md ("el evento de inicio registrado para ese punto queda
  descartado junto con el resto de la reversión").
- Reusar la misma lógica de fallback a `arriboEn` que usa
  `primerEventoConUbicacion` de Central (para recorridos viejos sin
  `inicioEn`) — descartada para este campo: `recorrido.inicioEn` es un dato
  nuevo que Oracle empieza a recibir desde ahora, no hay recorridos viejos
  consultando este campo específico que necesiten ese fallback (a
  diferencia del uso en Central, que sí tenía que seguir mostrando algo
  razonable para recorridos ya existentes antes de 008).
