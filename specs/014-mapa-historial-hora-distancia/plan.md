# Implementation Plan: Hora y alerta de distancia mínima en el mapa de Detalle

**Branch**: `014-mapa-historial-hora-distancia` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-mapa-historial-hora-distancia/spec.md`

## Summary

El mapa de Detalle de un recorrido (compartido por Monitoreo e Historial)
hoy dibuja los puntos de entrega sin hora ni indicación de distancia, y no
dibuja las ubicaciones de inicio/cierre del recorrido — toda esa
información ya existe (la tabla del Detalle la muestra) pero no está en el
mapa. La solución es puramente de frontend: enriquecer las funciones puras
de `services/marcadores.js` que ya transforman los datos del detalle en
marcadores de mapa (agregar hora + señal de distancia a cada punto, y dos
funciones nuevas y chicas para los marcadores de inicio/cierre), y extender
`MapaSeguimiento.jsx` para mostrar esa información al inspeccionar cada
marcador. No hay cambios de backend ni de contrato de API — todos los datos
necesarios ya llegan en las respuestas existentes.

## Technical Context

**Language/Version**: JavaScript (ES2020+), React 18, sin TypeScript (igual que el resto de `central/`)

**Primary Dependencies**: React, react-leaflet + Leaflet (mapa), Ant Design (tabla/UI), Vite (build/dev server)

**Storage**: N/A — no hay cambios de persistencia; se consumen datos ya expuestos por el backend existente

**Testing**: Vitest + @testing-library/react (mismo stack que el resto de `central/tests`)

**Target Platform**: Navegador de escritorio (Central no es mobile-first — Principio "Responsive por rol" de la constitución)

**Project Type**: Web application (monorepo con `backend/`, `central/`, `frontend/` independientes) — esta feature toca únicamente `central/`

**Performance Goals**: N/A explícito — cálculo de distancia (Haversine) ya usado hoy en la tabla para hasta 10 puntos por recorrido (límite constitucional), sin impacto perceptible

**Constraints**: Debe seguir funcionando embebido en iframe de Oracle APEX y en acceso directo (Principio III) — esta feature no toca routing/embedding, solo contenido del mapa ya existente

**Scale/Scope**: Hasta 10 puntos de entrega por recorrido (Principio II) + 2 marcadores nuevos (inicio/cierre) por vista de Detalle — sin cambio de escala

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principio II (máx. 10 puntos)**: sin impacto — no se agregan puntos, solo se enriquece cómo se muestran los que ya existen. ✅
- **Principio III (embebido APEX + acceso directo)**: sin impacto — no se toca routing, iframes, ni mecanismos de autenticación/embebido; es contenido dentro del mismo mapa ya embebible. ✅
- **Principio IV (fuentes de verdad por dominio)**: sin impacto — no se agregan sincronizaciones nuevas; se leen campos que el store operacional cloud ya expone. ✅
- **Principio V (trazabilidad de estado/ubicación en tiempo real)**: reforzado — hace más visible información de trazabilidad que ya se capturaba pero no se mostraba en el mapa. ✅
- **Principio VII (simplicidad y datos mínimos)**: cumple — no se agrega infraestructura, endpoints, ni estado persistido nuevo; se reutiliza el mismo umbral de distancia ya vigente (movido a un único lugar, no duplicado — ver research.md Decisión 2) y las mismas funciones puras testeables que ya sigue `services/marcadores.js`. ✅
- **Responsive por rol (Central = desktop)**: sin impacto — no se agrega ningún flujo mobile-first. ✅

Sin violaciones. No aplica la sección "Complexity Tracking".

*Re-chequeo post-diseño (Fase 1)*: el diseño en `research.md`/`data-model.md` no introdujo entidades, endpoints ni estado nuevo más allá de lo previsto — el gate se mantiene en verde sin cambios.

## Project Structure

### Documentation (this feature)

```text
specs/014-mapa-historial-hora-distancia/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No se genera `contracts/`: no hay cambios de API/contrato — ver
research.md, Decisión 1 (todos los campos necesarios ya los expone `GET
/api/central/recorridos/:id` y `GET /api/central/recorridos/historial`).

### Source Code (repository root)

Proyecto tipo monorepo con apps independientes (`backend/`, `central/`,
`frontend/`); esta feature es exclusivamente frontend, dentro de `central/`:

```text
central/
├── src/
│   ├── services/
│   │   ├── marcadores.js        # MODIFICAR: extender construirPuntosEnMapa,
│   │   │                        #   agregar construirMarcadorExtremo(),
│   │   │                        #   mover RADIO_PROXIMIDAD_M acá (research.md Decisión 2/3/4/5)
│   │   └── tiempo.js            # MODIFICAR: agregar formatearHoraCorta() (hh:mm)
│   └── components/
│       ├── MapaSeguimiento.jsx  # MODIFICAR: modo "puntos" — hora + alerta por
│       │                        #   Tooltip (research.md Decisión 6/7), nuevos
│       │                        #   marcadores de inicio/cierre
│       └── RecorridoDetalle.jsx # MODIFICAR: pasar inicio/cierre al mapa,
│                                 #   importar RADIO_PROXIMIDAD_M desde marcadores.js
│                                 #   en vez de definirlo localmente
└── tests/
    └── components/
        ├── marcadores.test.js       # MODIFICAR: casos nuevos (hora, alerta, extremos)
        ├── tiempo.test.js           # MODIFICAR: caso nuevo (formatearHoraCorta) — ver tests/services si aplica
        ├── MapaSeguimiento.test.jsx # MODIFICAR: casos nuevos (Tooltip con hora/alerta, marcadores de extremo)
        └── RecorridoDetalle.test.jsx # MODIFICAR: verificar que el mapa recibe los datos enriquecidos
```

**Structure Decision**: se reutiliza la estructura existente de `central/`
(`src/services` para lógica pura testeable sin Leaflet, `src/components`
para la presentación) sin crear carpetas nuevas — coherente con cómo ya
está organizada esta misma clase de lógica (`marcadores.js` +
`MapaSeguimiento.jsx`) desde 004-mapa-seguimiento-central. No se toca
`backend/` ni `frontend/` (la app del chofer).

## Complexity Tracking

*Sin violaciones del Constitution Check — sección no aplica.*
