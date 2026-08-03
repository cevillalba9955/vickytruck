# Implementation Plan: App Chofer — Recepción y Ejecución de Recorrido de Entregas

**Branch**: `001-chofer-recorrido` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-chofer-recorrido/spec.md`

## Summary

Una SPA web mobile-first para el chofer: abre un enlace único (token) sin login, ve la
lista ordenada de hasta 10 puntos de entrega con su ubicación, y marca "arribo" y
"descarga completa" sobre cualquier punto (marcado libre, no secuencial). Cada evento se
registra con timestamp de servidor y, si está disponible, la ubicación GPS del
dispositivo. Las acciones sin conectividad se encolan localmente y se reintentan solas.
Enfoque técnico: frontend React SPA que consume una API HTTP fina en Node.js, la cual lee
y escribe directamente contra Oracle (fuente única de verdad, Principio IV) — sin
almacenamiento propio persistente. La creación del recorrido/token y la mensajería interna
son responsabilidad de features separadas (Central), fuera de este alcance.

## Technical Context

**Language/Version**: JavaScript ESM. Backend: Node.js ≥ 20.12. Frontend: React 18
(componentes funcionales con hooks).

**Primary Dependencies**:
- Backend: `oracledb` (driver oficial de Oracle) + módulo `node:http` nativo, sin
  framework (Express/Fastify) — mismo criterio minimalista que otros proyectos Oracle del
  autor (una sola dependencia runtime).
- Frontend: `react`, `react-dom`, `vite` (dev server/build), `vitest` +
  `@testing-library/react` + `@testing-library/jest-dom` para tests de componentes
  (devDependencies).

**Storage**: Oracle (tablas de recorrido, punto de entrega y token) vía `oracledb`; es la
única fuente de verdad (Principio IV). Cola de reintento offline en el cliente vía
`localStorage` — efímera, nunca autoritativa.

**Testing**: `node --test` para contratos/integración del backend (resolución de token,
transición de estados, límite de 10 puntos). `vitest` + Testing Library para el frontend
(render de la lista, flujo de marcado, cola offline).

**Target Platform**: navegadores móviles modernos (Chrome/Safari en Android/iOS) sobre
conexión de datos variable; backend accesible por HTTPS desde Internet (el chofer está en
ruta, no en red local).

**Project Type**: web (frontend SPA + backend API fino).

**Performance Goals**: recorrido visible en <5 s en conexión móvil típica (SC-001);
marcar un evento en una sola acción táctil (SC-002); eventos visibles para Central en
<10 s con conectividad (SC-003).

**Constraints**:
- El backend no mantiene copia divergente de datos de recorrido: Oracle es la única
  fuente de verdad (Principio IV).
- Toda la interacción del chofer ocurre en una única vista (Principio I, FR-013).
- La ubicación GPS es opcional y no bloqueante (FR-006).
- Los eventos marcados sin conectividad deben encolarse y reintentarse sin duplicarse ni
  perderse (FR-010).

**Scale/Scope**: recorridos de hasta 10 puntos; volumen esperado bajo-moderado (decenas
de fletes activos simultáneos), sin requisitos de alta escala.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Chofer: página única, móvil-primero | PASS — una única vista React, mobile-first, sin navegación multi-pantalla. |
| II. Ruta acotada y ordenada (máx. 10 puntos) | PASS — el backend expone y valida el límite de 10 puntos; el chofer no reordena, solo marca eventos. |
| III. Central embebible en Oracle APEX | N/A en esta feature — corresponde a la feature de Central (fuera de alcance, ver Assumptions del spec). |
| IV. Oracle como fuente única de verdad | PASS — todo estado (puntos, eventos, token) vive en Oracle vía `oracledb`; sin base de datos adicional. |
| V. Trazabilidad en tiempo (casi) real | PASS (lado chofer) — cada evento se persiste con timestamp de servidor apenas hay conectividad; la visibilidad en Central depende de esa feature, no de esta. |
| VI. Mensajería interna | N/A en esta feature — explícitamente fuera de alcance (ver Assumptions del spec). |
| VII. Simplicidad y datos mínimos | PASS — sin framework de backend, sin sistema de autenticación, GPS solo durante recorrido activo. |

No hay violaciones que requieran justificación en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-chofer-recorrido/
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
│   ├── db/              # pool oracledb + queries (recorrido, punto, evento)
│   ├── routes/          # handlers HTTP finos (recorrido.js)
│   └── server.js        # node:http, sin framework
└── tests/
    ├── contract/        # contrato de cada endpoint
    └── integration/      # flujo completo: resolver token -> marcar eventos

frontend/
├── src/
│   ├── components/       # RouteView, DeliveryPointCard, ProgressSummary
│   ├── services/         # api.js, offlineQueue.js, geolocation.js
│   └── main.jsx
└── tests/
    └── components/
```

**Structure Decision**: Web application (Option 2: frontend + backend) — un backend Node
mínimo dedicado a esta feature (`backend/`) sirve la API que consulta/actualiza Oracle, y
un frontend React (`frontend/`) implementa la SPA del chofer. No se comparte código con
la futura feature de Central todavía; si en el futuro Central reutiliza este mismo
backend, se evaluará en esa feature.

## Complexity Tracking

*Sin violaciones de la Constitution Check; tabla no aplica.*
