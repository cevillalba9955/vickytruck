# Contract: Selección de canal de reporte de ubicación

Este documento describe el efecto observable de la variable de entorno
`UBICACION_CANAL_PREFERIDO` sobre dos endpoints ya existentes. No hay
endpoint nuevo — es un cambio de comportamiento sobre contratos vigentes.

## Configuración

| Variable | Valores | Default | Dónde se lee |
|---|---|---|---|
| `UBICACION_CANAL_PREFERIDO` | `"directo"` \| `"broker"` (case-insensitive) | `"directo"` (también ante ausente/vacío/valor inválido) | Backend únicamente — no existe equivalente en `frontend/` ni `central/` |

## GET /api/recorridos/:token — cambio de comportamiento (sin cambio de forma)

Contrato de forma sin cambios respecto al ya vigente (ver
`specs/012-ubicacion-por-chofer/contracts/chofer-recorrido-api.md`). Cambia
únicamente cuándo `recorrido.mqtt` es `null`:

| `UBICACION_CANAL_PREFERIDO` | `recorrido.mqtt` |
|---|---|
| `"directo"` (o ausente/inválido) | Siempre `null`, sin importar `choferId` ni `EMQX_WSS_URL`. |
| `"broker"` | Comportamiento actual sin cambios: la credencial derivada si hay `choferId` y `EMQX_WSS_URL` configurados; `null` si falta cualquiera de los dos. |

El frontend del chofer no requiere ningún cambio: `createPublisherUbicacionMqtt`
ya trata `mqttConfig == null` como "no publicar por MQTT", y
`ubicacionPeriodica.js` ya cae al POST de abajo cuando el publish no ocurrió
o falló.

## POST /api/recorridos/:token/ubicacion — mismo contrato HTTP, nuevo efecto interno

### Request / Response

Sin cambios:

```
POST /api/recorridos/:token/ubicacion
Content-Type: application/json

{ "lat": -34.6, "lon": -58.4 }
```

- `200 { "ok": true }` — recibido y procesado (con o sin `choferId`
  resoluble; ver abajo).
- `400 { "error": "ubicacion_invalida" }` — falta `lat` o `lon`.
- `404 { "error": "enlace_invalido" }` — token no reconocido.

### Efecto interno (nuevo — antes no llegaba a Central)

Si el token resuelve un recorrido con `choferId` no nulo, el backend
DEBE reflejar esa posición en el mismo lugar que consulta Central (`GET
/api/central/recorridos/activos`), equivalente a como ya lo hace un mensaje
MQTT procesado por `mqttBridge.js`. Si `choferId` es `null` en ese momento,
el reporte se descarta silenciosamente — la respuesta HTTP sigue siendo
`200 { "ok": true }`, no es un error.

Esto aplica **siempre**, sin importar `UBICACION_CANAL_PREFERIDO` — en modo
`"broker"` este endpoint sigue siendo el fallback ante un publish MQTT
fallido, y también debe reflejarse correctamente en Central cuando eso
pasa (antes de esta feature, no lo hacía; era el mismo bug, solo que menos
frecuente por ser un fallback poco ejercitado).

## GET /api/integracion/mqtt/estado — campo nuevo

Ver [mqtt-estado-api.md](./mqtt-estado-api.md) para el contrato completo
actualizado. Resumen del cambio: se agrega `canalPreferido` (mismo valor
resuelto que gobierna `GET /:token`), siempre presente en la respuesta.
