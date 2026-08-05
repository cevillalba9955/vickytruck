# Implementation Plan: Arquitectura Cloud + Integracion Oracle/APEX + MQTT

**Branch**: `003-arquitectura-cloud-mqtt` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-arquitectura-cloud-mqtt/spec.md`

## Summary

Se formaliza una arquitectura operativa cloud para VickyTruck: `frontend/`, `central/` y
`backend/` desplegados en cloud, Oracle/APEX permanecen en entorno local sin conexión
entrante desde cloud, y la sincronización se realiza por endpoints HTTPS de integración.
La ubicación en tiempo real se distribuye por MQTT: chofer publica, Central consume
directamente por WebSocket y backend bridge persiste para histórico y auditoría.

## Technical Context

**Language/Version**: JavaScript ESM (Node.js 20+, React 18), SQL/PLSQL para integración local.

**Primary Dependencies**:
- Backend: Express existente + cliente MQTT (`mqtt`) para bridge.
- Central frontend: cliente MQTT por WebSocket (`mqtt` o equivalente browser-safe).
- Infra: broker MQTT gestionado (EMQX recomendado), edge security/proxy (Cloudflare recomendado).

**Storage**:
- Store cloud operacional para recorridos, estados y ubicación consolidada.
- Oracle local como sistema maestro administrativo de precarga.

**Testing**:
- Backend: `node --test` (contrato/integración de endpoints de integración y bridge MQTT).
- Frontend central: `vitest` para adaptación de estado MQTT + fallback polling.
- Pruebas E2E de conectividad MQTT + resiliencia reconexión.

**Target Platform**: Navegadores modernos (chofer y central), backend cloud Linux containerizado, Oracle/APEX on-prem.

**Project Type**: Web app distribuida con integración híbrida on-prem/cloud.

**Performance Goals**:
- Ubicación en vivo p95 <= 2 s.
- Consulta estado integración p95 <= 1 s.

**Constraints**:
- Sin acceso cloud->Oracle local.
- Integración solo por HTTPS autenticado desde Oracle/APEX local.
- MQTT sobre `wss://` para clientes browser.

**Scale/Scope**: Decenas a cientos de fletes concurrentes por tenant operativo inicial.

## Constitution Check

- Principio I: PASS (sin cambios a UX móvil chofer).
- Principio II: PASS (límite de puntos se mantiene en dominio recorrido).
- Principio III: PASS (Central embebida o acceso directo se conserva).
- Principio IV: PASS (constitución v3.0.0 ya adoptó "Fuentes de Verdad por Dominio y Sincronización Explícita").
- Principio V: PASS (MQTT mejora latencia de trazabilidad).
- Principio VI: N/A (mensajería interna fuera de alcance de este cambio).
- Principio VII: PASS condicionado: complejidad agregada (broker) justificada por latencia y desacople.

## Project Structure

### Documentation (this feature)

```text
specs/003-arquitectura-cloud-mqtt/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── contracts/
│   ├── integracion-api.md
│   └── mqtt-topics.md
├── tasks.md
└── checklists/
    └── requirements.md
```

### Source Code (planned deltas)

```text
backend/src/
├── routes/
│   └── integracion.js             # NUEVO
├── services/
│   └── mqttBridge.js              # NUEVO
└── server.js                      # montar /api/integracion

central/src/
└── services/
    └── mqttClient.js              # NUEVO

frontend/src/
└── services/
    └── ubicacionMqtt.js           # NUEVO/ajuste
```

**Structure Decision**: Extender backend y frontends existentes; introducir integración y MQTT por módulos de servicio, sin reescribir arquitectura base.