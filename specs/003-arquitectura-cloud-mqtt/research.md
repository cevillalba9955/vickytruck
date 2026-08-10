# Research: Arquitectura Cloud + MQTT + Integracion Oracle/APEX

## Decisión 1: Separar plano local Oracle/APEX y plano operativo cloud

- Decisión: cloud no abre conexión directa a Oracle local; la integración se realiza vía HTTPS desde Oracle/APEX local hacia backend cloud.
- Razón: minimiza superficie de red entrante al datacenter local y simplifica seguridad.
- Alternativas evaluadas:
  - VPN + acceso directo cloud->Oracle: descartada por mayor complejidad operativa y exposición.
  - Replicación DB bidireccional: descartada por costo y riesgo de conflictos para este alcance.

## Decisión 2: MQTT para telemetría de ubicación en tiempo real

- Decisión: chofer publica ubicación por MQTT y Central se suscribe directo vía WebSocket.
- Razón: latencia baja y patrón pub/sub natural para múltiples consumidores.
- Alternativas evaluadas:
  - Solo polling REST: descartada para tiempo real estricto.
  - WebSocket propietario backend: descartada por mayor implementación frente a MQTT gestionado.

## Decisión 3: Backend también suscribe MQTT

- Decisión: backend bridge consume mismos topics para persistir/consultar histórico.
- Razón: permite auditoría y recuperación de contexto sin depender del estado de sesión del navegador.

## Decisión 4: Estrategia offline del chofer

- Decisión: enfoque híbrido.
- Reglas:
  - Eventos críticos (arribo/descarga): cola local + reintento + backend idempotente.
  - Ubicación en tiempo real: best effort por MQTT; no requiere backlog largo.

## Decisión 5: Proveedores sugeridos

### EMQX (MQTT Broker)

- Fortalezas:
  - MQTT nativo y maduro (QoS, sesiones persistentes, ACLs, bridges).
  - Buen soporte WebSocket MQTT para clientes browser.
  - Opciones gestionadas y autogestionadas.
- Cuándo elegirlo:
  - Requisito fuerte de MQTT empresarial, observabilidad de broker y escalado horizontal.

### Cloudflare (Edge, seguridad y entrega)

- Fortalezas:
  - WAF, DDoS, TLS gestionado, rate limiting y caché para endpoints HTTP.
  - Zero Trust / Access para proteger endpoints de integración administrativa.
  - Workers para validaciones ligeras o normalización previa al backend.
- Cuándo elegirlo:
  - Necesidad de endurecer exposición pública del backend e integración desde sedes remotas.

## Decisión 6 (2026-08-06): credenciales MQTT por-flete en vez de una credencial compartida

- Decisión: en vez de una única credencial MQTT "rotable" compartida por
  todos los choferes (lo que asumía la Decisión 5 original), el backend
  aprovisiona dinámicamente en EMQX Cloud una credencial **publish-only**
  distinta por cada `fleteId`, scoped por ACL a su propio tópico
  (`chofer/{fleteId}/ubicacion`).
- Razón: el bundle de la SPA del chofer es público — cualquiera con el link
  de un recorrido puede abrir las herramientas de desarrollador del
  navegador y leer cualquier variable embebida en el JS. Una credencial
  compartida con permiso de publicar en el tópico de cualquier flete,
  embebida así, le da a cualquier chofer (o a cualquiera con un link viejo)
  la capacidad de falsificar la ubicación de OTRO flete. Una credencial
  por-flete, publish-only y scoped, acota el daño posible de una credencial
  filtrada a un único tópico.
- Cómo: password determinística (`HMAC-SHA256(secreto_backend, fleteId)`),
  no aleatoria — así `GET /:token` puede devolverla en cualquier momento
  (recarga de página) sin necesidad de cachear estado ni volver a llamar a
  la API de EMQX Cloud. Aprovisionada al recibir el recorrido de Oracle
  (`POST /api/integracion/recorridos`), no al abrir el link — para que ya
  esté lista cuando el chofer entra.
- Origen: portado y adaptado de un enfoque ya construido y verificado
  end-to-end contra EMQX Cloud real en una iteración anterior de este
  feature (rama `003-mqtt-broker-fletes`, indexada por `token` sobre un
  árbol de tópicos más amplio que incluía arribo/descarga vía MQTT). Se
  adaptó a indexar por `fleteId` y acotar al único tópico que esta
  arquitectura efectivamente usa (`chofer/{fleteId}/ubicacion`).
- Alternativas evaluadas:
  - Credencial compartida rotable (diseño original): descartada por el
    riesgo de suplantación entre fletes explicado arriba.
  - Token de corta vida (ej. JWT de EMQX): más robusto a largo plazo, pero
    la password determinística por HMAC ya resuelve el problema principal
    (alcance) sin la complejidad operativa de expiración/renovación.
- Pendiente: no hay revocación automática (`revocarCredencial(fleteId)`
  existe pero nada la dispara) — falta un trigger claro de "recorrido
  finalizado" en esta arquitectura.

## Decisión 7 (2026-08-06): reporte de ubicación también en `visibilitychange`

- Decisión: además del `setInterval` de 60s, el reporte periódico de
  ubicación se dispara inmediatamente cuando la pestaña vuelve a estar
  visible (evento `visibilitychange` del navegador).
- Razón: reproducido en vivo — iOS (Safari/WebKit; Chrome en iOS usa el
  mismo motor por regla de Apple) pausa agresivamente los timers de JS de
  una pestaña en segundo plano (pantalla bloqueada, cambio de app). Un
  cliente MQTT quedó conectado y autenticado correctamente durante varios
  minutos sin publicar ni un solo mensaje, hasta que se agregó este fix.
- No requiere cambios de contrato ni de backend — es puramente un ajuste de
  cuándo el cliente decide reportar.

## Decisión 8 (2026-08-10): credenciales MQTT permanentes por-chofer, con ACL amplia

- Decisión: reemplazar la credencial publish-only por-`fleteId` (Decisión 6)
  por una credencial **permanente por `choferId`** (`chofer-{choferId}`),
  con ACL de publish sobre el wildcard `chofer/+/ubicacion` — no scoped a un
  único tópico.
- Razón: el pedido de negocio es explícito — "autenticación única por
  chofer" y "credenciales permanentes, una por cada chofer" — y una
  identidad que sobreviva a múltiples recorridos no puede tener una ACL fija
  a un único `fleteId` (ese cambia en cada recorrido nuevo).
- Alternativas evaluadas (sesión de clarificación 2026-08-10):
  - **ACL dinámica** (actualizar la regla de ACL del chofer en EMQX en cada
    nueva asignación de recorrido): preserva el scoping estricto de la
    Decisión 6, pero agrega complejidad operativa (llamada a la Admin API de
    EMQX en cada asignación, manejo de fallo de esa llamada). Descartada por
    ahora — ver Principio VII en `plan.md`.
  - **Validación server-side en `mqttBridge.js`** (ACL amplia + verificar que
    el `fleteId` del payload corresponde al chofer autenticado antes de
    persistir): más robusta que la opción elegida, pero requiere mantener un
    mapeo chofer↔fleteId activo en el backend. Descartada por simplicidad
    para este alcance; queda como mejora futura si el riesgo aceptado deja
    de ser tolerable.
  - **ACL amplia sin validación adicional** (elegida): más simple, acepta
    explícitamente el riesgo de que un chofer autenticado pueda publicar en
    el tópico de un `fleteId` ajeno. Riesgo mitigado por el impacto acotado
    (solo `ultimaUbicacion` de tránsito, no eventos autenticados por token) y
    por ser una población de choferes conocida y administrada por Oracle.
- Impacto en Decisión 6: **queda superseded** para el caso de ubicación
  periódica del chofer — se mantiene como documentación histórica de por qué
  se rechazó originalmente una credencial compartida (ese análisis de riesgo
  de "bundle público" ya no aplica igual porque el chofer ahora es una
  identidad administrada, no un link anónimo).

## Decisión 9 (2026-08-10): origen de `choferId`

- Decisión: `choferId` es un campo nuevo en el payload de
  `POST /api/integracion/recorridos`, provisto por Oracle/APEX (sistema
  maestro administrativo de choferes, Principio IV).
- Razón: evita crear una segunda fuente de verdad de identidad de chofer en
  el plano cloud; reusa el mismo patrón de sincronización explícita ya
  usado para `fleteId`.
- Alternativas evaluadas: identidad por login/teléfono en el frontend
  (descartada — requiere infraestructura de verificación nueva, PII
  adicional no justificada por Principio VII, y fricción de onboarding que
  hoy no existe).

## Decisión 10 (2026-08-10): REST de ubicación periódica pasa a fallback silencioso

- Decisión: el reporte periódico de ubicación sigue publicando por REST
  (`POST /:token/ubicacion`, FR-014 de spec 001), pero solo como fallback —
  se invoca únicamente si la publicación MQTT del ciclo falla, no en
  paralelo en cada ciclo como hoy.
- Razón: honra el pedido de "únicamente vía MQTT" como camino primario, sin
  perder la resiliencia que da un canal de respaldo ante caída del broker.
- Alternativa evaluada: eliminar el REST por completo — descartada por
  reducir resiliencia sin necesidad clara, y por requerir derogar FR-014 de
  spec 001 sin un reemplazo de igual robustez.

## Decisión 11 (2026-08-10): activar suscripción MQTT de Central en producción

- Decisión: configurar `VITE_MQTT_*` en `central/.env.production` para que
  `central/src/services/mqttClient.js` (ya implementado, dormant desde
  2026-08-06) quede activo — Central pasa a recibir ubicación tanto por
  MQTT directo como por polling REST (FR-007 se mantiene como reconciliación).
- Razón: el pedido "Central y Backend suscriben al mismo topic" asume que
  ambas suscripciones están activas; dejar a Central dependiendo solo de
  polling no lo cumple.

## Recomendación combinada

- EMQX como broker MQTT principal.
- Cloudflare como borde de seguridad y publicación de APIs HTTPS.
- Criterios de adopción:
  - SLO de latencia y disponibilidad.
  - Costo mensual por conexiones concurrentes y egress.
  - Facilidad de operación del equipo (runbooks, alertas, soporte).