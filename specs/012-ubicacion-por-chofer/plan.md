# Implementation Plan: Ubicación en vivo ligada al chofer, no al viaje

**Branch**: `012-ubicacion-por-chofer` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-ubicacion-por-chofer/spec.md`

## Summary

El reporte de ubicación en vivo del chofer (canal MQTT que alimenta
`ultimaUbicacion` en Central) hoy está atado al `fleteId` del viaje vigente y
solo se dispara por un `setInterval` de 60s — que rara vez llega a disparar
porque el chofer no deja la app abierta manejando, y que deja de funcionar
por completo si el backend cloud pierde el recorrido de su store en memoria
(404 en `GET /:token`). El enfoque técnico: encaminar el reporte de posición
por `choferId` (identidad estable, ya tiene credencial MQTT permanente con
ACL amplia sobre `chofer/+/ubicacion`), disparar un reporte inmediato al
montar la app en vez de esperar el primer tick del timer, cachear
`{choferId, mqtt}` en `localStorage` del dispositivo como resiliencia ante un
404 del backend, y agregar contadores de salud del canal MQTT expuestos por
HTTP autenticado.

## Technical Context

**Language/Version**: JavaScript (ES2022+, Node.js ≥20.12 en backend; ES
modules en ambos paquetes)

**Primary Dependencies**: Express 4 + `mqtt` 5 (backend); React 18 + Vite +
`mqtt` 5 (frontend, SPA del chofer)

**Storage**: Backend: store en memoria del proceso (`integracionStore.js`,
sin base de datos — ya así antes de esta feature). Frontend: `localStorage`
del navegador (nuevo uso, ya hay un precedente idéntico en
`recorridoCache.js`).

**Testing**: `node --test` (backend, `backend/tests/{unit,contract,integration}`);
Vitest (frontend, `frontend/tests/**`)

**Target Platform**: Backend: contenedor Linux en Fly.io. Frontend: SPA
servida desde Cloudflare Workers/Pages, consumida desde navegador móvil
(chofer) y desktop/iframe APEX (Central, no tocado por esta feature).

**Project Type**: Web application (backend Express + frontend SPA React),
monorepo con dos paquetes (`backend/`, `frontend/`) — estructura ya
existente, sin cambios.

**Performance Goals**: Sin objetivos nuevos de throughput — volumen bajo
(decenas de choferes concurrentes como máximo, un reporte de ubicación cada
~60s por chofer más el disparo inmediato al abrir la app).

**Constraints**: El bróker MQTT (EMQX Cloud) y su esquema de credenciales/ACL
por-chofer ya existen y no se modifican (`backend/src/mqtt/emqxProvisioning.js`).
El nuevo endpoint de métricas debe reusar el middleware de auth de
integración ya existente (`validarAuthIntegracion`), sin introducir un
mecanismo de autenticación nuevo.

**Scale/Scope**: Cambios acotados a 2 servicios frontend (`ubicacionMqtt.js`,
`ubicacionPeriodica.js`), 1 componente de orquestación (`main.jsx`), 1 módulo
nuevo (`choferCache.js`); y en backend a 1 ruta (`recorrido.js`), el store
(`integracionStore.js`), el bridge MQTT (`mqttBridge.js`), 1 ruta nueva
(`integracion.js`) y el arranque (`server.js`). Sin cambios en Central ni en
el contrato de integración con Oracle.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: v5.0.0 (enmendada en esta misma sesión, ver
`.specify/memory/constitution.md`, Principio VII).

| Principio | Aplica | Evaluación |
|---|---|---|
| I. Chofer: página única, móvil-primero | Sí | Cumple — no se agrega ninguna pantalla/paso nuevo a la SPA del chofer; el disparo inmediato y la caché son invisibles para la UI. |
| II. Ruta acotada y ordenada, reordenamiento limitado | No aplica | Esta feature no toca la lista de puntos ni su orden. |
| III. Central embebible en APEX y de acceso directo | No aplica | Central no se modifica en esta feature (FR-006 solo retiene en memoria, sin panel nuevo). |
| IV. Fuentes de verdad por dominio, sincronización explícita | Sí | Cumple — Oracle sigue siendo la fuente del `choferId`/asignación; el store cloud sigue siendo la fuente autoritativa de `ultimaUbicacion`. No se agrega ninguna sincronización implícita nueva. |
| V. Trazabilidad de estado/ubicación en (casi) tiempo real | Sí | Refuerza este principio directamente — es la motivación central de la feature. |
| VI. Mensajería interna confiable | No aplica | No es el canal de mensajes chofer↔Central, es telemetría de posición. |
| VII. Simplicidad y datos mínimos, con resiliencia acotada | Sí | Cumple bajo la enmienda v5.0.0: la excepción de resiliencia (FR-004/FR-005/FR-006) es exactamente el caso que el Principio VII ahora contempla — chofer con asignación real, backend con memoria transitoriamente inconsistente. No se recolecta ubicación de choferes sin ninguna asignación. |
| Framework backend: Express obligatorio | Sí | Cumple — no se introduce ningún framework nuevo; el endpoint de métricas es una ruta Express más. |

**Resultado**: PASA sin excepciones. No hace falta completar "Complexity
Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/012-ubicacion-por-chofer/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── routes/
│   │   ├── recorrido.js        # GET /:token — expone choferId + mqtt (por choferId)
│   │   └── integracion.js      # nuevo GET /mqtt/estado
│   ├── state/
│   │   └── integracionStore.js # recorridoPorChofer, ultimaUbicacionPorChofer
│   ├── services/
│   │   └── mqttBridge.js       # ruteo por choferId + contadores de métricas
│   ├── mqtt/
│   │   └── emqxProvisioning.js # sin cambios (topicPara ya genérico)
│   └── server.js               # pasa el controlador del bridge a createApp
└── tests/
    ├── unit/
    │   ├── integracion-store-central.test.js  # actualizar a choferId
    │   └── mqttBridge.test.js                 # nuevo
    └── routes/ (si existe integracion*.test.js — agregar caso /mqtt/estado)

frontend/
├── src/
│   ├── services/
│   │   ├── ubicacionMqtt.js      # publisher por choferId
│   │   ├── ubicacionPeriodica.js # disparo inmediato al montar
│   │   └── choferCache.js        # nuevo
│   └── main.jsx                  # deriva choferId/mqttConfig con fallback a caché
└── tests/
    └── services/
        └── ubicacionPeriodica.test.js  # actualizar + test nuevo de disparo inmediato
```

**Structure Decision**: Se reutiliza el monorepo `backend/` + `frontend/` ya
existente (Web application, Opción 2 del template) — ningún directorio nuevo
de alto nivel, solo archivos nuevos/modificados dentro de la estructura
vigente.

## Complexity Tracking

*Sin violaciones — tabla omitida.*
