# Implementation Plan: Entrega de Recorrido y Token de Bróker para Frontend Desplegado en la Nube

**Branch**: `004-chofer-cloud-broker` | **Date**: 2026-08-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-chofer-cloud-broker/spec.md`

## Summary

Permitir que el frontend del chofer (`frontend/`, ya preparado para Cloudflare Pages/Workers
vía `wrangler.jsonc`) se sirva desde un hosting público sin ninguna conectividad hacia el
backend local. El mecanismo: el payload completo del recorrido (puntos + configuración de
conexión al bróker EMQX Cloud, incluyendo el token de publicación) viaja **embebido en el
fragmento (`#...`) del enlace único** que Central genera al asignar un recorrido — un
fragmento de URL nunca se envía al servidor que sirve el HTML/JS, así que abrir el enlace no
implica ninguna llamada de red hacia el backend. A partir de ahí, toda comunicación de la app
(ubicación, "Llegué", "Descarga completa") usa exclusivamente el bróker ya definido en
`003-mqtt-broker-fletes`. El token de publicación queda además atado al primer dispositivo que
lo usa, mediante un `clientId` MQTT persistido en el dispositivo y un observador del backend
sobre los eventos de conexión (`$SYS`) del bróker, que expulsa (kick) sesiones de un `clientId`
distinto para el mismo token.

Esto retira `GET /api/recorridos/:token` (ya no lo necesita el frontend del chofer) y extiende
`POST /api/central/recorridos/:id/asignar` / `.../reasignar` para que devuelvan el enlace
completo listo para copiar, en vez de solo el `token` crudo.

## Technical Context

**Language/Version**: JavaScript (Node.js ≥20.12 en backend; ES2022+ en frontend/central vía Vite) — ya establecido en el repo, sin cambios.

**Primary Dependencies**: `frontend/` — React 18 + Vite + `mqtt` (mqtt.js, WebSocket) + `wrangler` (Cloudflare Pages/Workers, ya configurado en `frontend/wrangler.jsonc`); `backend/` — Express 4 + `mqtt` (cliente de servicio, ya usado por `backend/src/mqtt/subscriber.js`) + `oracledb`; `central/` — React 18 + Vite (sin cambios de dependencias).

**Storage**: Oracle (fuente de verdad para recorridos/puntos/asignaciones, sin cambios — Principio IV). Estado efímero nuevo en memoria del backend: vínculo `token → clientId` del primer dispositivo (mismo patrón que `backend/src/state/ubicacionEnMemoria.js`).

**Testing**: `node --test` (backend, contract/integration/unit ya existentes) y `vitest` (frontend, central).

**Target Platform**: Cloudflare Pages/Workers (assets estáticos) para `frontend/` — ya configurado en el repo (`frontend/wrangler.jsonc`, `compatibility_date: 2026-08-04`, SPA fallback). Backend sigue corriendo on-premise (Express), sin exponer puertos entrantes ni IP pública (ya establecido en `003-mqtt-broker-fletes`). Bróker: EMQX Cloud (Serverless), ya provisionado.

**Performance Goals**: Carga del recorrido en <5s en conexión móvil típica (SC-001, hereda SC-001 de `001-chofer-recorrido`); sin llamadas de red adicionales para mostrar el recorrido (el payload ya viene en el enlace).

**Constraints**: El hosting del frontend NO debe tener conectividad hacia la red del backend local (FR-001). Ninguna llamada de red de la app del chofer hacia una IP/host del backend local, en ningún momento (FR-003). El plan Serverless de EMQX Cloud usado por el proyecto **no soporta autenticación HTTP por webhook** (confirmado por research, ver `research.md` §3) — el aislamiento por dispositivo (FR-005a) debe construirse solo con lo que sí soporta ese plan: autenticación por usuario/contraseña en base de datos integrada, reglas ACL vía API REST (ya usadas por `emqxProvisioning.js`), y suscripción a tópicos `$SYS`/eventos de conexión.

**Scale/Scope**: Igual que `001`/`003` — hasta 10 puntos por recorrido, un token de publicación por recorrido/flete activo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Chofer, página única, móvil-primero**: Sin cambios de UX estructural; sigue siendo una SPA. El único cambio es de dónde sale el payload inicial (URL en vez de `fetch`). ✅ PASS.
- **II. Ruta acotada (≤10 puntos)**: Sin cambios; el payload embebido contiene los mismos puntos que hoy expone `GET /:token`. ✅ PASS.
- **III. Central compatible con embebido/acceso directo**: Sin impacto — el cambio es en `AsignacionForm.jsx` (mostrar el enlace completo), no en el modo de acceso de Central. ✅ PASS.
- **IV. Oracle como fuente única de verdad**: El payload embebido es una proyección puntual de Oracle en el momento en que Central pide el enlace (misma función pura/determinística que ya usa `derivarPassword`), no una copia persistente adicional; Central puede recalcular el mismo enlace en cualquier momento sin guardar nada nuevo en Oracle. ✅ PASS.
- **V. Trazabilidad en tiempo (casi) real**: Sin cambios — los eventos siguen llegando al backend por el mismo canal del bróker (`003`). ✅ PASS.
- **VI. Mensajería interna confiable**: Fuera de alcance (igual que en `001`/`003`). N/A.
- **VII. Simplicidad y datos mínimos**: El mecanismo de vínculo a primer dispositivo (FR-005a) agrega una pieza nueva (observador de eventos `$SYS` + estado efímero + kick reactivo por REST). Es la pieza menos compleja que cumple el requisito dentro de las limitaciones confirmadas del plan EMQX Serverless (sin webhook de autenticación preventivo) — ver justificación en **Complexity Tracking**. El resto de la funcionalidad (embeber el payload en el fragmento de URL) es, en cambio, una *reducción* de complejidad respecto al mecanismo actual: elimina un endpoint HTTP (`GET /:token`) y su llamada de red. ⚠️ PASS CON JUSTIFICACIÓN (ver Complexity Tracking).

**Restricciones técnicas**: Backend sigue siendo Express, sin frameworks nuevos (el observador `$SYS` reutiliza el mismo cliente `mqtt` de servicio ya conectado en `backend/src/mqtt/client.js`, no agrega infraestructura). Geolocalización y conectividad intermitente: sin cambios (siguen aplicando a los eventos "arribo"/"descarga", que no cambian de mecanismo en esta funcionalidad).

**Re-chequeo post-diseño (tras Fase 1)**: `data-model.md` y los `contracts/` confirman que no se agregó ninguna tabla/columna Oracle nueva (IV), que el único estado nuevo es efímero en memoria y con limpieza ya definida en los mismos puntos donde hoy se revoca la credencial EMQX (VII), y que el mecanismo de vínculo a dispositivo (única desviación de "la alternativa más simple") queda acotado a `conexionWatcher.js` + `vinculoDispositivo.js`, sin tocar el resto de la arquitectura. Gate: ✅ PASS.

## Project Structure

### Documentation (this feature)

```text
specs/004-chofer-cloud-broker/
├── plan.md              # Este archivo
├── research.md          # Fase 0
├── data-model.md         # Fase 1
├── quickstart.md         # Fase 1
├── contracts/
│   ├── enlace-recorrido.md   # Esquema del payload embebido (reemplaza GET /:token)
│   ├── central-asignacion.md # Extensión de POST /asignar y /reasignar (campo `enlace`)
│   └── vinculo-dispositivo.md # Mecanismo interno de atado a primer dispositivo
└── tasks.md              # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

```text
frontend/                              # SPA del chofer (Cloudflare Pages/Workers)
├── wrangler.jsonc                     # Ya existe — hosting estático, sin cambios
├── src/
│   ├── main.jsx                       # Cambia: lee el payload del fragmento de URL en
│   │                                   # vez de llamar a services/api.js::obtenerRecorrido
│   ├── services/
│   │   ├── enlacePayload.js           # NUEVO — decodifica/valida el payload del fragmento
│   │   ├── deviceId.js                # NUEVO — clientId persistente en localStorage
│   │   ├── api.js                     # Se reduce: ya no hace fetch de recorrido; conserva
│   │   │                               # solo lo necesario para publicar (delegado a mqttClient.js)
│   │   ├── mqttClient.js              # Cambia: pasa clientId (deviceId.js) al conectar
│   │   ├── geolocation.js             # Sin cambios
│   │   ├── offlineQueue.js            # Sin cambios
│   │   └── ubicacionPeriodica.js      # Sin cambios
│   └── components/                    # Sin cambios de contrato (RouteView, ProgressSummary, DeliveryPointCard)
└── tests/                             # Se agregan tests de enlacePayload.js y deviceId.js

backend/
├── src/
│   ├── routes/
│   │   ├── recorrido.js               # GET /:token → RETIRADO (payload ya no se sirve por HTTP)
│   │   └── central.js                 # POST /asignar, /reasignar → devuelven `enlace` completo
│   ├── mqtt/
│   │   ├── client.js                  # Sin cambios (cliente de servicio ya conectado)
│   │   ├── subscriber.js              # Agrega vinculoDispositivo.liberar(token) al completar
│   │   │                               # el recorrido (mismo punto que ya revoca la credencial
│   │   │                               # EMQX) — el resto del archivo no cambia
│   │   ├── emqxProvisioning.js        # provisionarCredencial se invoca ahora al generar el
│   │   │                               # enlace (en central.js), no en GET /:token (retirado)
│   │   └── conexionWatcher.js         # NUEVO — suscribe a $SYS/eventos de conexión, detecta
│   │                                   # clientId del primer dispositivo por token, expulsa
│   │                                   # (kick) intentos desde un clientId distinto
│   ├── state/
│   │   ├── ubicacionEnMemoria.js      # Sin cambios
│   │   └── vinculoDispositivo.js      # NUEVO — estado efímero token→clientId (mismo patrón
│   │                                   # que ubicacionEnMemoria.js)
│   └── services/
│       └── enlaceRecorrido.js         # NUEVO — construye el payload y lo codifica en la URL
│                                       # completa (FRONTEND_BASE_URL + fragmento), reutilizado
│                                       # por central.js en /asignar y /reasignar
└── tests/                             # Se agregan tests de enlaceRecorrido.js, conexionWatcher.js

central/
└── src/components/AsignacionForm.jsx  # Muestra `resultado.enlace` (URL completa, copiable)
                                        # en vez de `resultado.token`
```

**Structure Decision**: Se mantiene la estructura de 3 apps ya existente (`frontend/`,
`backend/`, `central/`, ver `001`/`002`/`003`). No se agrega ningún proyecto ni carpeta nueva
de primer nivel; los cambios son módulos nuevos dentro de `frontend/src/services/`,
`backend/src/mqtt/`, `backend/src/state/` y `backend/src/services/`, más la extensión de dos
routers HTTP ya existentes.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|----------------------------------------|
| Observador de eventos `$SYS` + estado efímero + kick reactivo por REST (`conexionWatcher.js`, `vinculoDispositivo.js`) para atar el token de publicación al primer dispositivo (FR-005a) | El plan EMQX Cloud Serverless usado por el proyecto no soporta autenticación HTTP por webhook (confirmado en research.md §3), que sería el mecanismo preventivo más simple para rechazar el CONNECT de un segundo dispositivo antes de que se complete. Sin este observador, FR-005a (aprobado explícitamente por el usuario en la clarificación de `spec.md`) no se podría cumplir en absoluto sobre la infraestructura ya provisionada del proyecto. | Atar por dirección IP: más simple, pero rota el objetivo ya establecido en `003-mqtt-broker-fletes` de que un flete pueda cambiar de red (datos móviles↔wifi) sin reconfiguración. Migrar a un plan EMQX Cloud superior (Dedicated) que sí soporte webhooks: fuera de alcance de esta especificación (decisión de infraestructura/costo, no de este plan) y contradice la Restricción Técnica de simplicidad (Principio VII) de no introducir infraestructura adicional sin necesidad. |
