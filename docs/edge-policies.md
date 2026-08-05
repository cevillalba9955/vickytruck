# Edge Policies - Integracion Cloud

Este documento fija una baseline de seguridad de borde para exponer `backend`.

## TLS

- Forzar HTTPS en todos los endpoints públicos.
- Rechazar TLS obsoleto y habilitar rotación automática de certificados.

## WAF

- Activar reglas administradas para OWASP Top 10.
- Bloquear payloads malformados y patrones de abuso frecuentes.

## Rate Limiting

- Endpoints de integración (`/api/integracion/*`): límites estrictos por IP y por credencial técnica.
- Endpoints de lectura de panel: límites moderados para evitar scraping masivo.

## Autenticación técnica

- Exigir `x-api-key` o bearer token rotables para `/api/integracion/*`.
- Rotación trimestral o inmediata ante incidente.

## Observabilidad

- Registrar métricas 2xx/4xx/5xx por ruta.
- Alertar picos de 401/403 y de respuestas 429.
