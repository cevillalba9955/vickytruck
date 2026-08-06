# Implementation Plan: Central — Mapa de Seguimiento de Fletes

**Branch**: `005-mapa-seguimiento-central` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-mapa-seguimiento-central/spec.md`

## Summary

Agregar una vista de mapa a Central que muestre, para cada recorrido activo, un
marcador en la última ubicación conocida del flete (Historia 1), y que en el
detalle de un recorrido muestre además sus puntos de entrega ordenados con su
estado (Historia 2). El mapa reutiliza los datos ya disponibles en
`GET /api/central/recorridos/activos` (que ya trae `ultimaUbicacion` con
lat/lon) y agrega lat/lon de los puntos al endpoint de detalle
(`GET /api/central/recorridos/:id`), que hoy los omite. Enfoque técnico:
`react-leaflet` sobre tiles públicos (sin API key), con actualización
automática reutilizando el mismo polling/MQTT ya implementado en
002-panel-control-central — sin nuevo mecanismo de tiempo real.

## Technical Context

**Language/Version**: JavaScript ESM (Node.js 20+, React 18) — mismo stack que `central/` existente.

**Primary Dependencies**:
- Frontend Central: `react-leaflet` + `leaflet` (nuevas) para el renderizado
  del mapa y los marcadores, sobre tiles públicos de OpenStreetMap (sin API
  key ni proveedor de pago para este alcance inicial). Reutiliza
  `central/src/services/polling.js` y `central/src/services/mqttClient.js`
  ya existentes para la actualización en vivo — no se agrega ningún mecanismo
  de tiempo real nuevo.
- Backend: sin dependencias nuevas — se extiende la serialización ya
  existente en `backend/src/state/integracionStore.js`
  (`serializarPuntosCentral`) para incluir `lat`/`lon` de cada punto, campo
  que ya existe en el modelo interno (`punto.lat`/`punto.lon`) pero que hoy
  no se expone en las respuestas que consume Central.

**Storage**: N/A — no se agrega persistencia; el mapa deriva enteramente de datos ya almacenados en `integracionStore.js` (in-memory, ver 003-arquitectura-cloud-mqtt).

**Testing**:
- Backend: `node --test` — extender `backend/tests/integration/central-cloud-monitoreo.test.js` para cubrir `lat`/`lon` en la respuesta de detalle.
- Frontend Central: `vitest` + `@testing-library/react`. La lógica de qué fletes/puntos generan marcador (filtrado de ubicaciones ausentes, FR-007) se aísla en una función pura testeable sin montar Leaflet; el componente de mapa se testea mockeando `react-leaflet` (mismo patrón que ya usa `central/tests/components/MonitorView.test.jsx`), porque `jsdom` no soporta el layout real que Leaflet necesita.

**Target Platform**: Navegadores modernos de escritorio (Central es desktop-first, no mobile-first — Restricciones Técnicas de la constitución), embebido en iframe Oracle APEX o accedido directamente.

**Project Type**: Web app existente — extensión de `central/` (frontend) y cambio menor en `backend/`, sin nuevos servicios.

**Performance Goals**:
- Reflejar cambios de ubicación en el marcador en <= 10 s (SC-002), mismo objetivo ya vigente en 002-panel-control-central — no se introduce un requisito de latencia nuevo.
- Pasar de la vista de mapa al detalle de un recorrido en <= 2 acciones (SC-003).

**Constraints**:
- Sin API keys de pago para el alcance inicial (Principio VII — simplicidad y datos mínimos); tiles públicos de OpenStreetMap.
- MUST funcionar embebido en iframe de Oracle APEX y en acceso directo (Principio III) — Leaflet renderiza a un `<div>` normal, sin usar iframes propios, por lo que no hay conflicto conocido.
- Sin cambios al modelo de datos de Oracle ni a los contratos de integración Oracle/APEX->cloud (003-arquitectura-cloud-mqtt) — el único cambio de backend es exponer un campo (`lat`/`lon`) que ya existe internamente.

**Scale/Scope**: Mismo orden de magnitud que 002/003 — decenas de fletes activos simultáneos por panel.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Principio I (Chofer página única móvil-primero): N/A — esta feature no toca la app del chofer.
- Principio II (Ruta acotada a 10 puntos): PASS — el mapa solo visualiza puntos ya validados por 001-chofer-recorrido; no agrega ni modifica reglas de cantidad/orden.
- Principio III (Central compatible con embebido APEX y acceso directo): PASS — Leaflet renderiza en un `<div>` propio de la página, sin depender de ser ventana de nivel superior ni de mecanismos incompatibles con iframes (no usa popups, no bloquea por frame). Se valida explícitamente en Fase 1/quickstart.
- Principio IV (Fuentes de verdad por dominio): PASS — el mapa lee exclusivamente del store cloud ya autoritativo para el plano operativo en vivo, vía los endpoints de Central ya existentes; no se agrega ninguna sincronización nueva con Oracle.
- Principio V (Trazabilidad de estado y ubicación en tiempo casi real): PASS — refuerza directamente este principio, dando una representación espacial inmediata de la última ubicación conocida.
- Principio VI (Mensajería interna confiable): N/A.
- Principio VII (Simplicidad y datos mínimos): PASS condicionado — se agrega una dependencia nueva (`leaflet`/`react-leaflet`); justificado porque no existe forma razonable de mostrar una visualización espacial sin una biblioteca de mapas, y se eligió la opción de menor huella (sin API key, sin backend propio de tiles) frente a alternativas más pesadas (Mapbox GL, Google Maps JS) — detalle en `research.md`.

## Project Structure

### Documentation (this feature)

```text
specs/004-mapa-seguimiento-central/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── central-map-api.md   # Phase 1 output — cambio de contrato en GET /api/central/recorridos/:id
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/src/
└── state/
    └── integracionStore.js       # MODIFICADO: serializarPuntosCentral incluye lat/lon

backend/tests/
└── integration/
    └── central-cloud-monitoreo.test.js   # MODIFICADO: cubre lat/lon en detalle

central/src/
├── components/
│   ├── MonitorView.jsx           # existente, sin cambios de contrato (se le agrega el toggle de vista al lado, en main.jsx)
│   ├── RecorridoDetalle.jsx      # MODIFICADO: pasa puntos con lat/lon al mapa de detalle
│   └── MapaSeguimiento.jsx       # NUEVO — mapa de fletes activos (Historia 1) y de puntos de un recorrido (Historia 2)
├── services/
│   └── marcadores.js             # NUEVO — función pura: recorridos/puntos -> marcadores a dibujar (filtra ubicaciones ausentes, FR-007)
└── main.jsx                      # MODIFICADO: agrega alternancia lista/mapa (FR-004), preserva selección

central/tests/
└── components/
    ├── MapaSeguimiento.test.jsx  # NUEVO
    └── marcadores.test.js        # NUEVO
```

**Structure Decision**: Extender `central/` con un componente de mapa y un
módulo de servicio puro (testeable sin Leaflet), siguiendo el mismo patrón de
capas ya usado en `central/src/components/` y `central/src/services/`. El
único cambio de `backend/` es exponer `lat`/`lon` —ya presentes internamente—
en la serialización de puntos que consume Central; no se crean rutas nuevas
ni se toca el contrato de integración Oracle/APEX (003-arquitectura-cloud-mqtt).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Nueva dependencia de mapas (`leaflet`/`react-leaflet`) — Principio VII | No existe forma de renderizar una visualización espacial de coordenadas sin una biblioteca de mapas | Implementar un renderizado propio de mapa (proyección, tiles, paneo/zoom) desde cero sería mucho más código y superficie de bugs que adoptar una biblioteca madura y liviana; se descartaron Mapbox GL/Google Maps JS por requerir API key y facturación, innecesario para el alcance actual (ver research.md, Decisión 1) |
