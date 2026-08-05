# Runbook Operativo - Cloudflare

## Publicación de APIs

- Publicar backend detrás de Cloudflare con TLS estricto.
- Forzar HTTPS y HSTS para dominios productivos.

## WAF

- Activar reglas administradas.
- Definir excepciones por ruta solo cuando esté justificado y documentado.

## Rate Limits

- Regla específica para `/api/integracion/*`.
- Regla general para endpoints públicos de lectura.

## Access / Zero Trust

- Limitar herramientas administrativas y paneles internos.
- Aplicar políticas por identidad y origen cuando corresponda.

## Alertas

- Alertar spikes de 4xx/5xx.
- Alertar bloqueos WAF anómalos sobre rutas críticas de integración.
