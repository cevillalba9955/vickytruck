# Convenciones de Despliegue Cloud

## Objetivo

Cubrir FR-001 con una guía operativa mínima para desplegar `backend/`, `frontend/` y `central/` en cloud sin conectividad saliente cloud -> Oracle local.

## Topología objetivo

- `backend/`: servicio HTTP público/privado en cloud (contenedor).
- `frontend/`: app chofer publicada como artefacto estático.
- `central/`: app Central publicada como artefacto estático.
- `broker MQTT`: servicio gestionado en cloud con WebSocket seguro (`wss://`).
- `Oracle/APEX local`: integra por HTTPS hacia `backend`, nunca a la inversa.

## Reglas no negociables

- No habilitar túneles directos `backend cloud -> Oracle local`.
- Exponer `/api/integracion/*` con autenticación técnica (API key o bearer).
- Forzar TLS en todos los endpoints públicos.

## Variables de entorno mínimas

### Backend

- `INTEGRACION_API_KEY` o `INTEGRACION_BEARER_TOKEN`
- `MQTT_BROKER_URL`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_TOPIC_UBICACION`

### Central

- `VITE_MQTT_BROKER_URL`
- `VITE_MQTT_USERNAME`
- `VITE_MQTT_PASSWORD`

## Flujo de release sugerido

1. Build backend y publicar imagen.
2. Build `frontend/` y publicar estáticos.
3. Build `central/` y publicar estáticos.
4. Configurar variables de entorno por ambiente.
5. Ejecutar validaciones de `quickstart.md`.

## Verificación post-despliegue

- `POST /api/integracion/recorridos` responde 200 con credenciales válidas.
- `GET /api/integracion/estado` responde 200/404 según recorrido.
- Central muestra estado MQTT conectado y recibe ubicación en vivo.
