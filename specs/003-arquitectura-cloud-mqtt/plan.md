# Implementation Plan: Arquitectura Cloud + Integracion Oracle/APEX + MQTT

**Branch**: `003-arquitectura-cloud-mqtt` | **Date**: 2026-08-05, actualizado 2026-08-06 tras implementación | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-arquitectura-cloud-mqtt/spec.md`

**Estado (2026-08-06)**: implementado y verificado en vivo contra
producción. Ver "Divergencias respecto al plan original" al final de este
documento — el plan de abajo describe la intención al 2026-08-05; donde
difiere de lo construido, queda anotado en línea.

## Summary

Se formaliza una arquitectura operativa cloud para VickyTruck: `frontend/`, `central/` y
`backend/` desplegados en cloud, Oracle/APEX permanecen en entorno local sin conexión
entrante desde cloud, y la sincronización se realiza por endpoints HTTPS de integración.
La ubicación en tiempo real se distribuye por MQTT: chofer publica, Central consume
directamente por WebSocket y backend bridge persiste para histórico y auditoría.
**Implementado**: el chofer publica con una credencial MQTT publish-only
aprovisionada dinámicamente por-flete (no una credencial fija) — ver
Decisión 6 de research.md. El consumo directo de Central por WebSocket
existe en código pero no tiene credenciales configuradas en producción; el
camino que efectivamente entrega ubicación a Central hoy es backend bridge
→ polling REST.

## Technical Context

**Language/Version**: JavaScript ESM (Node.js 20+, React 18), SQL/PLSQL para integración local.

**Primary Dependencies**:
- Backend: Express existente + cliente MQTT (`mqtt`) para bridge + admin API HTTP
  nativa de EMQX Cloud (`backend/src/mqtt/emqxProvisioning.js`, sin dependencia
  nueva — usa `fetch` global) para aprovisionar credenciales por-flete.
- Frontend chofer: cliente MQTT por WebSocket (`mqtt`), credencial recibida
  del backend (`recorrido.mqtt`), nunca de variables de build.
- Central frontend: cliente MQTT por WebSocket ya implementado
  (`central/src/services/mqttClient.js`) — **sin credenciales configuradas
  en producción** (`VITE_MQTT_*` vacíos en `central/.env.production`).
- Infra: broker MQTT gestionado — **EMQX Cloud, confirmado y en uso**
  (no solo recomendado); edge/CDN — Cloudflare Workers para los dos frontends
  estáticos (confirmado en uso), sin WAF/edge security adicional configurado
  todavía más allá de lo que Cloudflare Workers da por default.

**Storage**:
- Store cloud operacional para recorridos, estados y ubicación consolidada
  — **implementado como Map en memoria del proceso** (`integracionStore.js`),
  sin ninguna base de datos propia. Se pierde por completo en cada
  reinicio del proceso backend; requiere re-sincronización manual desde
  Oracle (fricción operativa real, confirmada en vivo varias veces durante
  el desarrollo de este feature).
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

*Re-chequeado 2026-08-06 contra lo implementado (no solo lo planeado).*

- Principio I: PASS (sin cambios a UX móvil chofer; `recorrido.mqtt` es transparente para el usuario).
- Principio II: PASS (límite de puntos se mantiene en dominio recorrido).
- Principio III: PASS (Central embebida o acceso directo se conserva; sin cambios de este feature en ese eje).
- Principio IV: PASS (constitución v3.0.0 ya adoptó "Fuentes de Verdad por Dominio y Sincronización Explícita"). Riesgo operativo real y aceptado: el store cloud efímero exige re-sincronización manual tras cada reinicio del backend — no viola el principio (Oracle sigue siendo la fuente administrativa), pero es fricción sin automatizar todavía.
- Principio V: PASS (MQTT mejora latencia de trazabilidad; GPS de auditoría agregado en arribo/descarga, FR-012).
- Principio VI: N/A (mensajería interna fuera de alcance de este cambio).
- Principio VII: PASS condicionado: complejidad agregada (broker + aprovisionamiento dinámico de credenciales) justificada explícitamente por seguridad (research.md Decisión 6) — una credencial MQTT compartida embebida en un bundle público le habría dado a cualquier chofer la capacidad de publicar ubicación falsa para cualquier otro flete.

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

### Source Code (implementado — actualizado 2026-08-06)

```text
backend/src/
├── routes/
│   ├── integracion.js             # POST /recorridos (+ dispara provisioning MQTT), GET /estado
│   └── recorrido.js               # GET /:token ahora incluye recorrido.mqtt (2026-08-06)
├── services/
│   └── mqttBridge.js              # suscripción propia del backend a chofer/+/ubicacion
├── mqtt/
│   └── emqxProvisioning.js        # NUEVO 2026-08-06 — credencial publish-only por fleteId
└── server.js                      # monta /api/integracion + inyecta emqxProvisioning

backend/scripts/
└── emqx-setup.js                  # NUEVO 2026-08-06 — setup admin de una sola vez (ACL del backend)

backend/sql/integracion-cloud/
└── integracion_cloud_api.pkb.sql  # + leer_estado_puntos (pull Cloud->Oracle, 2026-08-06)

central/src/
└── services/
    └── mqttClient.js              # ya existía; sin credenciales configuradas en producción

frontend/src/
└── services/
    ├── ubicacionMqtt.js           # recibe {url, username, password} por parámetro (2026-08-06)
    └── ubicacionPeriodica.js      # + listener visibilitychange (fix iOS, 2026-08-06)
```

**Structure Decision**: Extender backend y frontends existentes; introducir integración y MQTT por módulos de servicio, sin reescribir arquitectura base. El aprovisionamiento de credenciales (`emqxProvisioning.js`) se agregó como módulo más dentro de `backend/` — no como servicio aparte — siguiendo la misma decisión de estructura tomada en 002 (Principio VII).

## Divergencias respecto al plan original

Ver la tabla equivalente al final de `contracts/mqtt-topics.md` para el
detalle tópico por tópico. En resumen: el namespace `v1/` y los tópicos de
`estado`/`control` propuestos originalmente no se implementaron (arribo y
descarga se quedaron en REST); la credencial MQTT del chofer terminó siendo
dinámica y por-flete en vez de una credencial compartida rotable; Central
tiene el código de consumo directo listo pero no desplegado con
credenciales reales.