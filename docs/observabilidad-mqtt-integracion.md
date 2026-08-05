# Tablero de Observabilidad - MQTT e Integracion

## Objetivo

Medir salud del flujo Oracle/APEX -> Cloud y del canal MQTT en tiempo real.

## Métricas clave

- Latencia E2E ubicación MQTT (publish -> render en Central), p50/p95/p99.
- Tasa de error de `/api/integracion/recorridos`.
- Tasa de error de `/api/integracion/estado`.
- Número de reconexiones MQTT por cliente y por intervalo.
- Mensajes MQTT descartados por deduplicación.

## SLO sugeridos

- p95 de ubicación en Central <= 2 segundos.
- Error rate de integración <= 0.5% por ventana de 24h.

## Alertas sugeridas

- p95 de latencia > 2 segundos durante 5 minutos.
- error rate integración > 1% durante 10 minutos.
- bridge backend sin conexión al broker > 2 minutos.
