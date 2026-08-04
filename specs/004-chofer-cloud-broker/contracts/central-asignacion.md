# Contract: Extensión de `POST /api/central/recorridos/:id/asignar` y `.../reasignar`

Extiende el contrato ya definido en
[central-api.md](../../002-panel-control-central/contracts/central-api.md) (no lo reemplaza):
mismos endpoints, mismos códigos de error (`404 recorrido_no_encontrado`, `409 ya_asignado`,
`409 flete_ocupado`), un campo nuevo en la respuesta `200`.

## POST /api/central/recorridos/:id/asignar (extendido)

**200 OK**
```json
{
  "recorridoId": "r10",
  "fleteId": "f3",
  "token": "abc123...",
  "asignadoEn": "2026-08-04T12:00:00Z",
  "enlace": "https://vickytruck-chofer.pages.dev/#/r/eyJyZWNvcnJpZG8iOns..."
}
```

- `token`: se mantiene por compatibilidad interna/diagnóstico (ej. logs), pero **ya no es lo que
  Central distribuye al chofer**.
- `enlace`: campo nuevo — URL completa lista para copiar y enviar por el canal externo elegido
  (ej. WhatsApp). Construida por `backend/src/services/enlaceRecorrido.js` (ver
  [enlace-recorrido.md](./enlace-recorrido.md) para el esquema del payload embebido).

## POST /api/central/recorridos/:id/reasignar (extendido)

Misma extensión (`enlace` en la respuesta `200`). Al reasignar, el `token` anterior queda
invalidado (comportamiento ya existente, `tokenAnteriorInvalidado: true`) y el `enlace` devuelto
corresponde siempre al nuevo token/credencial.

```json
{
  "recorridoId": "r10",
  "fleteId": "f4",
  "token": "def456...",
  "asignadoEn": "2026-08-04T13:00:00Z",
  "tokenAnteriorInvalidado": true,
  "enlace": "https://vickytruck-chofer.pages.dev/#/r/eyJyZWNvcnJpZG8iOns..."
}
```

## Idempotencia

Pedir de nuevo el enlace de un recorrido ya asignado (antes de que finalice) MUST devolver el
mismo `enlace` (FR-006, US3 acceptance scenario 2) — no genera una nueva credencial ni un nuevo
`token`. Esto ya se cumple hoy para la credencial MQTT (`derivarPassword` es determinística); se
extiende el mismo criterio a la construcción completa del `enlace`.

## Cambios en `central/src/components/AsignacionForm.jsx`

Donde hoy se muestra:
```jsx
Asignación confirmada. Enlace único para el flete: <code>{resultado.token}</code>
```

pasa a mostrar `resultado.enlace` (URL completa), con una acción de copiar al portapapeles —
detalle de UI a definir en `tasks.md`, no forma parte de este contrato.
