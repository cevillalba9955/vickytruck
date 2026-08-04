# Quickstart: Central — Panel de Control de Recorridos y Fletes

Guía de validación end-to-end de la feature. No incluye código de implementación; asume
que `backend/` (extendido) y `central/` (ver Project Structure en plan.md) ya existen.

## Prerrequisitos

- Node.js ≥ 20.12 instalado.
- Acceso a la misma instancia Oracle que usa `backend/` de 001-chofer-recorrido, con al
  menos un recorrido precargado sin flete asignado y al menos un flete disponible (ver
  research.md §5 sobre nombres de vista/tabla asumidos).
- Variables de entorno del backend ya configuradas (`ORACLE_USER`, `ORACLE_PASSWORD`,
  `ORACLE_CONNECT_STRING`), más las nuevas si corresponde (`ORACLE_TABLA_FLETES`, umbral
  de ubicación reciente — research.md §7).

## Levantar el entorno

```bash
# Backend (ya existente, extendido con las rutas de Central)
cd backend
npm install
npm start   # levanta Express en el puerto configurado; expone /api/recorridos y /api/central

# Frontend de Central (en otra terminal)
cd central
npm install
npm run dev   # servidor de desarrollo Vite
```

Para simular el embebido real en APEX durante desarrollo, abrir `central/` dentro de un
`<iframe>` en una página HTML de prueba en vez de navegar directamente a su URL.

## Escenario de validación 1 — Asignar un recorrido precargado (US2)

1. Confirmar en Oracle un recorrido precargado sin flete asignado (por ejemplo, id `50`,
   6 puntos) y un flete disponible (por ejemplo, id `7`).
2. Abrir el panel embebido y ubicar el recorrido `50` en la lista de "disponibles".
3. Asignarlo al flete `7`.
4. **Resultado esperado**: la asignación se persiste de inmediato, se genera un enlace
   único (token), y el recorrido `50` aparece en la lista de recorridos activos con el
   flete `7` (FR-005, FR-006, SC-003).
5. Intentar asignar el mismo recorrido `50` a otro flete mediante la acción de asignación
   simple: **Resultado esperado**: rechazado con `ya_asignado` (FR-007).

## Escenario de validación 2 — Monitoreo en vivo (US1)

1. Con el recorrido `50` activo y asignado al flete `7`, abrir la app del chofer
   (`frontend/`, feature 001) con el token generado y marcar "arribo" en un punto.
2. **Resultado esperado**: sin recargar manualmente el panel de Central, el conteo de
   pendientes/arribados/completados de ese recorrido se actualiza en menos de 10
   segundos (FR-002, SC-002).
3. Dejar de reportar ubicación desde el chofer por más del umbral configurado.
4. **Resultado esperado**: el panel marca la última ubicación de ese flete como "no
   reciente" en vez de mostrarla como dato actual (FR-014).

## Escenario de validación 3 — Ver detalle e historial (US3 + US5)

1. Abrir el detalle del recorrido `50` desde la vista de monitoreo.
2. **Resultado esperado**: se listan sus 6 puntos en orden, con estado y eventos
   registrados (FR-008).
3. Completar todos los puntos del recorrido (vía la app del chofer) y buscarlo luego en
   la sección de historial del panel.
4. **Resultado esperado**: aparece con su línea de tiempo completa de eventos (FR-010).

## Escenario de validación 4 — Reasignar un recorrido activo (US4)

1. Con el recorrido `50` activo (2 de 6 puntos completados) y otro flete disponible (id
   `9`), ejecutar la reasignación desde el panel.
2. **Resultado esperado**: el recorrido queda vinculado al flete `9`, los 2 puntos
   completados conservan su estado, y se genera un nuevo enlace único (FR-009).
3. Intentar abrir el enlace único anterior (del flete `7`) desde la app del chofer.
4. **Resultado esperado**: ya no es reconocido como válido para ese recorrido (Historia
   4, escenario 2).

## Escenario de validación 5 — Fuera del iframe de APEX (Edge case, FR-011/FR-012)

1. Navegar directamente a la URL de `central/` fuera de cualquier `<iframe>`.
2. **Resultado esperado**: se muestra un mensaje claro indicando que la app debe abrirse
   embebida desde APEX, sin exponer datos de recorridos/fletes y sin fallar
   silenciosamente.

## Escenario de validación 6 — Asignación concurrente (Edge case, FR-015)

1. Con el recorrido `50` disponible, disparar dos asignaciones casi simultáneas hacia
   fletes distintos (por ejemplo, dos pestañas o dos llamadas concurrentes a
   `POST /api/central/recorridos/50/asignar`).
2. **Resultado esperado**: solo una de las dos asignaciones resulta en `200 OK`; la otra
   recibe `409 Conflict` (`ya_asignado`), sin que el recorrido quede en un estado
   ambiguo (SC-005).
