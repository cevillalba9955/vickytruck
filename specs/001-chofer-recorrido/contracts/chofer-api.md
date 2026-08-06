# Contract: API del Chofer

API HTTP fina consumida únicamente por la SPA del chofer. Todas las rutas están
prefijadas por el token del recorrido; no hay autenticación adicional (ver
Clarifications de spec.md).

## GET /api/recorridos/:token

Resuelve el token y devuelve el recorrido completo con sus puntos, en el orden definido.

**200 OK**
```json
{
  "recorrido": {
    "estado": "activo",
    "fleteId": "7",
    "intervaloUbicacionMs": 60000,
    "mqtt": {
      "url": "wss://<host-emqx-cloud>:8084/mqtt",
      "username": "chofer-7",
      "password": "<credencial publish-only derivada del fleteId>",
      "topic": "chofer/7/ubicacion"
    }
  },
  "progreso": { "pendientes": 6, "arribados": 1, "completados": 3 },
  "puntos": [
    {
      "id": "p1",
      "orden": 1,
      "totalPuntos": 10,
      "latitud": -34.6037,
      "longitud": -58.3816,
      "estado": "completado",
      "arriboEn": "2026-08-03T12:01:00Z",
      "descargaEn": "2026-08-03T12:15:00Z"
    }
  ]
}
```

**404 Not Found** — token inexistente.
**410 Gone** — token revocado o recorrido finalizado hace más de lo esperado.
Ambos casos devuelven `{ "error": "enlace_invalido" }` sin exponer datos de otros
recorridos (FR-012).

`mqtt` es la credencial publish-only del flete para el reporte periódico de
ubicación (ver `ubicacionPeriodica.js`/`ubicacionMqtt.js`), aprovisionada en
EMQX Cloud al recibir el recorrido de Oracle/APEX (`backend/src/mqtt/emqxProvisioning.js`,
ver `integracion-api.md` de 003-arquitectura-cloud-mqtt) y derivada acá sin
volver a llamar a la API de EMQX (`password` es determinística — mismo
`fleteId`, misma `password`, siempre). Es `null` si el recorrido todavía no
tiene `fleteId` asignado, o si el backend corre sin EMQX configurado. La
credencial solo puede publicar en su propio `topic` (`chofer/{fleteId}/ubicacion`),
nunca en el de otro flete — el bundle público del chofer nunca embebe una
credencial de alcance más amplio.

## POST /api/recorridos/:token/puntos/:puntoId/arribo

Marca el punto como `arribado`.

**Body** (todos los campos opcionales):
```json
{ "lat": -34.60, "lon": -58.38, "timestampCliente": "2026-08-03T12:01:00Z" }
```

**200 OK** — transición aplicada (o ya aplicada antes: idempotente, ver research.md §6).
```json
{ "puntoId": "p3", "estado": "arribado", "arriboEn": "2026-08-03T12:01:00Z" }
```

**404 Not Found** — `puntoId` no pertenece al recorrido del token.
**409 Conflict** — el punto ya está `completado` (transición inválida hacia atrás no
soportada); devuelve el estado actual para que el cliente resincronice.

## POST /api/recorridos/:token/puntos/:puntoId/descarga

Marca el punto como `completado`. Requiere que el punto esté en estado `arribado`.

**Body**: igual forma que el endpoint de arribo.

**200 OK** — transición aplicada (o ya aplicada antes: idempotente).
```json
{ "puntoId": "p3", "estado": "completado", "descargaEn": "2026-08-03T12:15:00Z" }
```

**404 Not Found** — `puntoId` no pertenece al recorrido del token.
**409 Conflict** — el punto todavía está `pendiente` (falta marcar arribo primero, FR-007)
o ya está `completado`; devuelve el estado actual.

## POST /api/recorridos/:token/ubicacion

Reporta la ubicación GPS instantánea del chofer mientras el recorrido está activo
(FR-014 a FR-017, agregadas en una clarificación posterior a la implementación
original). Distinto de los eventos de arribo/descarga: no marca ningún punto, solo
actualiza la posición en memoria del backend, consumida por Central (research.md §8 de
002-panel-control-central).

**Body**:
```json
{ "lat": -34.60, "lon": -58.38 }
```

**200 OK** — posición registrada en memoria (nunca en Oracle).
```json
{ "ok": true }
```

**400 Bad Request** — falta `lat` o `lon`.
```json
{ "error": "ubicacion_invalida" }
```

**404 Not Found** — token inexistente/inválido.
```json
{ "error": "enlace_invalido" }
```

**Nota**: esta posición es efímera (vive en `backend/src/state/ubicacionEnMemoria.js`,
compartido con el backend de Central); se pierde sin problema ante un reinicio del
proceso (FR-017) y nunca se persiste en Oracle. El intervalo con el que el frontend
llama a este endpoint es configurable (valor por defecto: 60 segundos).

## Notas transversales

- Todas las respuestas de error usan el formato `{ "error": "<código>" }` para que el
  frontend pueda distinguir "enlace inválido" de "conflicto de estado" sin parsear texto.
- Ninguna ruta acepta reordenar puntos ni modificar `latitud`/`longitud`: esos datos son
  de solo lectura desde la perspectiva del chofer (Principio II).
