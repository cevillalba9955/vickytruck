# Contract: Registro de inicio y cierre del recorrido

Extiende `specs/005-chofer-estados-viaje/contracts/chofer-viaje-api.md`.
Documenta únicamente lo que cambia: el body/response nuevo de
`POST .../viaje/iniciar`, el endpoint nuevo `POST .../viaje/finalizar`, y
los campos nuevos en `GET /api/recorridos/:token` y en las respuestas de
Central. Todo lo demás de ese contrato (LLEGUE, DESCARGA COMPLETA, IR
PRIMERO, CANCELAR, formato de error `{ "error": "<código>" }`) sigue
vigente sin cambios.

## GET /api/recorridos/:token (extendido)

Se agrega `cierreEn` a `recorrido`, e `inicioEn` a cada punto.

**200 OK**
```json
{
  "recorrido": {
    "estado": "activo",
    "fleteId": "7",
    "viajeEstado": "detenido",
    "puntoActivoId": null,
    "cierreEn": null
  },
  "progreso": { "pendientes": 0, "arribados": 0, "completados": 3 },
  "puntos": [
    {
      "id": "p3",
      "orden": 3,
      "estado": "completado",
      "inicioEn": "2026-08-13T14:02:00-03:00",
      "arriboEn": "2026-08-13T14:18:00-03:00",
      "descargaEn": "2026-08-13T14:25:00-03:00"
    }
  ]
}
```

`recorrido.estado` permanece `"activo"` aunque `progreso.completados` sea
igual al total de puntos (FR-004) — es exactamente la señal que el chofer
usa para saber que corresponde tocar FINALIZAR. `inicioLat`/`inicioLon` **no**
se incluyen en esta respuesta (mismo criterio que `arriboLat`/`descargaLat`,
ya ausentes hoy — ver data-model.md).

## POST /api/recorridos/:token/viaje/iniciar (extendido)

Mismo efecto que hoy (Detenido → Manejando sobre el primer punto pendiente,
FR-007 de 005), agregando la captura de fecha/hora + ubicación (FR-001,
FR-002 de esta spec). Body opcional (igual que ya aceptan `llegue` y
`descarga-completa`):

**Body**
```json
{ "lat": -34.60, "lon": -58.38, "clienteEn": "2026-08-13T14:02:00.000Z" }
```

Todos los campos son opcionales — sin body, o sin `lat`/`lon`, el evento de
inicio se registra igual, solo con la fecha/hora de servidor (FR-002).

**200 OK**
```json
{ "viajeEstado": "manejando", "puntoActivoId": "p3", "puedeCancelar": true }
```

**409 Conflict** — sin cambios respecto al contrato de 005 (`viajeEstado`
actual no es `detenido`, o no hay puntos pendientes).

## POST /api/recorridos/:token/viaje/finalizar (nuevo)

Único endpoint que puede llevar `recorrido.estado` a `"finalizado"`
(FR-007). Requiere `viajeEstado === "detenido"` y que todos los puntos
estén `completado` — exactamente la condición bajo la cual hoy se muestra
el botón FINALIZAR en la UI (FR-008, sin cambios respecto a FR-012 de 005).
Body opcional, mismo formato que `iniciar`:

**Body**
```json
{ "lat": -34.61, "lon": -58.39, "clienteEn": "2026-08-13T14:40:00.000Z" }
```

**200 OK**
```json
{ "estado": "finalizado", "cierreEn": "2026-08-13T14:40:00-03:00" }
```

Si se llama de nuevo sobre un recorrido ya finalizado (reintento offline,
FR-009), responde `200 OK` idempotente con el `cierreEn` original, sin
sobrescribirlo (research.md, Decisión 3).

**409 Conflict** — el recorrido todavía tiene puntos pendientes/arribados,
o `viajeEstado` no es `detenido`.
```json
{ "error": "recorrido_no_completado" }
```

**404 Not Found** — token inválido (`{ "error": "enlace_invalido" }`),
mismo formato que el resto de los endpoints de `viaje/*`.

## GET /api/central/recorridos/activos (extendido)

Se agrega `esperandoFinalizar` por recorrido (research.md, Decisión 5).

**200 OK**
```json
{
  "recorridos": [
    {
      "id": "R-1",
      "flete": { "id": "7", "nombre": "Camión 7" },
      "progreso": { "pendientes": 0, "arribados": 0, "completados": 3 },
      "viajeEstado": "detenido",
      "puntoActivoId": null,
      "esperandoFinalizar": true
    }
  ]
}
```

## GET /api/central/recorridos/historial y GET /api/central/recorridos/:id (extendido)

Se agrega `cierreEn` a `recorrido`, e `inicioEn` a cada punto dentro de
`puntos`. `inicioLat`/`inicioLon`/`cierreLat`/`cierreLon` **no** se incluyen
(research.md, Decisión 4).

**200 OK** (`GET /api/central/recorridos/:id`)
```json
{
  "recorrido": { "id": "R-1", "estado": "finalizado", "fleteId": "7", "cierreEn": "2026-08-13T14:40:00-03:00" },
  "puntos": [
    { "id": "p3", "orden": 3, "estado": "completado", "inicioEn": "2026-08-13T14:02:00-03:00", "arriboEn": "...", "descargaEn": "...", "remitoIds": [] }
  ]
}
```

## Notas transversales

- Los endpoints por-punto de 001-chofer-recorrido
  (`POST /puntos/:puntoId/arribo|descarga`) pierden, junto con
  `viaje/llegue` y `viaje/descarga-completa`, la capacidad de finalizar el
  recorrido automáticamente (FR-004) — su comportamiento de marcado sobre el
  punto no cambia en nada más.
- Todas las respuestas de error mantienen el formato
  `{ "error": "<código>" }` ya usado en 001/005.
- Este contrato no agrega ni modifica nada en `GET /api/integracion/estado`
  (consumido por Oracle/APEX) — `inicioEn`/`cierreEn` no viajan hacia
  Oracle en esta spec (fuera de alcance, ver Assumptions de spec.md).
