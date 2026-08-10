# Endpoints de Backend

Documentacion operativa de los endpoints HTTP expuestos por `backend/src/server.js`.

## Base URL y prefijos

- Base local por defecto: `http://localhost:3001`
- Prefix chofer: `/api/recorridos`
- Prefix central: `/api/central`
- Prefix integracion: `/api/integracion`

## Reglas transversales

- Formato JSON en request/response.
- CORS habilitado solo para origenes incluidos en `CORS_ORIGINS`.
- Header permitido: `Content-Type`, `x-api-key`, `Authorization`.
- Fallback de ruta inexistente: `404 { "error": "ruta_no_encontrada" }`.
- Error no controlado: `500 { "error": "error_interno" }`.

## Autenticacion

### /api/recorridos/* (chofer)

- No requiere API key ni bearer.
- El acceso se controla por token en la URL.

### /api/central/* (panel)

- No requiere API key ni bearer en backend.
- Debe protegerse por borde (WAF, rate limit, allowlist) en cloud.

### /api/integracion/* (Oracle/APEX)

Requiere al menos una credencial configurada:

- `INTEGRACION_API_KEY` o
- `INTEGRACION_BEARER_TOKEN`

Headers aceptados:

- `x-api-key: <valor>` o
- `Authorization: Bearer <token>`

Errores de auth:

- `503 { "error": "integracion_auth_no_configurada" }` si no hay credenciales cargadas.
- `401 { "error": "unauthorized" }` si el header no coincide.

## Endpoints de chofer

## 1) Obtener recorrido por token

- Metodo: `GET`
- Path: `/api/recorridos/:token`

### Response 200

```json
{
  "recorrido": {
    "estado": "activo",
    "fleteId": "13",
    "intervaloUbicacionMs": 60000,
    "mqtt": {
      "url": "wss://broker.emqxsl.com:8084/mqtt",
      "username": "chofer-CH-345",
      "password": "<derivada>",
      "topic": "chofer/13/ubicacion"
    }
  },
  "progreso": {
    "pendientes": 1,
    "arribados": 0,
    "completados": 1
  },
  "puntos": [
    {
      "id": "p1",
      "orden": 1,
      "totalPuntos": 2,
      "latitud": -34.6,
      "longitud": -58.4,
      "estado": "pendiente",
      "arriboEn": null,
      "descargaEn": null
    }
  ]
}
```

Notas:

- `mqtt` puede ser `null` si falta `fleteId`, `choferId` o `EMQX_WSS_URL`.
- `intervaloUbicacionMs` toma `UBICACION_REPORTE_INTERVALO_MS` (default 60000).

### Errores

- `404 { "error": "enlace_invalido" }`

## 2) Marcar arribo de punto

- Metodo: `POST`
- Path: `/api/recorridos/:token/puntos/:puntoId/arribo`
- Body (opcional):

```json
{ "lat": -34.6, "lon": -58.4 }
```

### Response 200

```json
{
  "puntoId": "p1",
  "estado": "arribado",
  "arriboEn": "2026-08-03T12:01:00Z",
  "descargaEn": null
}
```

### Errores

- `404 { "error": "enlace_invalido" }`
- `404 { "error": "punto_no_encontrado" }`
- `409 { "error": "transicion_invalida", "puntoId": "p2", "estado": "completado" }`

## 3) Marcar descarga de punto

- Metodo: `POST`
- Path: `/api/recorridos/:token/puntos/:puntoId/descarga`
- Body (opcional):

```json
{ "lat": -34.6, "lon": -58.4 }
```

### Response 200

```json
{
  "puntoId": "p2",
  "estado": "completado",
  "arriboEn": "2026-08-03T12:01:00Z",
  "descargaEn": "2026-08-03T12:15:00Z"
}
```

### Errores

- `404 { "error": "enlace_invalido" }`
- `404 { "error": "punto_no_encontrado" }`
- `409 { "error": "transicion_invalida", "puntoId": "p1", "estado": "pendiente" }`

## 4) Reportar ubicacion instantanea

- Metodo: `POST`
- Path: `/api/recorridos/:token/ubicacion`
- Body:

```json
{ "lat": -34.6, "lon": -58.4 }
```

### Response 200

```json
{ "ok": true }
```

### Errores

- `400 { "error": "ubicacion_invalida" }` (falta `lat` o `lon`)
- `404 { "error": "enlace_invalido" }`

## Endpoints de central

## 5) Listar recorridos activos

- Metodo: `GET`
- Path: `/api/central/recorridos/activos`

### Response 200

```json
{
  "recorridos": [
    {
      "id": "50",
      "estado": "activo",
      "fleteId": "7",
      "flete": { "id": "7", "nombre": "Juan Perez" },
      "progreso": { "pendientes": 1, "arribados": 1, "completados": 1 },
      "ultimaUbicacion": {
        "lat": -34.6,
        "lon": -58.4,
        "en": "2026-08-03T12:00:00Z",
        "reciente": true
      }
    }
  ]
}
```

## 6) Listar historial de recorridos

- Metodo: `GET`
- Path: `/api/central/recorridos/historial`

### Response 200

```json
{
  "recorridos": [
    {
      "id": "40",
      "fleteId": "7",
      "puntos": [
        { "id": "p1", "orden": 1, "estado": "completado" }
      ]
    }
  ]
}
```

## 7) Obtener detalle de recorrido

- Metodo: `GET`
- Path: `/api/central/recorridos/:id`

### Response 200

```json
{
  "recorrido": {
    "id": "50",
    "estado": "activo",
    "fleteId": "7"
  },
  "puntos": [
    {
      "id": "p1",
      "orden": 1,
      "estado": "completado",
      "arriboEn": "2026-08-03T11:00:00Z",
      "descargaEn": "2026-08-03T11:15:00Z"
    }
  ]
}
```

### Errores

- `404 { "error": "recorrido_no_encontrado" }`

## Endpoints de integracion

Todos requieren auth tecnica (`x-api-key` o bearer).

## 8) Upsert de recorridos desde Oracle/APEX

- Metodo: `POST`
- Path: `/api/integracion/recorridos`
- Body:

```json
{
  "source": "oracle-apex",
  "recorridos": [
    {
      "id": "R-1001",
      "token": "tok-1001",
      "fleteId": "F-1",
      "choferId": "CH-345",
      "estado": "activo",
      "updatedAt": "2026-08-05T13:20:00Z",
      "puntos": [
        { "id": "P-1", "orden": 1, "estado": "pendiente", "lat": -34.6, "lon": -58.4 }
      ]
    }
  ]
}
```

### Response 200

```json
{ "ok": true, "upserted": 1, "rejected": 0 }
```

Notas:

- Si `choferId` existe, se dispara aprovisionamiento MQTT permanente en background.
- Fallas de aprovisionamiento MQTT no bloquean este endpoint (fire-and-forget).

### Errores

- `400 { "error": "invalid_payload" }` si `recorridos` no es array.
- `401 { "error": "unauthorized" }`
- `503 { "error": "integracion_auth_no_configurada" }`

## 9) Consultar estado de recorridos

- Metodo: `GET`
- Path: `/api/integracion/estado`
- Query opcional:
  - `recorridoId`
  - `limit` (default `50`, minimo efectivo `1`)
  - `offset` (default `0`, minimo efectivo `0`)

### Response 200 (con recorridoId)

```json
{
  "recorridos": [
    {
      "id": "R-1001",
      "estado": "activo",
      "fleteId": "F-1",
      "updatedAt": "2026-08-05T13:20:00Z",
      "ultimaUbicacion": null,
      "puntos": [
        {
          "id": "P-1",
          "orden": 1,
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

### Response 200 (sin recorridoId, paginado)

```json
{
  "recorridos": [{ "id": "R-2", "estado": "activo", "fleteId": "F-2", "updatedAt": null, "ultimaUbicacion": null, "puntos": [] }],
  "paginacion": {
    "total": 3,
    "limit": 2,
    "offset": 1,
    "hasNext": false
  }
}
```

### Errores

- `401 { "error": "unauthorized" }`
- `404 { "error": "recorrido_no_encontrado" }` cuando se envia `recorridoId` inexistente.
- `503 { "error": "integracion_auth_no_configurada" }`

## Curl rapido

```bash
# Integracion: upsert
curl -X POST "$BASE_URL/api/integracion/recorridos" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTEGRACION_API_KEY" \
  -d '{"source":"oracle-apex","recorridos":[]}'

# Integracion: estado paginado
curl "$BASE_URL/api/integracion/estado?limit=50&offset=0" \
  -H "x-api-key: $INTEGRACION_API_KEY"

# Chofer: obtener recorrido
curl "$BASE_URL/api/recorridos/tok-1"
```