# Quickstart: validar Ubicación en vivo ligada al chofer

## Prerrequisitos

- Backend corriendo localmente (`cd backend && npm run start`, o el dev
  server vía `preview_start`), con `.env` incluyendo al menos
  `EMQX_WSS_URL`, `EMQX_TOKEN_PASSWORD_SECRET` y `MQTT_BROKER_URL` (backend)
  apuntando a un broker de prueba — o correr sin ellos para validar el modo
  degradado (`mqtt: null`, `habilitado: false`).
- Frontend corriendo localmente (`cd frontend && npm run dev`).
- Un recorrido de prueba cargado en el store (vía `POST
  /api/integracion/recorridos` con `choferId` seteado, o `npm run dev:seed`
  si el seed ya incluye `choferId`).
- Tests automatizados: `cd backend && npm test`, `cd frontend && npm test`.

## Escenario 1 — Historia de Usuario 1 (disparo inmediato al abrir)

1. Abrir `http://localhost:5173/?token=<token-de-prueba>` en el navegador
   (Browser pane).
2. Sin tocar ningún botón, verificar en Network (o en los logs del backend)
   que se dispara un intento de publish MQTT (o el fallback HTTP a
   `/ubicacion`) **inmediatamente al cargar**, sin esperar el intervalo
   (`intervaloUbicacionMs`, default 60000ms).
3. Confirmar en `GET /api/central/recorridos/activos` (o el panel de
   Central) que `ultimaUbicacion.reciente` es `true` en segundos, no en un
   minuto.

**Resultado esperado**: coincide con spec.md SC-001.

## Escenario 2 — Historia de Usuario 2 (resiliencia ante 404)

1. Cargar el recorrido de prueba una vez con éxito (para poblar
   `choferCache.js` en `localStorage`).
2. Simular la pérdida del store del backend: reiniciar el proceso backend
   sin volver a cargar el recorrido (o borrar la entrada del store si hay un
   endpoint de test para eso).
3. Recargar la misma URL del chofer — debería verse el error de "enlace
   inválido" en pantalla.
4. Verificar igualmente (Network / logs) que el dispositivo sigue
   intentando publicar ubicación, usando `choferId`/`mqtt` leídos de
   `localStorage` en vez de la respuesta (fallida) de `GET /:token`.

**Resultado esperado**: coincide con spec.md SC-002. Nota: si el
`choferId` cacheado corresponde a un recorrido que en ese momento no está
`activo` en el store (recién reiniciado), el backend debe retener esa
ubicación en `ultimaUbicacionPorChofer` (no descartarla) — no hay forma de
observar esto por HTTP todavía (sin panel), pero se puede inspeccionar
agregando un log temporal o un test unitario (ver Escenario 4).

## Escenario 3 — Historia de Usuario 3 (métricas)

1. Con el backend corriendo y `MQTT_BROKER_URL` configurado, generar
   tráfico (repetir el Escenario 1 un par de veces).
2. `curl` (o Postman) a `GET /api/integracion/mqtt/estado` con el header de
   auth de integración vigente.
3. Confirmar que `recibidos`/`procesados` suben y `ultimoMensajeEn` refleja
   la hora reciente.
4. Repetir sin `MQTT_BROKER_URL` configurado y confirmar `{ "habilitado":
   false }`.

**Resultado esperado**: coincide con spec.md SC-003, ver contrato
`contracts/mqtt-estado-api.md`.

## Escenario 4 — cobertura automatizada

- `cd backend && npm test` — debe incluir (tras la implementación):
  `backend/tests/unit/integracion-store-central.test.js` actualizado a
  `choferId`/`actualizarUbicacionPorChofer`, y el nuevo
  `backend/tests/unit/mqttBridge.test.js`.
- `cd frontend && npm test` — debe incluir
  `frontend/tests/services/ubicacionPeriodica.test.js` actualizado (disparo
  inmediato al montar) y cualquier test nuevo de `choferCache.js`.

## Rollback

Si algo sale mal, este feature es puramente aditivo/de reruteo — revertir el
branch `012-ubicacion-por-chofer` restaura el ruteo por-`fleteId` sin tocar
credenciales ni datos de Oracle (la credencial MQTT del chofer no cambia,
solo el topic al que se publica).
