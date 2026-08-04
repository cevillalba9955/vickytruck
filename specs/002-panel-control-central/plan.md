# Implementation Plan: Central — Panel de Control de Recorridos y Fletes

**Branch**: `002-panel-control-central` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-panel-control-central/spec.md`

## Summary

Una web app de escritorio (Central), embebible como iframe en una página Oracle APEX
existente o accedida directamente por su propia URL (ambos modos igualmente soportados,
Principio III v2.0.0): un operador monitorea en vivo el estado y última ubicación de los
recorridos activos, asigna recorridos precargados (ya existentes en Oracle) a fletes
disponibles, puede reasignar un recorrido activo a otro flete, ver el detalle de
cualquier recorrido y consultar el historial de recorridos finalizados. Central no
crea/edita puntos de entrega, no gestiona el alta de fletes ni incluye mensajería (fuera
de alcance, ver Assumptions de spec.md). Enfoque técnico: se extiende el backend Express
ya existente de `001-chofer-recorrido` (mismo pool `oracledb`, mismo Principio IV de
fuente única de verdad) con un nuevo conjunto de rutas de solo-lectura + un package
PL/SQL de asignación, y se agrega un nuevo frontend React de escritorio (`central/`) que
refresca su vista por polling corto (no requiere WebSockets/SSE) y funciona igual esté o
no embebido en un iframe.

## Technical Context

**Language/Version**: JavaScript ESM. Backend: Node.js ≥ 20.12 (mismo runtime que
`backend/` de 001-chofer-recorrido). Frontend: React 18 (componentes funcionales con
hooks), igual convención que `frontend/`.

**Primary Dependencies**:
- Backend: se reutiliza `backend/` (Express + `oracledb`, ya presentes); no se agregan
  dependencias nuevas, solo nuevos módulos de rutas/repositorio dentro del mismo paquete.
- Frontend nuevo (`central/`): `react`, `react-dom`, `vite` (dev/build), `vitest` +
  `@testing-library/react` + `@testing-library/jest-dom` (devDependencies) — mismo
  patrón que `frontend/`, sin librería de mapas/UI adicional (Principio VII).

**Storage**: Oracle, vía el mismo pool `oracledb` de `backend/` (Principio IV, fuente
única de verdad; ninguna copia local persistente). Lecturas por vistas de solo lectura
(extendiendo el patrón ya validado de `V_RECORRIDOS`/`V_PUNTOS_ENTREGA`); escrituras de
asignación/reasignación por un nuevo package PL/SQL, análogo a `RECORRIDO_API` (ver
research.md). Los nombres exactos de vista/tabla para "flete" y "asignación" son un
supuesto razonable a confirmar contra la instancia real durante la implementación (mismo
proceso que documentó research.md §7 de 001-chofer-recorrido).

**Testing**: `node --test` para contratos/integración del backend (listar disponibles,
asignar, reasignar, condición de carrera de asignación simultánea). `vitest` + Testing
Library para el frontend de Central (vista de monitoreo, flujo de asignación).

**Target Platform**: navegador de escritorio moderno, ya sea embebido dentro de un
`<iframe>` en una página Oracle APEX existente o accedido directamente por su propia URL
(Principio III v2.0.0); backend accesible por HTTPS desde donde corra cada modo de
acceso.

**Project Type**: web (dos frontends + un backend compartido: `frontend/` de
001-chofer-recorrido ya existente, `central/` nuevo, `backend/` extendido).

**Performance Goals**: estado y última ubicación de recorridos activos visibles en <5 s
al abrir el panel (SC-001); cambios de estado del chofer reflejados en el panel en <10 s
sin recarga manual (SC-002); asignación completable en 3 pasos o menos (SC-003).

**Constraints**:
- El panel MUST funcionar tanto embebido en iframe dentro de APEX como accedido
  directamente por su propia URL, sin bloquear ni degradar funcionalidad en ninguno de
  los dos modos (Principio III v2.0.0, FR-011, FR-012).
- Sin login propio: la identidad del operador se resuelve por el contexto de la página
  APEX contenedora cuando está embebido; sin ese contexto en acceso directo, sin que eso
  bloquee la operación (FR-013).
- Ninguna asignación concurrente sobre el mismo recorrido MUST producir estado ambiguo
  (FR-015) — se resuelve de forma atómica en Oracle, no solo en el cliente.
- Central no crea/edita puntos de entrega ni el directorio de fletes (fuera de alcance,
  confirmado en Clarifications de spec.md).

**Scale/Scope**: decenas de recorridos activos simultáneos y su correspondiente historial
acumulado; mismo orden de magnitud bajo-moderado que 001-chofer-recorrido, sin requisitos
de alta escala.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Chofer: página única, móvil-primero | N/A en esta feature — corresponde a `frontend/` (001-chofer-recorrido), no se modifica. |
| II. Ruta acotada y ordenada (máx. 10 puntos) | PASS — Central solo consulta recorridos ya validados con ≤10 puntos; no crea ni reordena puntos (fuera de alcance por decisión confirmada). |
| III. Central compatible con embebido en Oracle APEX y con acceso directo (NON-NEGOTIABLE) | PASS por diseño — `central/` funciona igual embebida en `<iframe>` o accedida directamente (FR-011, FR-012); no bloquea ni degrada funcionalidad al detectar que no está embebida, sin cookies de terceros ni popups. |
| IV. Oracle como fuente única de verdad | PASS — toda asignación/reasignación se persiste de inmediato en Oracle vía el nuevo package PL/SQL antes de considerarse efectiva (FR-005, FR-009); sin base de datos ni caché propia persistente. |
| V. Trazabilidad de estado y ubicación en tiempo (casi) real | PASS — el panel muestra estado y última ubicación de cada flete y se refresca automáticamente (FR-001, FR-002) vía polling corto, sin recarga manual. |
| VI. Mensajería interna | N/A en esta feature — explícitamente fuera de alcance (Clarifications de spec.md). |
| VII. Simplicidad y datos mínimos necesarios | PASS — se reutiliza el mismo backend Express y el mismo pool Oracle en vez de levantar un segundo servicio; se elige polling corto en vez de WebSockets/SSE para no sumar infraestructura ni riesgo de compatibilidad con el embebido en APEX; sin login propio adicional. |
| Restricción: Framework backend (Express obligatorio) | PASS — las nuevas rutas se agregan como otro router Express dentro de `backend/`, sin introducir un framework distinto. |

No hay violaciones que requieran justificación en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-panel-control-central/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/                          # YA EXISTE (001-chofer-recorrido) — se EXTIENDE, no se reemplaza
├── src/
│   ├── db/
│   │   ├── pool.js                 # ya existe, se reutiliza tal cual
│   │   ├── recorridoRepository.js  # ya existe (API del chofer), sin cambios
│   │   └── centralRepository.js    # NUEVO — lecturas de monitoreo/disponibles y
│   │                                # escritura de asignación/reasignación vía package
│   ├── routes/
│   │   ├── recorrido.js            # ya existe, sin cambios
│   │   └── central.js              # NUEVO — endpoints montados en /api/central
│   └── server.js                   # se modifica: monta también createCentralRouter(...)
├── sql/
│   ├── recorrido_api.pks.sql       # ya existe, sin cambios
│   ├── recorrido_api.pkb.sql       # ya existe, sin cambios
│   └── central_api.pks.sql         # NUEVO — package con asignar_recorrido/reasignar_recorrido
└── tests/
    ├── contract/                   # + tests nuevos para /api/central/*
    └── integration/                # + flujo asignar -> monitorear -> reasignar

frontend/                          # YA EXISTE (001-chofer-recorrido) — sin cambios

central/                           # NUEVO — SPA de escritorio, embebible en APEX o de
│                                    # acceso directo (Principio III v2.0.0)
├── src/
│   ├── components/                 # MonitorView, AsignacionForm, RecorridoDetalle,
│   │                                # HistorialView
│   ├── services/                   # api.js, polling.js
│   └── main.jsx
└── tests/
    └── components/
```

**Structure Decision**: Web application con dos frontends y un backend compartido. Se
reutiliza `backend/` (Express + `oracledb` ya existente) agregando un router y un
repositorio nuevos, en vez de levantar un segundo servicio — decisión de Principio VII
(simplicidad) ahora que esta feature (Central) puede resolver la pregunta que
001-chofer-recorrido había dejado abierta ("si en el futuro Central reutiliza este mismo
backend, se evaluará en esa feature"). Se agrega un frontend nuevo (`central/`) en vez de
extender `frontend/`, porque los requisitos de UI son opuestos (escritorio embebido en
iframe vs. móvil página única) y no comparten componentes.

## Complexity Tracking

*Sin violaciones de la Constitution Check; tabla no aplica.*
