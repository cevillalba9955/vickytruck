# Quickstart: Validacion Arquitectura Cloud + MQTT

## 1. Publicar recorridos desde Oracle/APEX local

1. Ejecutar script local (SQLcl/APEX job) contra `POST /api/integracion/recorridos`.
2. Verificar respuesta HTTP 200/202.
3. Confirmar en backend cloud que el recorrido existe en store operacional.

## 2. Consultar estado desde Oracle/APEX local

1. Invocar `GET /api/integracion/estado?recorridoId=<id>`.
2. Verificar estado de puntos y timestamps de arribo/descarga.

## 3. Flujo MQTT tiempo real

1. Conectar chofer y publicar en `chofer/{fleteId}/ubicacion` usando la
   credencial permanente `chofer-{choferId}` (ver `contracts/mqtt-topics.md`,
   modelo vigente 2026-08-10).
2. Confirmar que Central recibe actualización directa por WebSocket MQTT
   (requiere `VITE_MQTT_*` configurado en `central/.env.production` — ver
   paso 5).
3. Confirmar que backend bridge también recibe y persiste evento.
4. Repetir el flujo con un **segundo recorrido del mismo chofer** (mismo
   `choferId`, nuevo `fleteId`) y confirmar que `GET /api/recorridos/:token`
   devuelve la **misma** credencial (`chofer-{choferId}`) sin
   reaprovisionamiento — valida la persistencia entre recorridos.

## 4. Reconexión y fallback

1. Cortar conexión MQTT en Central por 30 s.
2. Verificar reconexión automática.
3. Verificar reconciliación por polling REST para estado/progreso.
4. Simular fallo de publicación MQTT en el chofer (ej. cortar red del
   broker) y confirmar que el reporte cae al fallback REST
   (`POST /:token/ubicacion`) — sin bloquear la UI, ver `spec.md` FR-004.

## 5. Activación de suscripción MQTT de Central

1. Configurar `VITE_MQTT_BROKER_URL`/`USERNAME`/`PASSWORD` en
   `central/.env.production` con la credencial de servicio de solo-lectura.
2. Desplegar Central y confirmar en consola del navegador que el cliente
   MQTT conecta (`central/src/services/mqttClient.js`).
3. Publicar ubicación desde un chofer y confirmar que Central la refleja
   sin esperar el ciclo de polling (latencia visualmente menor a SC-002).

## 6. Seguridad de borde

1. Confirmar TLS válido y WAF habilitado en edge (Cloudflare sugerido).
2. Confirmar que endpoints de integración exigen credenciales técnicas rotables.