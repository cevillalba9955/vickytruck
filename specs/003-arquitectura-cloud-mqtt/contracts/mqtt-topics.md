# Contract: MQTT Topics y Politicas

## Convención de versionado

- Namespace obligatorio: `v1/...`
- Regla de evolución: cambios incompatibles publican en `v2/...` sin romper consumidores de `v1/...`.

## Topic principal de ubicación

- Topic: `v1/chofer/{fleteId}/ubicacion`
- Publisher: frontend chofer
- Subscribers:
  - frontend central (directo por WebSocket)
  - backend mqttBridge (persistencia)

## Topics adicionales por tipo de evento

- Estado de punto (arribo/descarga): `v1/recorrido/{recorridoId}/estado`
- Control operativo (alertas/heartbeats): `v1/sistema/{tenantId}/control`

## Payload sugerido

```json
{
  "eventId": "8e6f2e72-9eb5-4b68-a9ba-a6c4d27a3f47",
  "fleteId": "F-12",
  "recorridoId": "R-1001",
  "lat": -34.6037,
  "lon": -58.3816,
  "en": "2026-08-05T13:35:20Z",
  "accuracy": 15
}
```

## QoS y sesiones

| Tipo de evento | Topic | QoS | Retained | Session expiry | Orden/Idempotencia |
|---|---|---|---|---|---|
| Ubicación en vivo | `v1/chofer/{fleteId}/ubicacion` | 1 | No | Corta (cliente browser) | `eventId` + `en` |
| Estado de punto | `v1/recorrido/{recorridoId}/estado` | 1 | Si (último estado) | Media | `eventId` único |
| Control operativo | `v1/sistema/{tenantId}/control` | 0 o 1 según criticidad | No | Corta | timestamp + tipo |

- ACL: publicar solo en tópico autorizado para la identidad técnica.

## Seguridad

- Transporte: `wss://` obligatorio para navegador.
- Credenciales: tokens de corta vida o credenciales rotables.
- Auditoría: backend registra consumo y errores de parseo.