# Contract: MQTT Topics y Politicas

## Topic principal de ubicación

- Topic: `chofer/{fleteId}/ubicacion`
- Publisher: frontend chofer
- Subscribers:
  - frontend central (directo por WebSocket)
  - backend mqttBridge (persistencia)

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

- Ubicación en vivo: QoS 1 recomendado.
- Retained: deshabilitado para ubicación transitoria.
- Session expiry: habilitada para reconexión corta de clientes.
- ACL: publicar solo en tópico propio del flete autenticado.

## Seguridad

- Transporte: `wss://` obligatorio para navegador.
- Credenciales: tokens de corta vida o credenciales rotables.
- Auditoría: backend registra consumo y errores de parseo.