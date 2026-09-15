# Implementation Plan: Reporte de ubicación directo al backend (broker opcional)

**Branch**: `013-mqtt-a-backend-directo` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-mqtt-a-backend-directo/spec.md`

## Summary

El reporte de ubicación del chofer hoy intenta MQTT primero y cae a un POST
REST solo si el publish falla — pero ese fallback REST escribe en un store
(`ubicacionEnMemoria.js`) que Central nunca lee; Central solo ve lo que
llega vía el bridge MQTT (`integracionStore.actualizarUbicacionPorChofer`).
Esta feature invierte la preferencia (directo por defecto, broker opcional
por configuración) mediante un único flag de entorno leído en el backend:
cuando el modo preferido no es `"broker"`, `GET /:token` devuelve `mqtt:
null` — el frontend del chofer ya trata eso como "no publicar por MQTT" y
cae directo al POST REST sin ningún cambio de código. El fix real y
necesario es que ese POST REST alimente el mismo store que lee Central
(`integracionStore`), reemplazando el store huérfano actual. El canal
broker se conserva intacto y totalmente funcional para cuando se prefiera
(config `UBICACION_CANAL_PREFERIDO=broker`), y el endpoint de salud
existente (`GET /api/integracion/mqtt/estado`) gana un campo que distingue
"inactivo por preferencia" de "debería estar activo pero no responde".

## Technical Context

**Language/Version**: JavaScript (ES2022+, Node.js ≥20.12 en backend; ES
modules en ambos paquetes)

**Primary Dependencies**: Express 4 + `mqtt` 5 (backend); React 18 + Vite +
`mqtt` 5 (frontend del chofer, sin cambios de dependencias — la librería
`mqtt` se mantiene para cuando el modo broker esté activo)

**Storage**: Backend: store en memoria del proceso (`integracionStore.js`,
sin base de datos). El módulo `ubicacionEnMemoria.js` (store huérfano,
solo escrito por el POST de ubicación y no leído por ningún consumidor de
Central en producción) se retira en favor de escribir directo en
`integracionStore` — mismo mecanismo que ya usa el bridge MQTT.

**Testing**: `node --test` (backend, `backend/tests/{unit,contract,integration}`);
Vitest (frontend del chofer, `frontend/tests/**`)

**Target Platform**: Backend: contenedor Linux en Fly.io. Frontend del
chofer: SPA servida desde Cloudflare Workers/Pages. Central (`central/`,
paquete separado) no requiere cambios de código — ver Decisión 3 en
research.md sobre su suscripción MQTT propia desde el navegador.

**Project Type**: Web application (monorepo con `backend/`, `frontend/` y
`central/`) — estructura ya existente, sin paquetes nuevos.

**Performance Goals**: Sin objetivos nuevos de throughput. El intervalo de
reporte periódico existente (`intervaloUbicacionMs`, configurable, 60s por
defecto) sigue siendo la referencia de frescura esperada (ver SC-001,
resuelto en clarificación: sin umbral nuevo en segundos).

**Constraints**: El bróker MQTT (EMQX Cloud) y su esquema de credenciales
por-chofer (`emqxProvisioning.js`) no se modifican ni se desmantelan — deben
seguir funcionando end-to-end cuando el modo preferido sea `"broker"`
(FR-004). El nuevo campo del endpoint de estado debe reusar el contrato y
middleware de auth ya existentes (`validarAuthIntegracion`), sin introducir
autenticación nueva. No se agregan contadores agregados dedicados al canal
directo (resuelto en clarificación: alcanza con la última ubicación
conocida por chofer, ya expuesta).

**Scale/Scope**: Cambios acotados a: 1 helper de configuración nuevo
(backend), 1 ruta existente modificada (`recorrido.js`, ambos handlers:
`GET /:token` y `POST /:token/ubicacion`), 1 ruta existente con un campo
nuevo en su respuesta (`integracion.js`, `/mqtt/estado`), retiro del store
huérfano (`ubicacionEnMemoria.js`) y su reemplazo por escritura directa en
`integracionStore`. Sin cambios en `frontend/` (chofer) ni en `central/`
(el comportamiento por defecto de ambos ya es correcto ante `mqtt: null` /
`VITE_MQTT_BROKER_URL` sin configurar, respectivamente — ver research.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: v5.0.0 (`.specify/memory/constitution.md`).

| Principio | Aplica | Evaluación |
|---|---|---|
| I. Chofer: página única, móvil-primero | Sí | Cumple — cero cambios de UI/UX en la app del chofer; el cambio es puramente de qué credencial recibe del backend. |
| II. Ruta acotada y ordenada, reordenamiento limitado | No aplica | No toca la lista de puntos ni su orden. |
| III. Central embebible en APEX y de acceso directo | No aplica | Sin cambios de código en `central/`; su badge/suscripción MQTT propia se apaga por configuración de despliegue (`VITE_MQTT_BROKER_URL` sin setear), comportamiento ya soportado hoy (`onEstado("disabled")`). |
| IV. Fuentes de verdad por dominio, sincronización explícita | Sí | Cumple — no cambia qué sistema es autoritativo de qué; solo corrige que el reporte directo alimente el store operacional correcto (`integracionStore`), que ya es la fuente autoritativa de `ultimaUbicacion` documentada desde 002/012. |
| V. Trazabilidad de estado/ubicación en (casi) tiempo real | Sí | Refuerza este principio: corrige un canal que hoy no llega a Central (fallback REST huérfano) y mantiene la cadencia de reporte ya configurada como referencia de frescura. |
| VI. Mensajería interna confiable | No aplica | No es el canal de mensajes chofer↔Central, es telemetría de posición. |
| VII. Simplicidad y datos mínimos, con resiliencia acotada | Sí | Cumple y refuerza — un solo flag de configuración reemplaza la necesidad de mantener credenciales/infraestructura de broker activa por defecto; se retira un store redundante en vez de agregar uno nuevo. No se agregan contadores nuevos (resuelto en clarificación) — menor superficie, no mayor. |
| Framework backend: Express obligatorio | Sí | Cumple — no se introduce ningún framework nuevo. |

**Resultado**: PASA sin excepciones. No hace falta completar "Complexity
Tracking".

## Project Structure

### Documentation (this feature)

```text
specs/013-mqtt-a-backend-directo/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── config/
│   │   └── ubicacionCanal.js        # nuevo — lee UBICACION_CANAL_PREFERIDO, expone canalPreferido()
│   ├── routes/
│   │   ├── recorrido.js             # mqttConfigPara() corta a null si canal != "broker";
│   │   │                            # POST /:token/ubicacion escribe en integracionStore, no en ubicacionEnMemoria
│   │   └── integracion.js           # GET /mqtt/estado agrega campo canalPreferido
│   └── state/
│       └── ubicacionEnMemoria.js    # retirado (dead code tras el fix del POST) — ver research.md Decisión 2
└── tests/
    ├── unit/
    │   └── ubicacion-canal.test.js  # nuevo — cobertura del helper de configuración
    ├── contract/
    │   ├── post-ubicacion.test.js         # actualizar: aserciones contra integracionStore, no ubicacionEnMemoria
    │   └── integracion-endpoints.test.js  # agregar caso: campo canalPreferido en /mqtt/estado
    └── integration/
        └── ubicacion-tiempo-real.test.js  # actualizar si referencia ubicacionEnMemoria directamente

# frontend/ (chofer) y central/: sin cambios de código — ver research.md
# Decisión 1 y Decisión 3 (comportamiento ya correcto ante mqtt:null /
# broker sin configurar).
```

**Structure Decision**: Se reutiliza el monorepo existente (`backend/`,
`frontend/`, `central/`) — ningún directorio ni paquete nuevo. Todos los
cambios de código quedan contenidos en `backend/`.

## Complexity Tracking

*Sin violaciones — tabla omitida.*
