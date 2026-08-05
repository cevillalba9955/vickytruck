# Quickstart: Validacion Arquitectura Cloud + MQTT

## 1. Publicar recorridos desde Oracle/APEX local

1. Ejecutar script local (SQLcl/APEX job) contra `POST /api/integracion/recorridos`.
2. Verificar respuesta HTTP 200/202.
3. Confirmar en backend cloud que el recorrido existe en store operacional.

## 2. Consultar estado desde Oracle/APEX local

1. Invocar `GET /api/integracion/estado?recorridoId=<id>`.
2. Verificar estado de puntos y timestamps de arribo/descarga.

## 3. Flujo MQTT tiempo real

1. Conectar chofer y publicar en `chofer/{fleteId}/ubicacion`.
2. Confirmar que Central recibe actualización directa por WebSocket MQTT.
3. Confirmar que backend bridge también recibe y persiste evento.

## 4. Reconexión y fallback

1. Cortar conexión MQTT en Central por 30 s.
2. Verificar reconexión automática.
3. Verificar reconciliación por polling REST para estado/progreso.

## 5. Seguridad de borde

1. Confirmar TLS válido y WAF habilitado en edge (Cloudflare sugerido).
2. Confirmar que endpoints de integración exigen credenciales técnicas rotables.