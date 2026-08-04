# Research: Central — Panel de Control de Recorridos y Fletes

## 1. Backend: extender `backend/` existente en vez de un servicio nuevo

**Decision**: las rutas de Central se agregan como un router Express nuevo
(`src/routes/central.js`) dentro del mismo paquete `backend/` ya creado para
001-chofer-recorrido, reutilizando el mismo pool `oracledb` (`src/db/pool.js`).

**Rationale**: ambas features comparten la misma fuente única de verdad (Oracle,
Principio IV) y el mismo framework obligatorio (Express, Restricciones Técnicas). Levantar
un segundo servicio Node para simplemente exponer más lecturas/una escritura de asignación
sobre la misma base violaría el Principio VII (simplicidad) sin beneficio claro. El plan de
001-chofer-recorrido dejó esta decisión explícitamente abierta para esta feature.

**Alternatives considered**: servicio Node independiente para Central (`backend-central/`).
Se descarta por duplicar configuración de pool/conexión y desplegable sin necesidad; se
reconsideraría solo si en el futuro Central y chofer necesitaran ciclos de despliegue o
permisos de base de datos completamente independientes.

## 2. Frontend de Central: React 18 + Vite, de escritorio, SPA propia

**Decision**: nuevo proyecto `central/` con React 18 + Vite, siguiendo la misma
convención ya usada en `frontend/` (componentes funcionales, hooks, Vitest + Testing
Library), pero con layout de escritorio (no mobile-first) y sin reutilizar componentes de
`frontend/`.

**Rationale**: coherencia de stack con el resto del proyecto reduce costo cognitivo; sin
embargo los requisitos de UI son opuestos (panel de escritorio embebido en iframe vs. SPA
móvil de una sola vista para el chofer), por lo que no hay componentes compartibles reales
más allá de la convención de herramientas.

**Alternatives considered**: extender `frontend/` con una segunda "vista" de escritorio
dentro del mismo proyecto. Se descarta porque mezclaría un build/target mobile-first con
uno de escritorio embebido en iframe, complicando la configuración de Vite y el propósito
de cada bundle (Principio I exige que `frontend/` siga siendo exclusivamente la SPA del
chofer).

## 3. Actualización en vivo del panel: polling corto, no WebSockets/SSE

**Decision**: el frontend de Central refresca su vista de monitoreo mediante polling a un
endpoint REST (`GET /api/central/recorridos/activos`) cada ~5 segundos mientras la
pestaña está visible, cumpliendo el objetivo de <10 s de latencia (SC-002).

**Rationale**: cumple el requisito de "sin recarga manual" (FR-002) sin sumar
infraestructura de conexiones persistentes (WebSocket server, SSE) al backend Express, en
línea con el Principio VII. Además, conexiones persistentes de larga duración dentro de un
iframe embebido en una página APEX ajena introducen riesgo de compatibilidad (proxies,
timeouts, políticas de la página contenedora) no justificado para un requisito de <10 s.

**Alternatives considered**: Server-Sent Events (SSE) — descartado por el riesgo de
compatibilidad mencionado y por ser complejidad adicional no justificada dado que polling
corto ya cumple el SLA de la Historia 1; WebSockets — mismo motivo, con mayor complejidad
aún.

## 4. Identidad del operador: sin login propio, embebido o de acceso directo (revisado tras constitución v2.0.0)

**Decision** (actualizada — Principio III ahora también exige soportar acceso directo,
constitución v2.0.0): Central no implementa un login propio (Principio VII), ni cuando
está embebida en APEX ni cuando se accede directamente por URL. Ya no existe un guard que
detecte `window.self !== window.top` para bloquear o degradar la app fuera de un iframe:
Central funciona igual en ambos modos (FR-011, FR-012). Cuando está embebida y la página
APEX contenedora provee contexto de sesión, ese contexto puede usarse para identificar al
operador; cuando se accede directamente no hay ese contexto, y la app opera igual sin él
(FR-013).

**Rationale**: la versión anterior de esta decisión usaba la detección de embebido para
bloquear el acceso directo, tratándolo como "fuera de contexto". La constitución v2.0.0
elimina esa restricción explícitamente: exigir el embebido como condición para operar
limitaba casos de uso legítimos (acceso administrativo directo, pruebas manuales, entornos
sin APEX) sin aportar valor de seguridad real, porque la identidad del operador nunca
dependió técnicamente del framing sino del contexto que APEX decida pasar. Restringir el
acceso a la URL (red, firewall, credenciales de infraestructura) queda fuera del alcance
de esta especificación — es responsabilidad de quien despliega Central.

**Alternatives considered**: exigir un token de sesión propio pasado por query string
desde APEX (similar al patrón de enlace único del chofer), incluso para el modo de acceso
directo. Se descarta por ahora porque el alcance de esta spec no definió una necesidad de
distinguir operadores individuales dentro de Central (no hay requisito de auditoría por
operador); se reconsideraría si una futura feature lo requiere.

## 5. Esquema de datos para "fletes" y "asignación": nombres asumidos, a confirmar contra la instancia real

**Decision**: se asume, siguiendo la convención ya validada en 001-chofer-recorrido
(lecturas por vistas `V_*`, escrituras por package PL/SQL), que existen o se agregarán:
- Una vista de solo lectura `V_FLETES` con el listado de fletes y su última ubicación
  conocida reportada.
- La vista `V_RECORRIDOS` (ya existente) se extiende con columnas de asignación:
  `FLETE_ID` (nullable — `NULL` cuando no está asignado) y metadatos de la asignación
  vigente.
- Ambos nombres (y sus columnas) son overrideables por variable de entorno, igual que
  `ORACLE_TABLA_RECORRIDOS`/`ORACLE_TABLA_PUNTOS` ya lo son hoy.

**Rationale**: 001-chofer-recorrido mostró que el esquema real (nombres de tabla base,
columnas como `FLT_VIAJE_ID` en vez de `RECORRIDO_ID`) solo se terminó de confirmar al
conectar contra la instancia Oracle real, ya avanzada la planificación. Se sigue el mismo
proceso acá: se documenta un supuesto razonable y consistente con el patrón ya acordado
con el dueño del esquema, dejando explícito que la confirmación final (nombres de columnas
reales, si hace falta una vista nueva o alcanza con extender `V_RECORRIDOS`) ocurre durante
la implementación, igual que research.md §7 de 001-chofer-recorrido.

**Alternatives considered**: bloquear la planificación hasta tener acceso a la instancia
real. Se descarta porque el mismo proyecto ya demostró (001-chofer-recorrido) que se puede
planificar sobre un supuesto razonable, overrideable por configuración, y ajustar el
nombre exacto sin rediseñar el contrato HTTP ni el frontend.

## 6. Escritura de asignación/reasignación: nuevo package PL/SQL `CENTRAL_API`

**Decision**: análogo a `VIC.RECORRIDO_API` (ver 001-chofer-recorrido), se define un nuevo
package `VIC.CENTRAL_API` con procedures `asignar_recorrido` y `reasignar_recorrido`, que
reciben `p_recorrido_id`/`p_flete_id` y devuelven por parámetros OUT un `p_resultado`
(`OK`/`YA_ASIGNADO`/`FLETE_OCUPADO`/`INVALIDO`), el `p_token` generado (en el caso de
`asignar_recorrido`) y el estado resultante.

**Rationale**: las vistas de lectura (`V_RECORRIDOS`, `V_FLETES`) no son actualizables
(mismo hallazgo que en 001-chofer-recorrido), así que cualquier escritura debe pasar por un
package que valide y aplique el cambio de forma atómica en la misma transacción,
exactamente como ya se acordó para `marcar_arribo`/`marcar_descarga`. Esto también resuelve
FR-015 (concurrencia): el package hace el check-and-set atómico, así que solo una de dos
asignaciones simultáneas sobre el mismo recorrido puede resultar en `OK`.

**Alternatives considered**: resolver la concurrencia solo en el backend Node (ej. con un
lock en memoria). Se descarta porque no protege contra múltiples instancias del backend ni
contra escrituras directas a Oracle desde otros procesos; la garantía debe vivir en la base
de datos (Principio IV).

## 7. Umbral de "ubicación no reciente" (FR-014)

**Decision**: se fija un valor por defecto de 5 minutos sin reporte de ubicación para
considerar la última ubicación conocida de un flete como "no reciente", configurable por
variable de entorno del backend (ej. `UBICACION_STALE_MS`), sin necesidad de un valor fijo
en la especificación (la propia spec lo dejó como detalle de planificación).

**Rationale**: 5 minutos es un valor razonable para operación logística en ruta (ni tan
corto que genere falsos positivos por una parada breve sin señal, ni tan largo que oculte
un problema real de conectividad); se deja configurable para ajustar sin redeploy de
código si la operación real lo requiere.

**Alternatives considered**: calcular el umbral dinámicamente según el intervalo de
reporte esperado del dispositivo. Se descarta por ahora por complejidad no justificada
(Principio VII); un valor fijo configurable ya resuelve el requisito.
