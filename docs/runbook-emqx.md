# Runbook Operativo - EMQX

## Topics

- Publicación chofer: `chofer/{fleteId}/ubicacion`
- Suscriptores:
  - Frontend Central (WebSocket MQTT)
  - Backend bridge (persistencia)

## QoS y sesiones

- Ubicación: QoS 1
- Mensajes retained: deshabilitados para ubicación transitoria
- Session expiry habilitada para reconexión corta

## ACL recomendadas

- Chofer solo publica en su tópico de flete.
- Central solo subscribe en `chofer/+/ubicacion`.
- Backend bridge subscribe en `chofer/+/ubicacion`.

## Rotación de credenciales

- Mantener credenciales por rol (chofer, central, backend).
- Rotación programada y revocación inmediata ante exposición.

## Alarmas mínimas

- Caída de conexiones del bridge backend.
- Aumento de desconexiones/reconexiones por encima de umbral.
- Incremento de mensajes rechazados por ACL.
