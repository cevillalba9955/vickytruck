# Research: App Chofer — Recepción y Ejecución de Recorrido de Entregas

## 1. Frontend: React 18 + Vite

**Decision**: SPA en React 18 (componentes funcionales, hooks), empaquetada con Vite.

**Rationale**: coherente con el resto del stack ya usado por el autor para interfaces
similares (ver `rs956/specs/007-ui-calendario-mensual`, frontend React + Vite + Vitest).
Reutilizar el mismo patrón reduce el costo cognitivo de mantenimiento y ya está validado
para manejar estado reactivo de varias tarjetas (aquí: hasta 10 puntos de entrega con
estados independientes).

**Alternatives considered**: Vanilla JS/HTML — más liviano, pero se aparta de la
convención ya validada por el autor y complica el manejo de estado de hasta 10 puntos con
reintentos offline sin agregar una capa de reactividad propia.

## 2. Backend: Node.js con Express + `oracledb`

**Decision**: API HTTP fina en Node.js (≥20.12) usando **Express** como framework HTTP,
más el driver oficial `oracledb` para acceso directo a Oracle.

**Rationale**: Express es obligatorio para todo backend HTTP del proyecto según la
Constitución v1.1.0 ("Restricciones Técnicas y de Integración" → Framework backend), para
estandarizar ruteo, middleware y manejo de errores entre esta feature y futuras (Central,
etc.). Se mantiene el mismo driver `oracledb` ya usado en otros proyectos Oracle del
autor (p. ej. rs956) para el acceso a datos.

*(Nota histórica: la versión anterior de esta decisión optaba por `node:http` nativo sin
framework, siguiendo el patrón de `rs956/specs/007-ui-calendario-mensual`. Se actualiza
tras la enmienda de la constitución que fija Express como framework obligatorio.)*

**Alternatives considered**: Exponer los endpoints directamente vía Oracle REST Data
Services (ORDS) desde la misma instancia de APEX. Se descarta para esta feature porque la
lógica de negocio (impedir marcar descarga sin arribo previo, tolerancia a reintentos
duplicados) es más simple de expresar y testear en código Node/Express que en PL/SQL vía
ORDS. No se descarta reevaluarlo si la feature de Central termina exponiendo un ORDS
reutilizable.

## 3. Identificación del chofer: token opaco en la URL

**Decision**: cada recorrido tiene un token opaco embebido en la URL que el backend
resuelve directamente a un recorrido, sin sesión ni usuario/contraseña.

**Rationale**: decisión de producto ya tomada en la sección "Clarifications" de
`spec.md`. El token se genera y persiste en Oracle al momento de asignar el recorrido,
responsabilidad de la futura feature de Central (fuera de este alcance).

**Alternatives considered**: N/A — decisión de producto ya cerrada.

## 4. Cola de reintento offline: `localStorage`

**Decision**: los eventos marcados sin conectividad se guardan en `localStorage` del
navegador y se reintentan automáticamente al recuperar conexión.

**Rationale**: soporta FR-010 sin requerir un Service Worker completo; `localStorage` es
más que suficiente para una cola de a lo sumo 10 eventos pendientes (uno por punto) y está
ampliamente soportado en navegadores móviles modernos.

**Alternatives considered**: IndexedDB — más robusto ante fallos, pero más complejo de
implementar y testear; se reconsiderará si en la práctica aparecen problemas de límite de
tamaño o corrupción de `localStorage` (no esperado con ≤10 eventos).

## 5. Geolocalización: `getCurrentPosition` puntual, no tracking continuo

**Decision**: al marcar un evento, se intenta obtener la ubicación con
`navigator.geolocation.getCurrentPosition` (timeout corto, ~5 s) y se adjunta si está
disponible; si falla o no hay permiso, el evento se registra igual sin ubicación.

**Rationale**: cumple FR-006 (registro best-effort, no bloqueante) y el Principio VII
(datos mínimos): solo se solicita ubicación en el instante del evento, nunca tracking
continuo en segundo plano.

**Alternatives considered**: `watchPosition` continuo mientras el recorrido está activo —
descartado por mayor consumo de batería y porque el spec solo requiere la ubicación en el
instante del evento (FR-006), no un tracking continuo de posición.

## 6. Idempotencia de eventos ante reintentos automáticos

**Decision**: el backend trata una repetición del mismo evento (mismo punto, misma
transición de estado ya aplicada) como éxito idempotente (200, devuelve el estado actual),
en vez de error — específicamente para soportar los reintentos automáticos de la cola
offline (FR-010). La prevención de la UI (FR-007: no ofrecer "descarga" sin arribo previo,
no ofrecer "arribo" sobre un punto ya arribado/completado) sigue aplicando a nivel de
interfaz; a nivel de contrato HTTP, una transición inválida (ej. descarga sin arribo)
devuelve 409 con el estado actual para que el cliente pueda resincronizar su vista.

**Rationale**: sin esto, un evento que sí se guardó en el servidor pero cuya confirmación
se perdió por corte de conexión generaría un reintento que fallaría innecesariamente,
violando el requisito de no duplicar ni perder eventos (FR-010).

**Alternatives considered**: exigir una clave de idempotencia (idempotency key) generada
por el cliente por cada evento. Se descarta por ahora por ser complejidad adicional no
justificada: el propio par (punto, tipo de evento, estado destino) ya es suficiente clave
natural de idempotencia dado que cada punto solo transiciona una vez por tipo de evento.

## 7. Lecturas por vistas, escrituras por package PL/SQL (descubierto en integración real)

**Decision**: al conectar contra la instancia Oracle real (2026-08-03), se confirmó que
`V_RECORRIDOS`/`V_PUNTOS_ENTREGA` son **vistas generadas** (no tablas), ajustadas por el
propietario del esquema a las columnas que este backend necesita para leer. Las vistas no
son actualizables, así que las escrituras (marcar arribo/descarga) no pueden hacerse con
`UPDATE` directo sobre ellas. Se acordó un package PL/SQL, `RECORRIDO_API` (ver
`backend/sql/recorrido_api.pks.sql`), con procedures `marcar_arribo`/`marcar_descarga` que
reciben `p_token`/`p_punto_id`/`p_lat`/`p_lon` y devuelven `p_resultado`
(`OK`/`INVALID_TOKEN`/`NOT_FOUND`/`CONFLICT`), `p_estado` y `p_evento_en` por parámetros
OUT. El package valida token + pertenencia del punto y aplica la transición de forma
atómica; el backend Node solo interpreta el resultado y, si hace falta el punto completo
para la respuesta HTTP, vuelve a leerlo desde la vista (que sí tiene ambos timestamps,
arribo y descarga).

**Rationale**: mantiene el modelo mental simple (lecturas = vistas, escrituras = package)
sin que el backend Node necesite conocer las tablas base reales ni su esquema exacto; la
persona dueña del esquema Oracle controla la implementación del package sin acoplarse a
los nombres de columna que ve el backend.

**Alternatives considered**: pedir que las vistas se reemplacen por tablas reales
directamente accesibles — descartado porque el propietario del esquema ya había generado
las vistas ajustadas específicamente para este backend antes de esta conversación, y
cambiar de vistas a tablas reales habría expuesto columnas/estructura interna que el
propietario prefiere encapsular.
