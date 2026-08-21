# Contract: GET /api/recorridos/:token — campo choferId agregado

**Actualiza** el contrato de `specs/001-chofer-recorrido/contracts/chofer-api.md`
para este endpoint. Sin cambios de ruta ni de método — solo un campo nuevo
en la respuesta y un cambio en cómo se calcula `mqtt`.

## Request

Sin cambios: `GET /api/recorridos/:token`

## Response 200 — campos afectados

```json
{
  "recorrido": {
    "estado": "activo",
    "fleteId": "13",
    "choferId": "42",
    "cierreEn": null,
    "intervaloUbicacionMs": 60000,
    "mqtt": {
      "url": "wss://broker.emqx.io:8084/mqtt",
      "username": "chofer-42",
      "password": "<credencial permanente derivada del choferId>",
      "topic": "chofer/42/ubicacion"
    },
    "viajeEstado": "detenido",
    "puntoActivoId": null,
    "puedeCancelar": false
  },
  "progreso": { "pendientes": 3, "arribados": 0, "completados": 0 },
  "puntos": [ /* sin cambios */ ]
}
```

| Campo | Antes | Ahora |
|---|---|---|
| `recorrido.choferId` | ausente en la respuesta (existía en el store, no se exponía) | **agregado**, siempre presente (`null` si Oracle todavía no lo informó) |
| `recorrido.mqtt` | `null` si faltaba `fleteId` **o** `choferId` **o** `EMQX_WSS_URL` | `null` si falta `choferId` **o** `EMQX_WSS_URL` — `fleteId` ya no es requisito |
| `recorrido.mqtt.topic` | `chofer/{fleteId}/ubicacion` | `chofer/{choferId}/ubicacion` |

El resto de la respuesta (puntos, progreso, estado de viaje, etc.) no
cambia.

## Consumidor

El frontend (`main.jsx`) usa el nuevo `recorrido.choferId` para poblar la
caché local (`choferCache.js`) en cada carga exitosa — ver `data-model.md`
"Caché local del dispositivo".
