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
      "fleteId": "F-12",
      "estado": "activo",
      "puntos": [
        { "id": "P-1", "orden": 1, "estado": "pendiente", "lat": -34.6, "lon": -58.4 }
      ],
      "updatedAt": "2026-08-05T13:20:00Z"
    }
  ]
}
```

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
- Query: `recorridoId` (opcional; sin filtro retorna lote paginado)

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
          "descargaEn": null
        }
      ]
    }
  ]
}
```

## Errores

- `400 invalid_payload`
- `401 unauthorized`
- `403 forbidden`
- `404 recorrido_no_encontrado`
- `429 too_many_requests`
- `500 error_interno`