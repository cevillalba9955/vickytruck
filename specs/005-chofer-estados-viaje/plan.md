# Implementation Plan: App Chofer — Información de Recorrido y Estados de Viaje Guiados

**Branch**: `005-chofer-estados-viaje` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-chofer-estados-viaje/spec.md`

## Summary

Agrega al recorrido del chofer cinco campos informativos por punto (cliente,
dirección, rango horario, notas de entrega, y una lista interna de
remito_id nunca visible al chofer), provistos por Oracle en el mismo payload
de `sincronizar_recorrido`. Reemplaza el modelo actual de "marcado libre"
(cualquier punto, cualquier orden) por un flujo guiado de estado de viaje
por recorrido — Detenido/Manejando/Descargando — con un único punto activo
por vez, reordenamiento acotado del chofer (IR PRIMERO, que persiste como
orden autoritativo hacia Oracle) y una operación de deshacer (CANCELAR)
acotada a la última acción mientras Oracle todavía no la haya leído.
Enfoque técnico: todo el estado nuevo (`viajeEstado`, `puntoActivoId`,
`ultimaOperacion`) vive en el mismo store en memoria ya usado por
001/002/003/004 (`backend/src/state/integracionStore.js`), expuesto por
endpoints REST nuevos bajo `/api/recorridos/:token/viaje/*` que reusan la
lógica de transición ya existente; sin base de datos ni infraestructura
nueva.

## Technical Context

**Language/Version**: JavaScript ESM (Node.js 20+, React 18) — mismo stack
que `backend/`, `frontend/` (chofer) y `central/` existentes.

**Primary Dependencies**: ninguna dependencia nueva. Reutiliza React 18 +
Vite (frontend/central), Express (backend, Principio "Framework backend"),
y los mismos servicios ya presentes: `frontend/src/services/api.js`,
`offlineQueue.js`, `ubicacionPeriodica.js`/`ubicacionMqtt.js`;
`backend/src/state/integracionStore.js`; `central/src/services/polling.js`.

**Storage**: N/A — no se agrega persistencia. Todo el estado nuevo
(`viajeEstado`, `puntoActivoId`, `ultimaOperacion`, `remitoIds`, y los 4
campos informativos por punto) vive en el mismo `Map` en memoria de
`integracionStore.js` (in-memory, cloud-autoritativo del plano operativo en
vivo — Principio IV, ver 003-arquitectura-cloud-mqtt).

**Testing**:
- Backend: `node --test` (unit/contract/integration, con repositorios en
  memoria — `backend/tests/helpers/inMemoryRecorridoRepository.js`,
  `inMemoryCentralRepository.js`, mismo patrón ya usado por 001/002/003/004).
- Frontend (chofer) y Central: `vitest` + `@testing-library/react` + `jsdom`.

**Target Platform**: Chofer — navegador móvil (Principio I, single-view,
mobile-first). Central — navegador de escritorio, embebido en iframe APEX o
acceso directo (Principio III), sin cambios estructurales para esta
feature (solo un campo/badge nuevo en una vista ya existente).

**Project Type**: Web app existente de 3 componentes (`backend/`,
`frontend/` chofer, `central/`) — extensión de los tres, sin nuevos
servicios ni repos.

**Performance Goals**: mismos objetivos ya vigentes de 001/004 — reflejar
cambios de estado en Central en <= 10 s (vía el polling de 5 s existente,
sin requisito de latencia nuevo); SC-002/SC-004 de esta spec exigen que las
transiciones de viaje y el reordenamiento se vean en la UI del chofer sin
recargar la página (ya cubierto por el patrón de actualización optimista
existente en `main.jsx`).

**Constraints**:
- MUST seguir siendo una única vista sin navegación (Principio I) — todo el
  estado de viaje se renderiza dentro del mismo `App` de `frontend/src/main.jsx`.
- El estado autoritativo de qué acción es válida en cada momento MUST vivir
  en el servidor, no solo en el cliente (mismo principio ya aplicado a
  arribo/descarga en 001) — ver research.md, Decisión 7.
- `remitoIds` MUST NOT viajar en ningún payload que consuma el frontend del
  chofer (FR-003) — se omite en el serializador, no se oculta solo en la UI.
- El reordenamiento de IR PRIMERO MUST sobrevivir un push de Oracle que
  todavía no conoce el nuevo orden (research.md, Decisión 4) — requiere
  extender `GET /api/integracion/estado` con `orden` (contrato nuevo) y una
  dependencia externa (fuera de este repo) en el lado Oracle/APEX para que
  ese `orden` se persista de vuelta en `V_PUNTOS_ENTREGA`.
- Sin nueva infraestructura de tiempo real: `viajeEstado`/`puntoActivoId`
  viajan a Central por el mismo polling de 5 s ya establecido, no por un
  tópico MQTT nuevo (research.md, Decisión 6 — Principio VII).

**Scale/Scope**: mismo orden de magnitud que 001-004 — hasta 10 puntos por
recorrido, decenas de fletes activos simultáneos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principio I (Chofer página única móvil-primero)**: PASS — todos los
  estados de viaje (Detenido/Manejando/Descargando) y el FINALIZAR se
  renderizan dentro de la única vista existente (`RouteView`/
  `DeliveryPointCard`), sin navegación nueva ni pantallas secundarias.
- **Principio II (Ruta acotada a 10 puntos, con reordenamiento limitado por
  el chofer)**: PASS — el límite de 10 puntos no cambia; IR PRIMERO
  implementa exactamente la excepción recién enmendada (mover un punto
  pendiente al frente, sin edición de contenido ni reordenamiento
  arbitrario del resto), y persiste como orden autoritativo hacia
  Oracle/Central (FR-016, research.md Decisión 4-5), consistente con la
  enmienda del 2026-08-07 (v3.0.0 → v4.0.0).
- **Principio III (Central compatible con embebido APEX y acceso
  directo)**: PASS — el único cambio en `central/` es exponer
  `viajeEstado`/`puntoActivoId` en un componente ya existente (tabla/badge),
  sin popups ni mecanismos incompatibles con iframe.
- **Principio IV (Fuentes de verdad por dominio, sincronización
  explícita)**: PASS — el cloud sigue siendo autoritativo para la ejecución
  en vivo; el reordenamiento del chofer se refleja hacia Oracle por el
  contrato ya explícito y auditable de `GET /api/integracion/estado`
  extendido (contracts/sincronizacion-oracle-central.md), no por acceso
  directo ni sincronización implícita.
- **Principio V (Trazabilidad de estado y ubicación en tiempo casi real)**:
  PASS — FR-021 refuerza directamente este principio; el estado de viaje se
  vuelve visible a Central sin recargar manualmente.
- **Principio VI (Mensajería interna confiable)**: N/A — esta feature no
  toca mensajería.
- **Principio VII (Simplicidad y datos mínimos)**: PASS — sin dependencias
  nuevas, sin infraestructura nueva (se decidió explícitamente NO agregar
  un tópico MQTT nuevo, research.md Decisión 6); el único mecanismo nuevo
  de cierta complejidad (`ultimaOperacion.sincronizada`, research.md
  Decisión 3) es el mínimo necesario para que CANCELAR cumpla FR-020 sin
  reinventar transiciones inversas en el state-machine de puntos.

Sin violaciones que requieran registro en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-chofer-estados-viaje/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── chofer-viaje-api.md              # Endpoints nuevos /viaje/*
│   └── sincronizacion-oracle-central.md # Deltas a integracion-api.md y a los endpoints de Central
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/src/
├── state/
│   └── integracionStore.js       # MODIFICADO: + viajeEstado, puntoActivoId, ultimaOperacion en Recorrido;
│                                  #             + cliente/direccion/rangoHorario/notasEntrega/remitoIds en PuntoEntrega;
│                                  #             + mutadores iniciarViaje/registrarLlegue/registrarDescargaCompleta/
│                                  #               moverPrimero/cancelarUltimaOperacion; mergearPunto respeta
│                                  #               reorden no sincronizado (research.md Decisión 4)
├── routes/
│   ├── recorrido.js              # MODIFICADO: serializePunto expone los 4 campos visibles (NO remitoIds);
│                                  #             + router de /viaje/* (nuevo archivo o sub-router, ver abajo)
│   ├── integracion.js            # MODIFICADO: serializarEstado agrega orden; GET /estado marca
│                                  #             ultimaOperacion.sincronizada = true (research.md Decisión 3)
│   └── central.js                # sin cambios de rutas (el cambio está en integracionStore, ya consumido)
└── routes/viaje.js               # NUEVO: sub-router montado en /api/recorridos/:token/viaje,
                                   #        implementa iniciar/llegue/descarga-completa/ir-primero/cancelar

backend/tests/
├── unit/
│   └── integracion-store.test.js         # MODIFICADO: casos de viajeEstado, ultimaOperacion, moverPrimero
├── contract/
│   └── post-viaje.test.js                # NUEVO: contrato HTTP de los 5 endpoints /viaje/*
└── integration/
    └── viaje-estados-guiados.test.js     # NUEVO: ciclo completo Detenido→Manejando→Descargando→Detenido,
                                           #        IR PRIMERO sobreviviendo un re-push, CANCELAR antes/después
                                           #        de GET /estado

frontend/src/
├── main.jsx                      # MODIFICADO: estado viajeEstado/puntoActivoId/ultimaOperacion local,
│                                  #             handlers iniciar/llegue/descargaCompleta/irPrimero/cancelar
├── components/
│   ├── RouteView.jsx              # MODIFICADO: renderiza según viajeEstado (lista completa en Detenido,
│                                  #              solo punto activo destacado en Manejando/Descargando, FINALIZAR)
│   └── DeliveryPointCard.jsx      # MODIFICADO: botones INICIAR/IR PRIMERO/LLEGUE/DESCARGA COMPLETA según
│                                  #              estado + tamaño reducido para puntos no activos; muestra
│                                  #              cliente/dirección/rango horario/notas (nunca remito)
└── services/
    └── api.js                     # MODIFICADO: + iniciarViaje/marcarLlegue/marcarDescargaCompleta/
                                    #               irPrimero/cancelarUltimaOperacion

frontend/tests/components/
├── RouteView.test.jsx             # MODIFICADO: casos por viajeEstado
└── DeliveryPointCard.test.jsx     # MODIFICADO: botones condicionales + no-renderizado de remito

central/src/components/
└── MonitorView.jsx                # MODIFICADO: columna/badge de viajeEstado + punto activo

central/tests/components/
└── MonitorView.test.jsx           # MODIFICADO: cubre la columna nueva
```

**Structure Decision**: extensión de los tres componentes ya existentes
(`backend/`, `frontend/` chofer, `central/`), sin proyectos nuevos. El único
archivo nuevo de peso es `backend/src/routes/viaje.js` (sub-router de
`/api/recorridos/:token/viaje/*`, research.md Decisión 2); el resto son
modificaciones a archivos que ya existen, siguiendo el mismo patrón de capas
(routes → state store; components → services) que ya usan 001-004.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

Sin violaciones — tabla vacía. El único mecanismo nuevo de cierta
complejidad (`ultimaOperacion.sincronizada`, research.md Decisión 3) no es
una violación de un principio: es la implementación mínima necesaria para
que CANCELAR (FR-020) funcione como la spec lo define, sin inventar
transiciones inversas genéricas en el state-machine de puntos.

## Constitution Check — re-chequeo post Fase 1

Tras `data-model.md` y `contracts/`: sin cambios respecto al chequeo inicial.
El único punto que ameritaba atención (Principio IV, sincronización
explícita hacia Oracle) quedó resuelto con un contrato documentado
(`contracts/sincronizacion-oracle-central.md`), no con acceso directo ni
suposiciones implícitas. PASS en las 6 dimensiones aplicables, 2 N/A
(Principios III, VI sin impacto estructural más allá de lo ya señalado).
