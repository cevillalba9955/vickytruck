# Feature Specification: Arquitectura Cloud + Integracion Oracle/APEX + MQTT

**Feature Branch**: `003-arquitectura-cloud-mqtt`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "mover frontend/central/backend a cloud sin acceso directo a Oracle, integrar Oracle/APEX local por endpoints y usar broker MQTT para ubicacion en tiempo real"

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

### User Story 3 - Monitoreo en tiempo real con MQTT directo en Central (Priority: P1)

El panel Central consume ubicación en tiempo real suscribiéndose directamente al broker MQTT (sobre WebSocket), mientras backend también suscribe para persistencia analítica.

**Why this priority**: Entrega baja latencia visual y mantiene historial consultable por backend.

**Independent Test**: Publicar ubicación desde chofer y verificar recepción en Central en tiempo real, junto con persistencia en backend.

**Acceptance Scenarios**:

1. **Given** un chofer activo, **When** publica `v1/chofer/{fleteId}/ubicacion`, **Then** Central actualiza su vista sin esperar polling REST.
2. **Given** publicaciones MQTT válidas, **When** backend bridge consume el topic, **Then** persiste la última ubicación para consultas históricas.

---

### Edge Cases

- ¿Qué pasa si Oracle/APEX local no tiene conectividad temporal hacia cloud? Debe existir reintento controlado desde jobs/scripts sin perder consistencia.
- ¿Qué pasa si Central pierde conexión MQTT? Debe reconectar automáticamente y reconciliar estado vía API backend (polling de respaldo).
- ¿Qué pasa si llegan mensajes MQTT duplicados o fuera de orden? Backend debe aplicar idempotencia por `eventId`/timestamp y reglas de precedencia.
- ¿Qué pasa si el broker está operativo pero backend bridge no? Central puede seguir viendo tiempo real, pero debe existir alerta operativa por falta de persistencia.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST desplegar `frontend/`, `central/` y `backend/` en cloud sin conectividad saliente directa desde cloud hacia Oracle local.
- **FR-002**: El sistema MUST exponer un endpoint de integración para alta/actualización de recorridos desde Oracle/APEX local hacia cloud.
- **FR-003**: El sistema MUST exponer un endpoint de integración para consulta de estado de arribos/descargas desde Oracle/APEX local.
- **FR-004**: El sistema MUST usar MQTT para publicación de ubicación de chofer en topic jerárquico versionado con prefijo de versión (`v1/...`).
- **FR-005**: El frontend Central MUST suscribirse directamente al broker MQTT vía WebSocket para ubicación en vivo.
- **FR-006**: El backend MUST suscribirse en paralelo a MQTT para persistir ubicación y soportar consultas históricas/auditoría.
- **FR-007**: El sistema MUST mantener polling REST en Central como reconciliación de estado de negocio (fallback ante pérdida MQTT).
- **FR-008**: El sistema MUST autenticar y autorizar llamadas de integración Oracle/APEX a backend cloud mediante credenciales técnicas rotables.
- **FR-009**: El sistema MUST documentar y estandarizar QoS, retención y políticas de sesión MQTT por tipo de evento (al menos: ubicación, estado y control).
- **FR-010**: El sistema MUST registrar recomendaciones de proveedores para broker MQTT y edge/proxy (EMQX y Cloudflare), con criterios de selección.

### Key Entities

- **RecorridoCloud**: representación operativa de recorrido en store cloud, sincronizada desde Oracle/APEX local.
- **EstadoRecorrido**: estado consolidado de puntos (pendiente/arribado/completado) con timestamps en cloud.
- **UbicacionTiempoReal**: evento MQTT de ubicación `{fleteId, lat, lon, en, eventId}`.
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