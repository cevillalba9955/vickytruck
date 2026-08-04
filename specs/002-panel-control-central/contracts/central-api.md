# Contract: API de Central

API HTTP fina consumida únicamente por el frontend `central/`, montada bajo
`/api/central` en el mismo backend Express de `backend/` (junto a `/api/recorridos` del
chofer). Sin autenticación propia: la identidad del operador se resuelve por el contexto
de la página APEX contenedora (research.md §4); esta API asume que solo se llama desde un
contexto ya autorizado por APEX.

## GET /api/central/recorridos/activos

Lista los recorridos actualmente `activo` con su flete asignado, progreso y última
ubicación conocida (Historia 1, FR-001, FR-002). Pensado para ser sondeado (polling) cada
pocos segundos por el frontend.

`ultimaUbicacion` NO sale de Oracle en el caso normal: sale de la posición en memoria del
backend compartido con 001-chofer-recorrido; solo si no hay dato en memoria se usa como
respaldo la última ubicación de un evento arribo/descarga ya persistido en Oracle
(FR-016, research.md §8). `reciente` aplica el mismo umbral configurado sin importar cuál
de las dos fuentes se haya usado.

**200 OK**
```json
{
  "recorridos": [
    {
      "id": "42",
      "flete": { "id": "7", "nombre": "Juan Pérez" },
      "progreso": { "pendientes": 2, "arribados": 1, "completados": 3 },
      "ultimaUbicacion": {
        "lat": -34.60, "lon": -58.38,
        "en": "2026-08-03T14:02:00Z",
        "reciente": true
      }
    }
  ]
}
```

## GET /api/central/recorridos/disponibles

Lista los recorridos precargados sin flete asignado (Historia 2, FR-003).

**200 OK**
```json
{ "recorridos": [ { "id": "50", "totalPuntos": 6 } ] }
```

## GET /api/central/fletes/disponibles

Lista los fletes sin un recorrido activo asignado en este momento (Historia 2, FR-004).

**200 OK**
```json
{ "fletes": [ { "id": "7", "nombre": "Juan Pérez" } ] }
```

## POST /api/central/recorridos/:id/asignar

Asigna un recorrido precargado (`fleteId = NULL`) a un flete disponible (Historia 2,
FR-005, FR-006).

**Body**
```json
{ "fleteId": "7" }
```

**200 OK** — asignación aplicada.
```json
{ "recorridoId": "50", "fleteId": "7", "token": "tok-abc123", "asignadoEn": "2026-08-03T14:00:00Z" }
```

**404 Not Found** — `recorridoId` inexistente.
**409 Conflict** — el recorrido ya tiene un flete activo asignado (FR-007), o el flete
elegido ya tiene otro recorrido activo (Historia 2, escenario 4).
```json
{ "error": "ya_asignado" }
```
```json
{ "error": "flete_ocupado" }
```

## POST /api/central/recorridos/:id/reasignar

Reasigna explícitamente un recorrido activo a otro flete (Historia 4, FR-009).

**Body**
```json
{ "fleteId": "9" }
```

**200 OK**
```json
{
  "recorridoId": "50",
  "fleteId": "9",
  "token": "tok-def456",
  "asignadoEn": "2026-08-03T15:30:00Z",
  "tokenAnteriorInvalidado": true
}
```

**404 Not Found** — `recorridoId` inexistente o no está `activo`.
**409 Conflict** — el flete destino ya tiene otro recorrido activo.
```json
{ "error": "flete_ocupado" }
```

## GET /api/central/recorridos/:id

Detalle completo de un recorrido: puntos ordenados, estado individual y eventos
registrados (Historia 3, FR-008).

**200 OK**
```json
{
  "recorrido": { "id": "42", "estado": "activo", "fleteId": "7" },
  "puntos": [
    {
      "id": "p1", "orden": 1, "totalPuntos": 6,
      "estado": "completado",
      "arriboEn": "2026-08-03T12:01:00Z",
      "descargaEn": "2026-08-03T12:15:00Z"
    }
  ]
}
```

**404 Not Found** — recorrido inexistente.

## GET /api/central/recorridos/historial

Lista recorridos `finalizado` (Historia 5, FR-010). Cada entrada incluye la misma forma
que el detalle (`GET /api/central/recorridos/:id`) para poder reutilizar el mismo
componente de línea de tiempo en el frontend.

**200 OK**
```json
{ "recorridos": [ { "id": "42", "fleteId": "7", "puntos": [ "..." ] } ] }
```

## Notas transversales

- Todas las respuestas de error usan `{ "error": "<código>" }`, mismo formato que
  `contracts/chofer-api.md` de 001-chofer-recorrido, para consistencia entre ambas APIs.
- Ninguna ruta de esta API permite crear/editar puntos de entrega ni el directorio de
  fletes (fuera de alcance — Clarifications de spec.md).
- `GET /api/central/recorridos/activos` es de solo lectura y segura de sondear (polling)
  repetidamente; no tiene efectos secundarios.
- Esta API asume que corre en el mismo proceso backend que expone el reporte periódico
  de ubicación de 001-chofer-recorrido (FR-014 a FR-017 de esa spec): la lectura de
  `ultimaUbicacion` no es una llamada de red adicional, sino acceso directo a un módulo
  en memoria compartido dentro del mismo proceso Express (research.md §8).
