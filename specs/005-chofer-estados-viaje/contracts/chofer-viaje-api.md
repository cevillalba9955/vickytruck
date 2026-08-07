# Contract: API de Estado de Viaje del Chofer

Endpoints nuevos, prefijados por el token del recorrido igual que los ya
documentados en `specs/001-chofer-recorrido/contracts/chofer-api.md` (sin
autenticación adicional). Extienden `GET /api/recorridos/:token` con los
campos de información de recorrido y el estado de viaje.

## GET /api/recorridos/:token (extendido)

Mismo endpoint de 001-chofer-recorrido. Se agregan campos nuevos —
`remito`/`remitoIds` **no aparece en ningún lugar de esta respuesta** (FR-003).

**200 OK**
```json
{
  "recorrido": {
    "estado": "activo",
    "fleteId": "7",
    "intervaloUbicacionMs": 60000,
    "mqtt": { "...": "sin cambios, ver chofer-api.md" },
    "viajeEstado": "manejando",
    "puntoActivoId": "p3"
  },
  "progreso": { "pendientes": 6, "arribados": 1, "completados": 3 },
  "puntos": [
    {
      "id": "p3",
      "orden": 1,
      "totalPuntos": 10,
      "latitud": -34.6037,
      "longitud": -58.3816,
      "estado": "pendiente",
      "arriboEn": null,
      "descargaEn": null,
      "cliente": "Distribuidora Sur SRL",
      "direccion": "Av. Rivadavia 1234, CABA",
      "rangoHorario": "09:00–12:00",
      "notasEntrega": "Tocar timbre de depósito, no el de oficina"
    }
  ]
}
```

Campos ausentes en Oracle (`cliente`/`direccion`/`rangoHorario`/`notasEntrega`)
se omiten (`null` o ausentes, FR-004) sin bloquear el resto de la respuesta.
`puntoActivoId` es `null` cuando `viajeEstado === "detenido"`.

## POST /api/recorridos/:token/viaje/iniciar

Detenido → Manejando sobre el primer punto pendiente (FR-007). Sin body.

**200 OK**
```json
{ "viajeEstado": "manejando", "puntoActivoId": "p3" }
```

**409 Conflict** — `viajeEstado` actual no es `detenido`, o no hay puntos
pendientes.
```json
{ "error": "transicion_invalida", "viajeEstado": "detenido" }
```

## POST /api/recorridos/:token/viaje/llegue

Manejando → Descargando; marca arribo sobre `puntoActivoId` (mismo efecto
que `POST /puntos/:id/arribo` de 001, pero sin necesidad de pasar `puntoId`
— siempre opera sobre el punto activo). Sin body salvo `lat`/`lon` opcionales
(igual que el endpoint de arribo existente).

**200 OK**
```json
{ "viajeEstado": "descargando", "puntoActivoId": "p3", "puntoEstado": "arribado", "arriboEn": "2026-08-07T12:01:00Z" }
```

**409 Conflict** — `viajeEstado` actual no es `manejando`.

## POST /api/recorridos/:token/viaje/descarga-completa

Descargando → Detenido; marca descarga sobre `puntoActivoId` (mismo efecto
que `POST /puntos/:id/descarga` de 001). Sin body salvo `lat`/`lon`
opcionales.

**200 OK**
```json
{ "viajeEstado": "detenido", "puntoActivoId": null, "puntoEstado": "completado", "descargaEn": "2026-08-07T12:15:00Z" }
```

**409 Conflict** — `viajeEstado` actual no es `descargando`.

## POST /api/recorridos/:token/viaje/ir-primero

Solo válido en `viajeEstado === "detenido"`, sobre un punto `pendiente`
distinto del primero (FR-014, FR-015).

**Body**
```json
{ "puntoId": "p7" }
```

**200 OK** — devuelve la lista de pendientes ya reordenada.
```json
{ "ok": true, "puntos": [{ "id": "p7", "orden": 1 }, { "id": "p3", "orden": 2 }] }
```

**404 Not Found** — `puntoId` no existe en el recorrido.
**409 Conflict** — `viajeEstado` no es `detenido`, `puntoId` ya es el primero
pendiente, `puntoId` no está `pendiente`, o solo queda un punto pendiente.

## POST /api/recorridos/:token/viaje/cancelar

Revierte la última operación de viaje aplicada, si todavía no fue leída por
Oracle (`ultimaOperacion.sincronizada === false`, ver research.md Decisión 3
y data-model.md). Sin body.

**200 OK** — devuelve el estado restaurado (misma forma que la respuesta de
la operación que se está revirtiendo).
```json
{ "viajeEstado": "detenido", "puntoActivoId": null }
```

**409 Conflict** — no hay ninguna operación para cancelar, o la última ya
está sincronizada.
```json
{ "error": "nada_para_cancelar" }
```

## Notas transversales

- Ninguno de estos endpoints acepta editar `cliente`/`direccion`/
  `rangoHorario`/`notasEntrega`/coordenadas — siguen siendo de solo lectura
  desde el chofer (igual que ya establecía 001-chofer-recorrido para
  `latitud`/`longitud`).
- Los endpoints por-punto de 001-chofer-recorrido
  (`POST /puntos/:puntoId/arribo|descarga`) **no se eliminan ni cambian**;
  `viaje/llegue` y `viaje/descarga-completa` los reusan internamente contra
  `puntoActivoId`, agregando la validación de `viajeEstado` (research.md,
  Decisión 2 y 7).
- Todas las respuestas de error mantienen el formato
  `{ "error": "<código>" }` ya usado en 001-chofer-recorrido.
