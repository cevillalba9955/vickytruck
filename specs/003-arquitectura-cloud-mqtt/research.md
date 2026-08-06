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

## Recomendación combinada

- EMQX como broker MQTT principal.
- Cloudflare como borde de seguridad y publicación de APIs HTTPS.
- Criterios de adopción:
  - SLO de latencia y disponibilidad.
  - Costo mensual por conexiones concurrentes y egress.
  - Facilidad de operación del equipo (runbooks, alertas, soporte).