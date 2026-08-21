# Contract: GET /api/integracion/mqtt/estado (nuevo)

## Request

```
GET /api/integracion/mqtt/estado
```

Autenticación: mismo middleware `validarAuthIntegracion` que protege el
resto de `/api/integracion/*` (ver `specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`
para el mecanismo de auth vigente) — sin headers ni credenciales nuevas.

## Response 200 — canal habilitado

```json
{
  "habilitado": true,
  "conectado": true,
  "recibidos": 1284,
  "procesados": 1201,
  "duplicadosDescartados": 80,
  "invalidos": 3,
  "reconexiones": 2,
  "ultimoMensajeEn": "2026-08-21T14:02:11.500-03:00"
}
```

## Response 200 — canal no configurado (dev/test, sin `MQTT_BROKER_URL`)

```json
{ "habilitado": false }
```

En este caso el resto de los campos no aplica y no se incluyen (evita
sugerir actividad "0" cuando en realidad el canal ni siquiera está
configurado — ver spec.md FR-008).

## Semántica de los campos

| Campo | Significado |
|---|---|
| `conectado` | Estado actual del cliente MQTT del backend (no acumulado). |
| `recibidos` | Total de mensajes MQTT recibidos desde que arrancó el proceso (se reinicia en cada deploy/restart, no persiste). |
| `procesados` | De los recibidos, cuántos resultaron en una actualización real (recorrido activo o retención por-chofer). |
| `duplicadosDescartados` | Descartados por el deduplicador de `eventId`. |
| `invalidos` | Payloads que no parsearon como JSON válido. |
| `reconexiones` | Conteo acumulado de eventos `reconnect` del cliente MQTT. |
| `ultimoMensajeEn` | Timestamp (formato `-03:00`, ver `feature-normalizar-formato-horario`) del último mensaje efectivamente procesado; `null` si ninguno todavía. |

## Errores

Mismos códigos que el resto de `/api/integracion/*` ante auth inválida/ausente
(401/403, según lo que ya implemente `validarAuthIntegracion`) — sin cambios
de comportamiento de auth para este endpoint nuevo.
