# Research: Ubicación en vivo ligada al chofer, no al viaje

No quedaron `NEEDS CLARIFICATION` en el Technical Context del plan — el
contexto ya se investigó a fondo antes de escribir el spec (lectura directa
de `ubicacionPeriodica.js`, `ubicacionMqtt.js`, `mqttBridge.js`,
`integracionStore.js`, `emqxProvisioning.js`, `recorrido.js`, `main.jsx` y
sus tests). Este documento consolida las decisiones tomadas.

## Decisión 1 — Topic y ruteo de ubicación por `choferId`, no por `fleteId`

**Decisión**: El topic MQTT de ubicación pasa de `chofer/{fleteId}/ubicacion`
a `chofer/{choferId}/ubicacion`, siempre. El bridge del backend
(`mqttBridge.js`) rutea por `choferId` hacia el recorrido activo de ese
chofer, vía un nuevo mapa `recorridoPorChofer` en `integracionStore.js`.

**Rationale**: La credencial MQTT del chofer ya es permanente por
`choferId` desde 2026-08-10 (`emqxProvisioning.js`,
`derivarCredencialChofer`), con ACL amplia sobre el wildcard
`chofer/+/ubicacion` (`upsertReglaDelChofer`) — no está scoped a un único
`fleteId`. Seguir exigiendo `fleteId` para construir el topic (como hace hoy
`mqttConfigPara` en `recorrido.js`) es una restricción artificial que ya no
refleja cómo funciona la credencial real, y es la causa directa de que el
reporte de ubicación se corte cuando no hay `fleteId` resoluble (viaje no
asignado todavía, o recorrido no reconocido por el backend).

**Alternativas consideradas**:
- *Mantener el topic por-fleteId y agregar un topic secundario por-choferId
  solo como fallback*: descartada — duplica la lógica de publish/suscripción
  sin necesidad, cuando el esquema por-choferId ya cubre el 100% de los
  casos (incluido cuando sí hay un fleteId activo, vía `recorridoPorChofer`).
- *ACL/credencial separada por-fleteId de nuevo (revertir a la credencial
  vieja)*: descartada — es exactamente el diseño que se reemplazó en
  2026-08-10 y que forzaba reaprovisionar en cada recorrido nuevo.

## Decisión 2 — Disparo inmediato al montar, no forzado por botón de acción

**Decisión**: `iniciarReportePeriodico` dispara un `reportarUnaVez` sin
esperar el primer tick del `setInterval`. No se agrega ningún disparo ligado
a los botones de acción (Llegué, Descarga, etc.).

**Rationale**: El primer diagnóstico consideró forzar la publicación al
presionar cada botón de acción (ya que esos momentos garantizan que la app
está en foreground). Sin embargo, el momento de mayor probabilidad real de
que el chofer tenga la app abierta es al *abrirla* — no todos los viajes
implican presionar un botón inmediatamente, y "abrir la app" cubre
estrictamente más casos (incluye a alguien que solo mira la ruta sin marcar
nada) con un cambio de código mucho más chico (una función más en
`ubicacionPeriodica.js`, sin tocar `main.jsx` ni sus handlers de botones).

**Alternativas consideradas**:
- *Forzar publish en cada botón de acción (Iniciar/Llegué/Descarga
  completa/Finalizar)*: descartada explícitamente por el usuario — más
  código (requiere plumbing en `main.jsx` vía `useRef` para exponer un
  `reportarAhora()` desde el controlador), y cubre un subconjunto estricto
  de los casos que ya cubre el disparo al montar.
- *Reducir el intervalo del timer (p. ej. de 60s a 10s)*: descartada — no
  resuelve el problema real (el chofer no deja la app abierta el tiempo
  suficiente para que importe cuán corto sea el intervalo), y aumenta tráfico
  MQTT/batería sin necesidad.

## Decisión 3 — Caché cliente-side de `{choferId, mqtt}` para resiliencia

**Decisión**: Nuevo módulo `frontend/src/services/choferCache.js` (mismo
patrón que `recorridoCache.js`, ya existente) que persiste en `localStorage`
la identidad y credencial MQTT del último chofer que cargó su recorrido
exitosamente en ese dispositivo — sin scope por token. El reporte de
ubicación en `main.jsx` deriva `choferId`/`mqttConfig` con fallback a esta
caché cuando `GET /:token` falla.

**Rationale**: El backend cloud guarda su store solo en memoria (documentado
como incidente operativo real: cualquier `fly deploy`/`fly secrets set` lo
vacía). Cuando eso pasa, `GET /:token` devuelve 404 y, con el diseño actual
(gate en `fleteId` resuelto desde la respuesta viva), el reporte de ubicación
se corta por completo hasta que Oracle re-sincroniza — a veces minutos u
horas. Cachear la credencial del lado del cliente (que de por sí ya es de
larga duración y no cambia entre recorridos del mismo chofer) permite seguir
reportando posición durante ese lapso sin ningún cambio en el backend.

**Alternativas consideradas**:
- *Persistencia del store del backend (Redis, disco, etc.)*: resolvería la
  causa raíz de raíz, pero es un cambio de infraestructura mucho mayor, fuera
  de alcance de esta sesión (el store en memoria es una decisión ya tomada y
  documentada en specs anteriores, no se revisita acá).
- *No cachear nada, aceptar el corte de reporte durante el incidente*: es el
  comportamiento actual — descartado porque es exactamente el problema que
  motivó esta historia de usuario (US2).
- *Cachear el objeto `recorrido` completo (ya existe `recorridoCache.js`) y
  derivar `choferId`/`mqtt` de ahí en vez de un módulo nuevo*: descartada —
  `recorridoCache.js` explícitamente NO se usa como fallback ante un 404 (ver
  `main.jsx`, `cargarRecorrido`: un `ApiError` no cae a esa caché, a
  propósito, porque un 404 real de token inválido no debe mostrar datos
  viejos de la ruta). Mezclar ambos propósitos en la misma caché rompería esa
  distinción intencional; un módulo separado, con su propia semántica ("último
  chofer conocido", no "último estado de ruta conocido"), es más claro.

## Decisión 4 — Métricas MQTT en memoria, expuestas por HTTP autenticado

**Decisión**: `mqttBridge.js` mantiene contadores en memoria (recibidos,
procesados, duplicados descartados, inválidos, reconexiones, último mensaje
procesado, estado de conexión), expuestos vía `GET
/api/integracion/mqtt/estado`, protegido por el mismo middleware
`validarAuthIntegracion` que ya protege el resto de ese router.

**Rationale**: Hoy la única forma de confirmar si el canal MQTT está
recibiendo mensajes es pegarle directo a la API de EMQX Cloud (Admin API v5),
una herramienta externa. Un endpoint propio, aunque sea simple, acelera el
diagnóstico sin depender de credenciales de ese proveedor externo. Reusar
`validarAuthIntegracion` evita introducir un mecanismo de auth nuevo solo
para este endpoint.

**Alternativas consideradas**:
- *Integrar un stack de observabilidad (Prometheus/Grafana)*: sobredimensionado
  para el volumen actual del sistema (decenas de choferes); ya existe
  `docs/observabilidad-mqtt-integracion.md` documentando esto como objetivo
  futuro, no como requisito de esta feature.
- *Loguear más y confiar en los logs de Fly.io*: ya es el estado actual
  (logs puntuales en `mqttBridge.js`); no da un snapshot agregado consultable
  bajo demanda, que es lo que pide la Historia de Usuario 3.
