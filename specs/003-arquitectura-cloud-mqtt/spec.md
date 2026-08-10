# Feature Specification: Arquitectura Cloud + Integracion Oracle/APEX + MQTT

**Feature Branch**: `003-arquitectura-cloud-mqtt`

**Created**: 2026-08-05

**Status**: Implemented (2026-08-06, verificado en vivo contra producción) —
con divergencias respecto al diseño original de este documento; ver
"Divergencias respecto al diseño original" al final de
`contracts/mqtt-topics.md` para el detalle tópico por tópico.

**Input**: User description: "mover frontend/central/backend a cloud sin acceso directo a Oracle, integrar Oracle/APEX local por endpoints y usar broker MQTT para ubicacion en tiempo real"

## Clarifications

### Session 2026-08-10

- Q: ¿Qué significa "topic en común" al pasar a credenciales MQTT permanentes por chofer (en vez de por-flete/efímeras)? → A: El esquema de topics no cambia — publicación sigue por-flete (`chofer/{fleteId}/ubicacion`) y backend/Central siguen suscribiéndose al wildcard compartido (`chofer/+/ubicacion`) ya existente. Lo único que cambia es el modelo de credenciales: de publish-only efímero por-flete a permanente por-chofer.
- Q: Si los topics siguen siendo por-flete pero la credencial es permanente por chofer, ¿cómo se autoriza (ACL) qué puede publicar esa credencial a medida que el chofer cambia de flete a lo largo del tiempo? → A: ACL amplia por rango — el usuario `chofer-{choferId}` tiene permiso de publish sobre `chofer/+/ubicacion` (cualquier fleteId), sin actualización dinámica por asignación. Riesgo aceptado explícitamente: un chofer autenticado podría técnicamente publicar en el topic de un fleteId ajeno (spoofing de ubicación de otro flete/chofer) — ver Assumptions.
- Q: No existe hoy un `choferId` en ningún contrato (ni en Oracle→cloud, ni en el data model del chofer) — ¿de dónde sale la identidad estable de chofer que la credencial permanente necesita? → A: Oracle ya administra choferes como sistema maestro (Principio IV); se agrega `choferId` como campo nuevo al payload de `POST /api/integracion/recorridos`, y el backend cloud lo usa para aprovisionar/reutilizar la credencial permanente `chofer-{choferId}`.
- Q: El reporte periódico de ubicación hoy publica por REST (`POST /:token/ubicacion`, FR-014 de spec 001) y por MQTT en paralelo en cada ciclo — el pedido de "únicamente vía MQTT" ¿elimina el REST por completo? → A: No — MQTT pasa a ser el canal primario, pero el REST se conserva como **fallback silencioso**: solo se invoca si la publicación MQTT del ciclo falla, no en paralelo siempre. FR-014 de spec 001 se reinterpreta como fallback, no como camino primario.
- Q: "Central y Backend suscriben al mismo topic" — hoy la suscripción MQTT de Central (FR-005) existe en código pero está dormant en producción (sin `VITE_MQTT_*` configurado); ¿activarla forma parte de este cambio? → A: Sí — activar la suscripción MQTT de Central en producción es parte del alcance de este cambio, configurando la credencial de servicio de solo-lectura ya prevista en `central/.env.production`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sincronizar recorridos desde Oracle/APEX local hacia cloud (Priority: P1)

Un operador local de Oracle/APEX necesita enviar recorridos precargados al backend cloud sin abrir conectividad directa desde cloud a Oracle.

**Why this priority**: Sin este flujo no hay datos operativos en cloud para que chofer y central funcionen.

**Independent Test**: Desde SQLcl/APEX local, enviar un recorrido por endpoint de integracion y verificar que queda disponible en el store cloud.

**Acceptance Scenarios**:

1. **Given** un recorrido válido en Oracle local, **When** Oracle/APEX invoca `POST /api/integracion/recorridos`, **Then** backend cloud hace upsert y responde confirmación.
2. **Given** un recorrido ya sincronizado, **When** Oracle/APEX lo reenvía con cambios permitidos, **Then** backend cloud actualiza sin duplicar.

---

### User Story 2 - Consultar estado operativo desde Oracle/APEX local (Priority: P1)

Un operador local consulta desde Oracle/APEX el estado de arribos/descargas que están ocurriendo en cloud.

**Why this priority**: Completa la bidireccionalidad funcional entre operación cloud y operación local.

**Independent Test**: Ejecutar consulta al endpoint de estado y validar que refleja los eventos recientes de los recorridos.

**Acceptance Scenarios**:

1. **Given** recorridos activos con eventos de arribo/descarga, **When** Oracle/APEX consulta `GET /api/integracion/estado`, **Then** obtiene estado actual y timestamps de eventos.
2. **Given** un recorrido inexistente en cloud, **When** se consulta su estado, **Then** backend responde error controlado y trazable.

---

### User Story 3 - Monitoreo en tiempo real con MQTT (Priority: P1)

El chofer publica su ubicación por MQTT; el backend la persiste (vía su
propia suscripción) para que Central la muestre. Central también puede
suscribirse directo al broker (código implementado) para bajar la latencia
por debajo del ciclo de polling, pero en producción hoy corre exclusivamente
por el camino backend→polling — ver nota de implementación. *(pendiente de
activar en producción, ver Clarifications 2026-08-10 y FR-005 actualizado)*

**Why this priority**: Entrega baja latencia visual y mantiene historial consultable por backend.

**Independent Test**: Publicar ubicación desde chofer y verificar que `GET /api/central/recorridos/activos` refleja la nueva posición.

**Acceptance Scenarios**:

1. **Given** un chofer activo con su credencial MQTT por-flete ya
   aprovisionada, **When** publica en `chofer/{fleteId}/ubicacion`, **Then**
   el backend bridge la persiste y `GET /api/central/recorridos/activos`
   la refleja en el siguiente ciclo de polling de Central.
2. **Given** publicaciones MQTT válidas, **When** backend bridge consume el topic, **Then** persiste la última ubicación para consultas históricas.
3. **Given** Central con `VITE_MQTT_*` configurado (no es el caso en
   producción hoy), **When** el chofer publica, **Then** Central también la
   recibe directo por WebSocket, sin esperar el ciclo de polling.

**Nota de implementación (2026-08-06)**: la credencial MQTT del chofer es
publish-only y aprovisionada dinámicamente por-flete (ver FR-011) — nunca
una credencial fija embebida en build, a diferencia de lo que asumía el
diseño original de esta historia.

---

### Edge Cases

- ¿Qué pasa si Oracle/APEX local no tiene conectividad temporal hacia cloud? Debe existir reintento controlado desde jobs/scripts sin perder consistencia.
- ¿Qué pasa si Central pierde conexión MQTT? Debe reconectar automáticamente y reconciliar estado vía API backend (polling de respaldo).
- ¿Qué pasa si llegan mensajes MQTT duplicados o fuera de orden? Backend debe aplicar idempotencia por `eventId`/timestamp y reglas de precedencia.
- ¿Qué pasa si el broker está operativo pero backend bridge no? Central puede seguir viendo tiempo real, pero debe existir alerta operativa por falta de persistencia.
- **¿Qué pasa si el navegador del chofer queda en segundo plano?** (resuelto
  2026-08-06) iOS (Safari/WebKit, y Chrome en iOS usa el mismo motor por
  regla de Apple) pausa los timers de JS de una pestaña no visible —
  reproducido en vivo: un cliente MQTT quedó conectado varios minutos sin
  publicar nada. El reporte periódico ahora también se dispara al evento
  `visibilitychange` (además del timer), para no depender de mantener la
  pantalla encendida sin interrupción.
- ¿Qué pasa si el backend cloud se reinicia (deploy o rotación de secrets)?
  El store operacional vive solo en memoria (Principio IV — Oracle es la
  única fuente de verdad persistente) — un restart lo vacía por completo.
  Oracle/APEX debe re-sincronizar (`sincronizar_recorrido`) los recorridos
  activos después de cualquier deploy/reinicio del backend cloud.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST desplegar `frontend/`, `central/` y `backend/` en cloud sin conectividad saliente directa desde cloud hacia Oracle local.
- **FR-002**: El sistema MUST exponer un endpoint de integración para alta/actualización de recorridos desde Oracle/APEX local hacia cloud.
- **FR-003**: El sistema MUST exponer un endpoint de integración para consulta de estado de arribos/descargas desde Oracle/APEX local.
- **FR-004**: El sistema MUST usar MQTT como canal **primario** para publicación de ubicación periódica de chofer en el tópico `chofer/{fleteId}/ubicacion`. *(Implementado sin namespace de versión — el diseño original proponía `v1/...`; se descartó por simplicidad, sin necesidad identificada de coexistencia de versiones de payload todavía.)* *(actualizado 2026-08-10, ver Clarifications)*: el reporte REST equivalente (`POST /:token/ubicacion`, FR-014 de `specs/001-chofer-recorrido/spec.md`) deja de publicarse en paralelo en cada ciclo y pasa a ser **fallback silencioso**, invocado únicamente cuando la publicación MQTT del ciclo falla.
- **FR-005**: El frontend Central MUST *(elevado de SHOULD a MUST, 2026-08-10 — ver Clarifications)* suscribirse directamente al broker MQTT vía WebSocket para ubicación en vivo. *(Implementado en `central/src/services/mqttClient.js`, pero sin credenciales configuradas en producción — activar `VITE_MQTT_*` en `central/.env.production` con la credencial de servicio de solo-lectura ya prevista queda dentro del alcance de este cambio.)*
- **FR-006**: El backend MUST suscribirse a MQTT para persistir ubicación y soportar consultas vía `GET /api/central/recorridos/activos` — es la única vía que hoy entrega ubicación en vivo a Central en producción.
- **FR-007**: El sistema MUST mantener polling REST en Central como mecanismo primario de reconciliación de estado de negocio y ubicación (no solo fallback, ver FR-005/FR-006).
- **FR-008**: El sistema MUST autenticar y autorizar llamadas de integración Oracle/APEX a backend cloud mediante credenciales técnicas (`INTEGRACION_API_KEY`/`INTEGRACION_BEARER_TOKEN`, ver `integracionAuth.js`).
- **FR-009**: El sistema MUST documentar y estandarizar QoS y políticas de sesión MQTT (ver `contracts/mqtt-topics.md`) — acotado en la práctica a un único tópico de ubicación, QoS 1, sin retained.
- **FR-010**: El sistema MUST registrar recomendaciones de proveedores para broker MQTT y edge/proxy (EMQX y Cloudflare), con criterios de selección.
- **FR-011** *(agregado 2026-08-06, superseded 2026-08-10 — ver FR-013)*: El sistema MUST aprovisionar, por cada `fleteId` recibido de Oracle/APEX, una credencial MQTT **publish-only scoped a su propio tópico** (`chofer/{fleteId}/ubicacion`) — nunca una credencial compartida ni embebida en build, dado que el bundle del chofer es público. Ver `backend/src/mqtt/emqxProvisioning.js` y `contracts/mqtt-topics.md`. *(Este modelo por-flete/efímero queda reemplazado por FR-013; se conserva aquí como referencia histórica del diseño actualmente implementado.)*
- **FR-012** *(agregado 2026-08-06)*: El sistema MUST capturar la ubicación GPS del dispositivo del chofer al marcar arribo/descarga (si está disponible) y exponerla a Oracle/APEX vía `GET /api/integracion/estado` (`arriboLat`/`arriboLon`/`descargaLat`/`descargaLon`), como dato de auditoría de "desde dónde" se confirmó cada evento — distinto de la ubicación periódica de FR-004 (que es de tránsito, no de evento).
- **FR-013** *(agregado 2026-08-10, ver Clarifications)*: El sistema MUST aprovisionar una credencial MQTT **permanente por chofer** (`chofer-{choferId}`, no rotable, no ligada al ciclo de vida de un `fleteId` individual), con ACL de publish sobre el wildcard `chofer/+/ubicacion` (no scoped a un único fleteId). Requiere que Oracle/APEX incluya `choferId` en el payload de `POST /api/integracion/recorridos` (campo nuevo, hoy inexistente). Reemplaza el aprovisionamiento por-flete de FR-011 para el reporte de ubicación periódica (FR-004).

### Key Entities

- **RecorridoCloud**: representación operativa de recorrido en store cloud, sincronizada desde Oracle/APEX local.
- **EstadoRecorrido**: estado consolidado de puntos (pendiente/arribado/completado) con timestamps en cloud.
- **UbicacionTiempoReal**: evento MQTT de ubicación `{fleteId, lat, lon, en, eventId}`.
- **CredencialMqttFlete** *(agregado 2026-08-06, superseded 2026-08-10)*: usuario MQTT publish-only por `fleteId` (`chofer-{fleteId}`), password determinística (HMAC del fleteId), ACL scoped a `chofer/{fleteId}/ubicacion`. Aprovisionada por el backend al recibir el recorrido de Oracle; no tiene revocación automática todavía (ver Assumptions). Reemplazada por `CredencialMqttChofer` (ver abajo) para el reporte de ubicación periódica.
- **Chofer** *(agregado 2026-08-10)*: identidad estable de chofer, con `choferId` proveniente de Oracle (sistema maestro administrativo, Principio IV) — hoy inexistente en el payload de sincronización; se agrega como campo nuevo en `POST /api/integracion/recorridos` (ver FR-013).
- **CredencialMqttChofer** *(agregado 2026-08-10)*: usuario MQTT permanente por `choferId` (`chofer-{choferId}`), no ligado al ciclo de vida de un `fleteId` individual, ACL de publish sobre el wildcard `chofer/+/ubicacion` (riesgo de spoofing entre fletes aceptado explícitamente, ver Assumptions).
- **SyncJobOracleApex**: proceso local que invoca endpoints de integración cloud para enviar/consultar datos.
- **ProveedorServicio**: decisión documentada de proveedor (EMQX para MQTT, Cloudflare para edge/security).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Oracle/APEX local puede sincronizar recorridos a cloud con tasa de éxito >= 99.5% en ventanas de 24h.
- **SC-002**: Central recibe ubicación en vivo en <= 2 segundos p95 desde publicación MQTT del chofer.
- **SC-003**: Endpoint de consulta de estado responde en <= 1 segundo p95 para consultas de recorrido individual.
- **SC-004**: Ante caída de sesión MQTT en Central, la recuperación automática ocurre en <= 15 segundos en condiciones normales de red.
- **SC-005**: La persistencia de ubicación por backend bridge no pierde mensajes confirmados por broker (QoS configurado) en pruebas de reconexión controlada.

## Assumptions

- Oracle local sigue siendo sistema maestro para carga inicial/administrativa de recorridos, pero cloud es el plano operativo para ejecución diaria.
- Los endpoints de integración cloud estarán expuestos detrás de un borde seguro (WAF/TLS/rate limiting).
- El broker MQTT soportará WebSocket seguro (`wss://`) para consumo desde navegador Central.
- El frontend chofer mantiene su estrategia híbrida de resiliencia offline (cola local + MQTT + backend idempotente para eventos críticos).
- **(2026-08-06)** El store operacional cloud es puramente en memoria — no
  sobrevive a un `fly deploy` ni a una rotación de secrets (ambos reinician
  el proceso). Se asume que Oracle/APEX puede re-sincronizar bajo demanda;
  no hay todavía un job automático que lo haga solo tras detectar un
  restart del backend.
- **(2026-08-06)** No existe trigger de "recorrido finalizado" que dispare
  `revocarCredencial(fleteId)` — las credenciales MQTT por-flete quedan
  vivas en EMQX Cloud indefinidamente. Riesgo bajo (publish-only, un tópico
  propio) pero es deuda pendiente si el volumen de fletes crece mucho.
- **(2026-08-10)** Al migrar a credenciales MQTT permanentes por chofer con
  ACL amplia sobre `chofer/+/ubicacion` (ver Clarifications), se acepta
  explícitamente que un chofer autenticado puede técnicamente publicar en
  el topic de un `fleteId` ajeno (spoofing de ubicación de otro flete). Esto
  reabre, de forma consciente, el riesgo que el diseño original (research.md
  Decisión 6) había descartado para el modelo por-flete/efímero. Mitigación
  aceptada: el impacto de un mensaje falso es acotado (solo afecta
  `ultimaUbicacion` de tránsito, no eventos de arribo/descarga que siguen
  autenticados por token de recorrido) y el volumen de choferes es reducido
  y conocido (no es un bundle anónimo). No se implementa validación
  server-side adicional del remitente contra el `fleteId` del payload en el
  alcance de este cambio.