# Implementation Plan: Mapa Central Unificado

**Branch**: `010-mapa-central-unificado` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-mapa-central-unificado/spec.md`

## Summary

La vista de Mapa de Central hoy solo muestra la posición de flete de cada
recorrido activo (sin sus puntos de entrega, y solo si hay al menos uno
activo). Esta feature la convierte en una vista consolidada: todos los
puntos de entrega y la posición de flete de **todos** los recorridos
activos al mismo tiempo, cada flete con un color propio de una paleta fija
(asignado automáticamente, sin persistir continuidad entre recorridos
sucesivos del mismo flete, o tomado tal cual si Oracle lo envía
explícitamente); un ícono distinto para la posición de flete/chofer frente
a los puntos de entrega; nombre del cliente al pasar el mouse; y un punto
de salida — uno predeterminado en el backend (coordenadas fijas) que se
muestra siempre, incluso sin recorridos activos, más un marcador propio por
recorrido solo cuando ese recorrido indica un origen distinto al
predeterminado. El enfoque técnico reutiliza el patrón ya existente
(`GET /api/central/recorridos/activos` + polling + `MapaSeguimiento.jsx`
con `react-leaflet`), sumando `puntos` (y opcionalmente `puntoSalida` y
`color`) a esa respuesta — sin pedidos de red adicionales — y extendiendo
el mapa con color por flete, tipos de marcador e ícono, y un marcador de
origen que
no depende de `activos`.

## Technical Context

**Language/Version**: JavaScript ES2022 (Node.js ≥ 18, backend ESM; React 18 en el frontend de Central, empaquetado con Vite)

**Primary Dependencies**: Backend: Express.js (Principio "Framework backend" de la Constitución), store operacional en memoria (`backend/src/state/integracionStore.js`). Frontend (Central): React + Ant Design (`antd`) + `react-leaflet`/Leaflet (ya en uso en `MapaSeguimiento.jsx`) + tiles de OpenStreetMap.

**Storage**: Sin cambios de persistencia — el store operacional cloud (en memoria, `integracionStore.js`) sigue siendo la fuente autoritativa de ejecución en vivo (Principio IV); Oracle local sigue siendo el maestro administrativo/de precarga. El punto de salida predeterminado es una constante de configuración del backend (no un dato de Oracle ni de la base operacional), y el punto de salida propio de un recorrido (cuando exista) viaja como un campo opcional más del mismo contrato de sincronización ya vigente (Endpoint 1 de `integracion-api.md`), consistente con Principio IV (sincronización explícita por el canal ya auditado, no un canal nuevo).

**Testing**: Backend: `node:test` + `node:assert/strict` (`backend/tests/{unit,contract,integration}`). Frontend: Vitest + `@testing-library/react` (`central/tests`), con `react-leaflet` mockeado igual que en `MapaSeguimiento.test.jsx` existente (jsdom no soporta el layout real de Leaflet).

**Target Platform**: Central es una web app de escritorio (Principio III) — accedida directamente o embebida en Oracle APEX; el backend es un servicio HTTP Node/Express ya desplegado (arquitectura cloud, 003-arquitectura-cloud-mqtt).

**Project Type**: Web application (backend + frontend ya existentes; esta feature no agrega proyectos nuevos, solo extiende `backend/` y `central/`).

**Performance Goals**: Sin objetivo nuevo de performance — el volumen esperado (< 10 recorridos activos simultáneos × ≤ 10 puntos cada uno, Principio II) es órdenes de magnitud menor que cualquier límite ya validado del polling/mapa existente.

**Constraints**: Debe seguir funcionando embebido en `<iframe>` de Oracle APEX y en acceso directo (Principio III, NON-NEGOTIABLE); no debe agregar pedidos de red adicionales por recorrido (reutiliza el polling único ya existente de `GET /api/central/recorridos/activos`); no debe degradar ningún comportamiento ya cubierto por tests existentes de `MapaSeguimiento`/`MonitorView`/`RecorridoDetalle` (FR-007).

**Scale/Scope**: Menos de 10 recorridos activos simultáneos, geográficamente cercanos, cada uno con hasta 10 puntos de entrega (límite ya impuesto por Principio II de la Constitución) más, como máximo, un punto de salida propio por recorrido.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principio II (Ruta Acotada, Máx. 10 Puntos)**: PASS. La feature no agrega puntos ni cambia el límite; el "punto de salida" es una ubicación adicional de referencia visual, no un punto de entrega de la ruta, y no cuenta contra el máximo de 10.
- **Principio III (Compatible con APEX embebido y acceso directo)**: PASS. Se extiende un componente visual ya usado en ambos modos (`MapaSeguimiento.jsx`, dentro de `AppShell`); no se introduce ningún mecanismo (popup externo, cookie de terceros, redirect) incompatible con iframe.
- **Principio IV (Fuentes de verdad por dominio, sincronización explícita)**: PASS con nota. El punto de salida propio de un recorrido (cuando exista) se agrega como campo opcional al contrato de sincronización ya existente y auditado (Endpoint 1, Oracle → cloud, `integracion-api.md`), no por un canal nuevo. El punto de salida predeterminado es una constante de configuración del backend cloud (no de Oracle) — coherente con que hoy es un valor fijo operativo, no un dato administrativo por recorrido.
- **Principio V (Trazabilidad de estado/ubicación en tiempo casi real)**: PASS. No se agrega telemetría nueva; se reutiliza `ultimaUbicacion` y el polling ya vigente. La vista consolidada mejora la visibilidad operativa (más recorridos visibles a la vez), sin tocar la cadencia de actualización.
- **Principio VII (Simplicidad y datos mínimos)**: PASS. Se reutiliza el mismo endpoint de listado (agregando un campo, no un endpoint nuevo) y el mismo componente de mapa; no se introduce estado ni almacenamiento adicional del lado del cliente más allá de una función de asignación de color determinística (sin persistir preferencias de color).

No se identifican violaciones que requieran la sección "Complexity Tracking".

**Re-chequeo post-Fase 1 (diseño)**: `research.md`, `data-model.md` y
`contracts/mapa-central-api.md` confirman que el único cambio de
sincronización es un campo opcional (`puntoSalida`) sobre el contrato ya
auditado de Oracle→Cloud, y que el punto de salida por defecto es una
constante de backend cloud, no un dato de Oracle ni un endpoint nuevo — los
cinco gates evaluados arriba siguen en PASS sin cambios.

## Project Structure

### Documentation (this feature)

```text
specs/010-mapa-central-unificado/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── routes/central.js            # GET /api/central/recorridos/activos — agrega `puntos` y `puntoSalida`
│   ├── routes/integracion.js        # Endpoint 1 (upsert) — acepta `puntoSalida` opcional por recorrido
│   └── state/integracionStore.js    # listarActivos() expone puntos + puntoSalida; constante de punto de salida por defecto
└── tests/
    ├── unit/integracion-store-central.test.js
    ├── contract/                    # contrato de /recorridos/activos y del upsert
    └── integration/central-cloud-monitoreo.test.js

central/
├── src/
│   ├── components/MapaSeguimiento.jsx   # tipos de marcador (flete/punto/salida), color por recorrido, hover
│   ├── services/marcadores.js           # asignación de color por recorrido, construcción de marcadores unificados
│   └── main.jsx                         # pasa `activos` completo (con puntos) + punto de salida a la vista Mapa
└── tests/
    ├── components/MapaSeguimiento.test.jsx
    └── components/marcadores.test.js
```

**Structure Decision**: Se mantiene la estructura ya vigente de "web application" con dos raíces (`backend/`, `central/`); esta feature no agrega ningún proyecto ni carpeta de nivel superior, solo extiende archivos ya existentes en ambos.

## Complexity Tracking

*Sin violaciones de la Constitution Check — sección no aplicable.*
