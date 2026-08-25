# Implementation Plan: Registro de inicio y fin de recorrido con regreso a base

**Branch**: `008-registro-inicio-fin-recorrido` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-registro-inicio-fin-recorrido/spec.md`

## Summary

Agrega dos registros de trazabilidad al flujo de estados de viaje ya
existente (005-chofer-estados-viaje): (1) al tocar INICIAR sobre un punto,
se captura fecha/hora + ubicación GPS opcional como evento de inicio de ese
punto (`inicioEn`/`inicioLat`/`inicioLon`); (2) se elimina la derivación
automática de `recorrido.estado = "finalizado"` (hoy disparada apenas el
último punto pasa a `completado`, en `transicionarPunto`) y se reemplaza por
una transición explícita: un nuevo endpoint `POST .../viaje/finalizar` que
el chofer dispara tocando FINALIZAR, capturando fecha/hora + ubicación GPS
opcional como cierre del recorrido (`cierreEn`/`cierreLat`/`cierreLon`).
Esto deja un hueco de tiempo medible entre "descarga completa del último
punto" y "cierre del recorrido" que representa el trayecto de regreso a
base. Enfoque técnico: mismo store en memoria ya usado por 001/005
(`backend/src/state/integracionStore.js`), mismo router de viaje
(`backend/src/routes/viaje.js`), mismo mecanismo de cola offline
(`frontend/src/services/offlineQueue.js`) y de geolocalización best-effort
(`frontend/src/services/geolocation.js`) ya existentes; sin infraestructura
ni dependencias nuevas.

## Technical Context

**Language/Version**: JavaScript ESM (Node.js 20+, React 18) — mismo stack
que `backend/`, `frontend/` (chofer) y `central/` existentes.

**Primary Dependencies**: ninguna dependencia nueva. Reutiliza Express
(`backend/src/routes/viaje.js`, `central.js`), React 18 + Vite
(`frontend/`, `central/`), y los servicios ya presentes:
`frontend/src/services/api.js`, `offlineQueue.js`, `geolocation.js`;
`backend/src/state/integracionStore.js`; `backend/src/util/tiempo.js`
(`ahoraLocalIso`, `parsearClienteEn`).

**Storage**: N/A — no se agrega persistencia. Los campos nuevos
(`inicioEn`/`inicioLat`/`inicioLon` por punto, `cierreEn`/`cierreLat`/
`cierreLon` por recorrido) viven en el mismo `Map` en memoria de
`integracionStore.js` (in-memory, cloud-autoritativo del plano operativo en
vivo — Principio IV).

**Testing**:
- Backend: `node --test` — extiende
  `backend/tests/unit/integracion-store.test.js` (reescribe los 3 tests que
  hoy esperan finalización automática, agrega tests de `iniciarViaje` con
  ubicación y de `finalizarRecorrido`),
  `backend/tests/contract/post-viaje.test.js` (contrato del endpoint nuevo
  `POST .../viaje/finalizar` y del body extendido de `.../viaje/iniciar`),
  y `backend/tests/integration/viaje-estados-guiados.test.js` (flujo
  completo: completar último punto → `estado` sigue `activo` → FINALIZAR →
  `estado === finalizado`).
- Frontend (chofer) y Central: `vitest` + `@testing-library/react` +
  `jsdom`, extendiendo los tests ya existentes de `RouteView`/
  `DeliveryPointCard` y de los componentes de Central que leen
  `historial`/`activos`/`detalle`.

**Target Platform**: Chofer — navegador móvil (Principio I, single-view,
mobile-first), sin pantallas ni botones nuevos (FINALIZAR ya existe; solo
cambia qué dispara y qué registra). Central — navegador de escritorio,
embebido en iframe APEX o acceso directo (Principio III), sin cambios
estructurales, solo campos nuevos en vistas ya existentes
(`RecorridoDetalle.jsx`, `HistorialView.jsx`, `MonitorView.jsx`).

**Project Type**: Web app existente de 3 componentes (`backend/`,
`frontend/` chofer, `central/`) — extensión de los tres, sin nuevos
servicios ni repos.

**Performance Goals**: mismos objetivos ya vigentes de 001/005 — reflejar el
nuevo estado de cierre en Central en <= 10 s (vía el polling de 5 s
existente, sin requisito de latencia nuevo, FR-010).

**Constraints**:
- MUST seguir siendo una única vista sin navegación (Principio I) — el
  registro de inicio es invisible para el chofer (ocurre al tocar INICIAR,
  ya existente); FINALIZAR sigue siendo el mismo botón ya existente en
  `RouteView.jsx`, sin pasos ni pantallas intermedias (SC-004).
- El estado autoritativo de si un recorrido puede finalizarse (todos los
  puntos `completado` y `viajeEstado === "detenido"`) MUST validarse en el
  servidor, no solo ocultarse/mostrarse en el cliente (mismo principio ya
  aplicado a INICIAR/LLEGUE/DESCARGA COMPLETA en 005 — research.md,
  Decisión 1).
- La ausencia de ubicación GPS en INICIAR o FINALIZAR MUST NOT bloquear el
  registro del evento ni el cambio de estado (FR-002, FR-006) — mismo
  criterio best-effort ya usado por `obtenerUbicacionBestEffort()` para
  LLEGUE/DESCARGA COMPLETA.
- INICIAR y FINALIZAR MUST pasar por la misma cola offline
  (`offlineQueue.js`) ya usada por el resto de las acciones de viaje
  (FR-009) — sin mecanismo de reintento nuevo.
- Quitar la derivación automática de `estado = "finalizado"` MUST hacerse
  en el único punto del código donde existe hoy (`transicionarPunto`,
  `integracionStore.js:507-516`), que es compartido por los endpoints
  directos de 001 (`POST /puntos/:id/arribo|descarga`) y los guiados de 005
  (`viaje/llegue`, `viaje/descarga-completa`) — un solo cambio cubre ambos
  caminos (research.md, Decisión 2).

**Scale/Scope**: mismo orden de magnitud que 001-005 — hasta 10 puntos por
recorrido, decenas de fletes activos simultáneos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principio I (Chofer página única móvil-primero)**: PASS — no se agregan
  pantallas ni pasos nuevos; INICIAR y FINALIZAR son los mismos controles
  ya existentes en la única vista (`RouteView`/`DeliveryPointCard`), solo
  registran más datos al tocarlos.
- **Principio II (Ruta acotada a 10 puntos, con reordenamiento limitado)**:
  N/A — esta feature no toca el orden ni el contenido de los puntos.
- **Principio III (Central compatible con embebido APEX y acceso
  directo)**: PASS — los únicos cambios en `central/` son campos nuevos
  (`inicioEn` por punto, `cierreEn`/`esperandoFinalizar` por recorrido) en
  componentes ya existentes, sin popups ni mecanismos incompatibles con
  iframe.
- **Principio IV (Fuentes de verdad por dominio, sincronización
  explícita)**: PASS — el cloud sigue siendo autoritativo para la ejecución
  en vivo; Oracle no necesita conocer `inicioEn`/`cierreEn` para esta
  feature (no hay contrato de sincronización hacia Oracle involucrado, a
  diferencia de IR PRIMERO en 005).
- **Principio V (Trazabilidad de estado y ubicación en tiempo casi real)**:
  PASS — FR-010 refuerza directamente este principio: el cierre real del
  recorrido (y el tiempo de regreso a base) se vuelve visible a Central sin
  recargar manualmente, cerrando un hueco de trazabilidad que hoy no existe
  (el "regreso a base" no se medía).
- **Principio VI (Mensajería interna confiable)**: N/A — sin cambios.
- **Principio VII (Simplicidad y datos mínimos)**: PASS — sin dependencias
  ni infraestructura nueva; los campos agregados son los mínimos necesarios
  (timestamp + lat/lon opcionales, mismo patrón que `arriboEn`/`descargaEn`
  ya existente) y no se modela una entidad "base" nueva (Assumptions de
  spec.md).

**Resultado**: PASS sin excepciones — no aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/008-registro-inicio-fin-recorrido/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/             # Phase 1 output (/speckit-plan command)
│   └── chofer-viaje-cierre.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── state/
│   │   └── integracionStore.js     # mergearPunto (+inicioEn/Lat/Lon),
│   │                                # iniciarViaje (+ubicacion/clienteEn),
│   │                                # transicionarPunto (- derivación auto
│   │                                # de "finalizado"), finalizarRecorrido
│   │                                # (nuevo), listarActivos/listarHistorial/
│   │                                # obtenerDetalle (+cierreEn/esperandoFinalizar)
│   │   └── util/tiempo.js          # sin cambios, reusado
│   └── routes/
│       ├── viaje.js                # POST .../viaje/iniciar (+lat/lon/clienteEn),
│       │                            # POST .../viaje/finalizar (nuevo)
│       └── central.js              # GET .../historial (+cierreEn en el mapeo)
└── tests/
    ├── unit/integracion-store.test.js
    ├── contract/post-viaje.test.js
    └── integration/viaje-estados-guiados.test.js

frontend/
├── src/
│   ├── services/
│   │   └── api.js                  # iniciarViaje(+conUbicacion), finalizarViaje (nuevo),
│   │                                # rutaAccion/bodyPara (+case "viaje-finalizar")
│   ├── components/
│   │   └── RouteView.jsx           # FINALIZAR llama al backend en vez de
│   │                                # ser puramente local; deriva "finalizado"
│   │                                # de recorrido.estado, no de los puntos
│   └── main.jsx                    # handleFinalizar (nuevo)
└── tests/ (vitest)

central/
├── src/
│   ├── components/
│   │   ├── RecorridoDetalle.jsx    # muestra Cierre + tiempo de regreso a base
│   │   ├── HistorialView.jsx       # muestra cierreEn
│   │   └── MonitorView.jsx         # badge "Regresando a base" si esperandoFinalizar
└── tests/ (vitest)
```

**Structure Decision**: Se mantiene la estructura de 3 proyectos existente
(`backend/`, `frontend/`, `central/`); esta feature no agrega directorios
nuevos, solo extiende archivos ya existentes de las tres apps.

## Complexity Tracking

*Sin violaciones a justificar — Constitution Check pasa sin excepciones.*

## Extensión (User Story 3, 2026-08-25)

Agrega exposición hacia Central de `inicioLat`/`inicioLon` (por punto) y
`cierreLat`/`cierreLon` (por recorrido), ya capturados y guardados desde la
versión original de esta feature pero excluidos de los serializadores de
Central por research.md Decisión 4. Revierte esa decisión a la luz del
precedente sentado después por 009-central-mejora-visual, que sí expone
`arriboLat`/`arriboLon`/`descargaLat`/`descargaLon` con el mismo patrón.
Sin cambios de captura (frontend chofer), sin endpoints nuevos, sin cambios
de esquema — solo agregar 4 campos a serializadores ya existentes y su
consumo en la UI de Central.

**Alcance de archivos a tocar**:

- `backend/src/state/integracionStore.js`:
  - `serializarPuntosCentral` (línea ~607): agregar `inicioLat: p.inicioLat ?? null`, `inicioLon: p.inicioLon ?? null`, mismo patrón que `arriboLat`/`arriboLon`.
  - `listarHistorial` y `obtenerDetalle`: agregar `cierreLat: r.cierreLat ?? null`, `cierreLon: r.cierreLon ?? null` al objeto `recorrido`.
  - `GET /api/recorridos/:token` (chofer, `obtenerPorToken`) y `listarActivos` **no** cambian — fuera de alcance (FR-011/FR-012 piden exponer a Central específicamente, no al chofer; `listarActivos` no expone puntos individuales ni `cierreEn`, ver data-model.md § Serialización).
- `backend/src/routes/central.js`: `GET /recorridos/historial` (línea ~43) hace un mapeo explícito de campos del `recorrido` — agregar `cierreLat`/`cierreLon` al objeto mapeado (si no, quedarían presentes en el store pero cortados acá).
- `central/src/components/RecorridoDetalle.jsx`: mostrar las coordenadas nuevas sin romper el patrón visual existente:
  - "Final" (`Descriptions.Item`, cierre del recorrido): agregar un ícono/tooltip con las coordenadas crudas (`cierreLat`/`cierreLon`) cuando existan — **no** reutilizar `HoraConProximidad` (que colorea según distancia a un punto de referencia): no hay un "punto de regreso a base" modelado como entidad (Assumptions de spec.md), así que no hay contra qué medir proximidad de forma no ambigua.
  - Columna "Hora de llegada"/"Hora de descarga" no cambian. `inicioEn` por punto sigue sin columna dedicada en la tabla (decisión ya tomada y validada en la versión original: se usa agregado en el encabezado "Hora inicio" vía `primerEventoIso`) — agregar el mismo tratamiento de tooltip con coordenadas crudas al campo "Hora inicio" del encabezado, usando las coordenadas del punto cuyo `inicioEn` resultó el más temprano.
  - `central/src/services/tiempo.js`: `primerEventoIso` hoy solo devuelve el ISO más temprano; agregar una función hermana (o extender el retorno) que además devuelva `inicioLat`/`inicioLon` del punto correspondiente, para alimentar el tooltip del encabezado.
- Tests: extender `backend/tests/unit/integracion-store-central.test.js`, `backend/tests/contract/get-historial.test.js`, `backend/tests/contract/get-recorrido-detalle.test.js`, `backend/tests/contract/get-recorridos-activos.test.js` (verificar que activos **no** gana estos campos), y `central/` tests de `RecorridoDetalle`/`tiempo.js`.

**Constitution Check (re-evaluado)**: PASS sin excepciones — mismos
principios que la versión original; Principio VII sigue cumplido (4 campos
opcionales reexpuestos, sin entidades ni infraestructura nueva); Principio
III sigue cumplido (solo agrega un tooltip informativo en componentes ya
existentes, sin popups ni mecanismos incompatibles con iframe).

## Extensión (User Story 4, 2026-08-25)

Pone a disposición de Oracle/APEX, a través del mismo mecanismo ya existente
de lectura de estado (`GET /api/integracion/estado` +
`INTEGRACION_CLOUD_API.leer_estado_puntos`, spec 003), los eventos de
inicio-por-punto y cierre-de-recorrido (ya capturados desde la versión
original de esta feature, nunca antes expuestos a Oracle — ver research.md
Decisión 8), más un nuevo dato derivado: el momento de inicio del recorrido
completo (el `inicioEn` más temprano entre los puntos). Sin cambios de
captura, sin endpoints nuevos, sin cambios en lo que ve el chofer o Central
— solo un nuevo consumidor (Oracle) para datos que el cloud ya tenía, más
un campo derivado nuevo.

**Alcance de archivos a tocar**:

- `backend/src/routes/integracion.js`: `serializarEstado()` — agregar
  `inicioEn`/`inicioLat`/`inicioLon` por punto (mismo patrón que
  `arriboEn`/`arriboLat`); agregar a nivel `recorrido`:
  `cierreEn`/`cierreLat`/`cierreLon` (ya existían en el store, nunca
  expuestos acá) e `inicioEn`/`inicioLat`/`inicioLon` (nuevo campo
  derivado — función `primerInicio(puntos)`, el `inicioEn` más temprano
  entre los puntos, mismo criterio que `primerEventoConUbicacion` de
  Central pero sin el fallback a `arriboEn` — ver research.md Decisión 9).
- `backend/sql/integracion-cloud/integracion_cloud_api.pkb.sql`:
  `leer_estado_puntos` — agregar `inicio_en`/`inicio_lat`/`inicio_lon` a
  las columnas de `JSON_TABLE` (por punto) y al `UPDATE T_PUNTOS_ENTREGA`;
  agregar extracción vía `JSON_VALUE` de `cierreEn`/`cierreLat`/`cierreLon`
  e `inicioEn`/`inicioLat`/`inicioLon` a nivel `$.recorridos[0]` (no del
  array de puntos) y agregarlos al `UPDATE T_RECORRIDOS` (nombres de
  columna: `CIERRE_EN`/`CIERRE_LAT`/`CIERRE_LON` e
  `INICIO_EN`/`INICIO_LAT`/`INICIO_LON` — mismo nombre que en
  `T_PUNTOS_ENTREGA`, tabla distinta, sin colisión — ver Clarifications de
  spec.md).
- Tests: extender `backend/tests/contract/integracion-endpoints.test.js`
  (nuevo — antes este endpoint no tenía cobertura de `inicioEn`/`cierreEn`
  en absoluto).
- **Fuera de alcance**: sin cambios en `frontend/` (chofer) ni en
  `central/` — Central ya deriva su propio "Hora inicio" del lado cliente
  (`primerEventoConUbicacion`, User Story 3); el campo derivado nuevo es
  solo para el consumo de Oracle/APEX.

**Constitution Check (re-evaluado)**: PASS sin excepciones — Principio IV
(fuentes de verdad por dominio, sincronización explícita) es el más
directamente reforzado: el cloud sigue siendo autoritativo, y esto es
exactamente "sincronización explícita" hacia Oracle a través del mecanismo
ya existente, no uno nuevo. Principio VII sigue cumplido (reexpone datos ya
capturados + un campo derivado simple, sin infraestructura ni entidades
nuevas).
