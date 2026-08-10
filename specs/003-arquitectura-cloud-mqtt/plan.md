# Implementation Plan: Arquitectura Cloud + Integracion Oracle/APEX + MQTT

**Branch**: `003-arquitectura-cloud-mqtt` | **Date**: 2026-08-05, actualizado 2026-08-06 tras implementación | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-arquitectura-cloud-mqtt/spec.md`

**Estado (2026-08-06)**: implementado y verificado en vivo contra
producción. Ver "Divergencias respecto al plan original" al final de este
documento — el plan de abajo describe la intención al 2026-08-05; donde
difiere de lo construido, queda anotado en línea.

**Estado (2026-08-10)**: en re-planificación sobre rama
`006-credenciales-mqtt-chofer` — cambio de modelo de credenciales MQTT del
chofer, de publish-only efímero por-`fleteId` a **permanente por-`choferId`**
con ACL amplia (`chofer/+/ubicacion`), más activación de la suscripción MQTT
de Central en producción. Ver `## Clarifications` de `spec.md` (sesión
2026-08-10) para las decisiones que originan este cambio, y la sección
"Divergencias respecto al plan original" al final de este documento (entrada
2026-08-10) para el detalle. El resto de este plan (US1/US2, integración
Oracle/APEX, store en memoria) no cambia.

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
  nueva — usa `fetch` global) para aprovisionar credenciales. **(2026-08-10)**
  la función de aprovisionamiento pasa a indexar por `choferId` (nuevo campo
  del payload de `POST /api/integracion/recorridos`) en vez de `fleteId`; el
  ACL asociado deja de ser un tópico único y pasa a `chofer/+/ubicacion`.
- Frontend chofer: cliente MQTT por WebSocket (`mqtt`), credencial recibida
  del backend (`recorrido.mqtt`), nunca de variables de build. El reporte
  periódico sigue publicando por REST como **fallback silencioso** (solo si
  falla el intento MQTT del ciclo), no en paralelo siempre.
- Central frontend: cliente MQTT por WebSocket ya implementado
  (`central/src/services/mqttClient.js`). **(2026-08-10)** pasa a requerir
  `VITE_MQTT_*` configurado en `central/.env.production` — activar esa
  suscripción en producción es parte de este cambio (antes era opcional/dormant).
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

*Re-chequeado 2026-08-10 contra el cambio de credenciales MQTT permanentes por-chofer (rama `006-credenciales-mqtt-chofer`).*

- Principio IV: PASS — `choferId` se agrega como campo nuevo del payload de Oracle→cloud (`POST /api/integracion/recorridos`); Oracle sigue siendo el maestro administrativo de esa identidad, el cloud solo la recibe y usa para indexar la credencial. No se crea una segunda fuente de verdad de choferes.
- Principio V: PASS — sin degradación; activar la suscripción MQTT de Central en producción (FR-005 elevado a MUST) mejora la trazabilidad en vivo respecto al estado actual (dependencia exclusiva de polling).
- **Principio VII: CONDICIONADO, con riesgo explícitamente aceptado (no un simple PASS).** El ACL amplio (`chofer/+/ubicacion` para una credencial permanente por-chofer) **reabre parcialmente** el riesgo que research.md Decisión 6 había descartado para el modelo por-flete: un chofer autenticado puede técnicamente publicar en el tópico de un `fleteId` que no es suyo. Esto se aceptó explícitamente en la sesión de clarificación 2026-08-10 (ver `spec.md` Assumptions) bajo estas condiciones:
  - El impacto de un mensaje falso queda acotado a `ultimaUbicacion` de tránsito (dato efímero, no autoritativo) — los eventos de arribo/descarga siguen autenticados por token de recorrido, fuera de este vector.
  - La población de choferes es reducida, conocida y administrada por Oracle (no es un bundle anónimo público sin identidad).
  - No se implementa validación server-side adicional del remitente contra el `fleteId` del payload en el alcance de este cambio (documentado como deuda, no como gap silencioso).
  - Justificación de la complejidad/riesgo: pasar a ACL dinámica por asignación (alternativa más segura, evaluada y descartada en la clarificación) hubiera requerido que el backend actualizara la regla de ACL de EMQX en cada cambio de recorrido del chofer — complejidad operativa adicional no justificada para el volumen actual de fletes/choferes.

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
    └── mqttClient.js              # ya existía; PENDIENTE (006): activar con VITE_MQTT_* en prod

frontend/src/
└── services/
    ├── ubicacionMqtt.js           # recibe {url, username, password} por parámetro (2026-08-06)
    └── ubicacionPeriodica.js      # + listener visibilitychange (fix iOS, 2026-08-06)
                                    # PENDIENTE (006): REST pasa a fallback silencioso, no paralelo
```

**Cambios de estructura previstos para 006-credenciales-mqtt-chofer** (no
implementados todavía — ver `tasks.md` pendiente de regenerar):
- `backend/src/mqtt/emqxProvisioning.js`: nueva función de aprovisionamiento
  indexada por `choferId` con ACL `chofer/+/ubicacion` (reemplaza el
  aprovisionamiento por-`fleteId` para el caso de ubicación periódica).
- `backend/src/routes/integracion.js`: aceptar y propagar `choferId` del
  payload de `POST /api/integracion/recorridos`.
- `backend/src/state/integracionStore.js`: persistir `choferId` en
  `RecorridoCloud`.
- `central/.env.production`: configurar `VITE_MQTT_*`.

**Structure Decision**: Extender backend y frontends existentes; introducir integración y MQTT por módulos de servicio, sin reescribir arquitectura base. El aprovisionamiento de credenciales (`emqxProvisioning.js`) se agregó como módulo más dentro de `backend/` — no como servicio aparte — siguiendo la misma decisión de estructura tomada en 002 (Principio VII).

## Divergencias respecto al plan original

Ver la tabla equivalente al final de `contracts/mqtt-topics.md` para el
detalle tópico por tópico. En resumen: el namespace `v1/` y los tópicos de
`estado`/`control` propuestos originalmente no se implementaron (arribo y
descarga se quedaron en REST); la credencial MQTT del chofer terminó siendo
dinámica y por-flete en vez de una credencial compartida rotable; Central
tiene el código de consumo directo listo pero no desplegado con
credenciales reales.

**2026-08-10 (rama `006-credenciales-mqtt-chofer`)**: el modelo por-flete
descrito arriba (implementado 2026-08-06) se reemplaza por credenciales
**permanentes por-choferId** con ACL amplia — ver Constitution Check
actualizado arriba y `spec.md` Clarifications. Este es un cambio consciente
que reabre parcialmente el riesgo que la iteración anterior había cerrado;
no es una regresión no advertida.