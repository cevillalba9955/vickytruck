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

## Recomendación combinada

- EMQX como broker MQTT principal.
- Cloudflare como borde de seguridad y publicación de APIs HTTPS.
- Criterios de adopción:
  - SLO de latencia y disponibilidad.
  - Costo mensual por conexiones concurrentes y egress.
  - Facilidad de operación del equipo (runbooks, alertas, soporte).