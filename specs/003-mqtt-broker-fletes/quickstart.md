# Quickstart: Transporte de Ubicación y Acciones vía Bróker MQTT en la Nube

Guía de validación end-to-end de la feature. No incluye código de implementación; asume
que `backend/`, `frontend/` y `central/` ya existen (001/002) y fueron extendidos según
[plan.md](./plan.md).

## Prerrequisitos

- Node.js ≥ 20.12 instalado.
- Una instancia de EMQX Cloud (tier Serverless) ya creada, con:
  - Endpoint MQTT-sobre-TLS (para `backend/`) y endpoint MQTT-sobre-WebSocket/`wss://`
    (para `frontend/` y `central/`).
  - Credenciales de servicio creadas para `backend/` y `central/`, con ACL de SUBSCRIBE
    en `vickytruck/fletes/+/ubicacion` y `vickytruck/fletes/+/eventos` (ver
    [data-model.md](./data-model.md)).
  - Regla de ACL global de PUBLISH con placeholder `${username}` sobre
    `vickytruck/fletes/${username}/#` (research.md §2), y credenciales de administración
    (API key/secret) para que `backend/` pueda aprovisionar/revocar usuarios por token.
  - Variables de entorno nuevas en `backend/` (nombres exactos a definir en tasks.md):
    host/puerto del bróker, credenciales de servicio, credenciales de administración de la
    API de EMQX Cloud.
- Recorrido de prueba ya asignado a un flete (ver quickstart de 002, Escenario 1), con su
  enlace único (token) a mano.

## Levantar el entorno

```bash
# Backend (extendido con el cliente/suscriptor MQTT)
cd backend
npm install
npm start   # levanta Express + conecta el cliente MQTT saliente hacia EMQX Cloud

# Frontend del chofer (en otra terminal)
cd frontend
npm install
npm run dev

# Central (en otra terminal)
cd central
npm install
npm run dev
```

## Escenario de validación 1 — Ubicación sin exponer IP propia (US1)

1. Abrir el enlace único del recorrido de prueba en `frontend/` (chofer).
2. Confirmar en la respuesta de `GET /api/recorridos/:token` (herramientas de red del
   navegador) que incluye el bloque `recorrido.mqtt` con `url`, `username`, `password` y
   los nombres de tópico (ver [contracts/mqtt-canal.md](./contracts/mqtt-canal.md)).
3. Simular una actualización de ubicación (mover el dispositivo o forzar manualmente el
   envío del servicio de geolocalización de prueba).
4. **Resultado esperado**: el mensaje se publica en `vickytruck/fletes/<token>/ubicacion`;
   `backend/` lo recibe por su suscripción MQTT y actualiza `ubicacionEnMemoria.js`;
   `central/`, con el panel abierto sobre ese recorrido, refleja la nueva ubicación sin
   recargar la página.
5. **Verificación de "sin exponer IP propia"**: revisar la configuración de red/firewall
   de la máquina donde corre `backend/` y confirmar que no hay ningún puerto entrante
   abierto específicamente para este flujo (SC-001) — la única conexión relevante es la
   conexión saliente de `backend/` hacia EMQX Cloud.

## Escenario de validación 2 — Registro confiable de "Llegué" y "Descarga completa" (US2)

1. Con conectividad normal, marcar "Llegué" en un punto desde `frontend/`.
2. **Resultado esperado**: el mensaje se publica en `vickytruck/fletes/<token>/eventos`
   con `tipo: "arribo"`; `backend/` lo recibe, persiste el evento en Oracle (misma lógica
   que hoy) y el punto pasa a estado `arribado`.
3. Repetir marcando "Descarga completa" en el mismo punto.
4. Simular pérdida de conectividad del dispositivo del chofer (desconectar la red antes de
   tocar el botón) y luego marcar un evento en otro punto. **Resultado esperado**: la
   acción queda encolada localmente (misma cola offline ya validada en 001) y se publica
   automáticamente al restablecer la conectividad, sin que el chofer deba repetirla.
5. Simular una desconexión temporal de `backend/` hacia el bróker (detener el proceso
   backend brevemente) mientras el flete publica un evento. Al reiniciar `backend/`,
   **resultado esperado**: el evento pendiente se recibe igual gracias a la sesión
   persistente (QoS 1), sin pérdida silenciosa (SC-003).

## Escenario de validación 3 — Aislamiento entre fletes y lectura exclusiva (US3)

1. Con dos recorridos de prueba activos (tokens A y B), intentar conectar un cliente MQTT
   de prueba autenticado con las credenciales del token A y suscribirlo a
   `vickytruck/fletes/<token-B>/#`. **Resultado esperado**: la suscripción es rechazada
   por el bróker (ACL).
2. Intentar conectar un cliente MQTT de prueba con credenciales inventadas (no
   provisionadas) contra el bróker. **Resultado esperado**: la conexión es rechazada
   (autenticación fallida).
3. Confirmar en el dashboard/API de EMQX Cloud que las únicas credenciales con ACL de
   SUBSCRIBE sobre `vickytruck/fletes/+/#` son las de servicio de `backend/` y `central/`.

## Escenario de validación 4 — Revocación de acceso al finalizar el recorrido (Edge case, FR-008)

1. Completar todos los puntos del recorrido de prueba (o reasignarlo a otro flete desde
   Central, ver quickstart de 002, Escenario 4).
2. **Resultado esperado**: `backend/src/mqtt/emqxProvisioning.js` revoca la credencial MQTT
   asociada al token original; un intento posterior de publicar con esas credenciales es
   rechazado por el bróker.
