# Contract: API de Integracion Oracle/APEX -> Cloud

## Endpoint 1: Upsert de recorridos

- Method: `POST`
- Path: `/api/integracion/recorridos`
- Auth: `Authorization: Bearer <service-token>` o `x-api-key`

### Request (ejemplo)

```json
{
  "source": "oracle-apex",
  "recorridos": [
    {
      "id": "R-1001",
      "token": "a1b2c3d4",
      "fleteId": "F-12",
      "fleteNombre": "Juan Pérez",
      "estado": "activo",
      "puntos": [
        { "id": "P-1", "orden": 1, "estado": "pendiente", "lat": -34.6, "lon": -58.4 }
      ],
      "updatedAt": "2026-08-05T13:20:00Z"
    }
  ]
}
```

`token` es el mismo token con el que el chofer resuelve su recorrido en
`GET /api/recorridos/:token` (backend cloud, feature 001) — lo genera y
posee Oracle/APEX, el backend cloud solo lo indexa. Un recorrido sin `token`
queda cargado en el store pero no es accesible por el chofer.

Cuando el chofer marca arribo/descarga, ese cambio se aplica directo sobre
este mismo store (nunca contra Oracle) y queda reflejado de inmediato en el
endpoint de consulta de estado de abajo — es la única forma en que Oracle/APEX
se entera de esos eventos, vía polling. Un re-push del mismo recorrido no pisa
el progreso ya confirmado por el chofer (solo se refresca la topología:
`orden`/`lat`/`lon`).

`fleteNombre` (opcional) es el nombre a mostrar del flete — lo usa el panel
Central (`GET /api/central/recorridos/activos`) para no depender de un
catálogo de fletes propio. **Central en cloud es de solo lectura**: no existe
ningún endpoint para asignar/reasignar flete desde ahí — esa operación ocurre
en Oracle/APEX antes de este push (un recorrido llega siempre con `fleteId`
ya definido, o sin él si todavía no fue asignado, en cuyo caso no aparece en
el monitoreo de Central hasta que Oracle/APEX lo re-envíe con `fleteId`).

### Response 200

```json
{
  "ok": true,
  "upserted": 1,
  "rejected": 0
}
```

## Endpoint 2: Consulta de estado

- Method: `GET`
- Path: `/api/integracion/estado`
- Query:
  - `recorridoId` (opcional)
  - `limit` (opcional, default 50; aplica cuando no se envía `recorridoId`)
  - `offset` (opcional, default 0; aplica cuando no se envía `recorridoId`)

### Response 200 (ejemplo)

```json
{
  "recorridos": [
    {
      "id": "R-1001",
      "estado": "activo",
      "puntos": [
        {
          "id": "P-1",
          "estado": "arribado",
          "arriboEn": "2026-08-05T13:31:00Z",
          "arriboLat": -34.61,
          "arriboLon": -58.41,
          "descargaEn": null,
          "descargaLat": null,
          "descargaLon": null
        }
      ]
    }
  ]
}
```

`arriboLat`/`arriboLon`/`descargaLat`/`descargaLon` son el GPS del celular del
chofer en el momento exacto de marcar cada evento (no la topología del punto,
que es fija y ya viaja en el Endpoint 1 como `lat`/`lon`) — dato de auditoría
de "desde dónde" confirmó el chofer. Vienen en `null` hasta que el chofer
marca el evento; una vez capturados en la primera transición no se pisan en
repeticiones idempotentes ni en re-pushes de topología desde Oracle/APEX.

### Response 200 (sin `recorridoId`, paginado)

```json
{
  "recorridos": [
    { "id": "R-1002", "estado": "activo", "puntos": [] }
  ],
  "paginacion": {
    "total": 120,
    "limit": 50,
    "offset": 0,
    "hasNext": true
  }
}
```

## Errores

- `400 invalid_payload`
- `401 unauthorized`
- `403 forbidden`
- `404 recorrido_no_encontrado`
- `429 too_many_requests`
- `500 error_interno`