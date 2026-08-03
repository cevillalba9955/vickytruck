# Quickstart: App Chofer — Recepción y Ejecución de Recorrido de Entregas

Guía de validación end-to-end de la feature. No incluye código de implementación; asume
que `backend/` y `frontend/` (ver Project Structure en plan.md) ya existen.

## Prerrequisitos

- Node.js ≥ 20.12 instalado.
- Acceso a una instancia Oracle con las tablas de recorrido/punto/token ya precargadas
  (a cargo de la feature de Central) o, para desarrollo local, un recorrido de prueba
  insertado manualmente con un token conocido.
- Variables de entorno del backend configuradas (cadena de conexión Oracle vía
  `oracledb`): `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING`.

## Levantar el entorno

```bash
# Backend
cd backend
npm install
npm start   # levanta el servidor node:http en el puerto configurado

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev   # servidor de desarrollo Vite
```

## Escenario de validación 1 — Ver el recorrido asignado (US1)

1. Insertar/confirmar un recorrido de prueba en Oracle con 5 puntos y un token conocido,
   por ejemplo `demo-token-123`.
2. Abrir en el navegador móvil (o emulación mobile del navegador de escritorio):
   `http://localhost:<puerto-frontend>/?token=demo-token-123` (o la ruta que use el
   frontend para leer el token).
3. **Resultado esperado**: se ven los 5 puntos en el orden correcto, cada uno con su
   posición ("1 de 5", etc.) y ubicación, sin pedir usuario/contraseña (SC-001).
4. Repetir con un token inexistente y confirmar que se muestra un mensaje de enlace
   inválido sin exponer datos de otros recorridos (FR-012).

## Escenario de validación 2 — Marcar arribo y descarga (US2 + US3)

1. Sobre el recorrido de prueba, tocar "Llegué" en cualquier punto que no sea el primero
   de la lista.
2. **Resultado esperado**: ese punto pasa a "arribado" con marca de tiempo; los demás
   puntos no cambian (marcado libre, no secuencial).
3. Tocar "Descarga completa" en ese mismo punto.
4. **Resultado esperado**: el punto pasa a "completado".
5. Intentar tocar "Descarga completa" en un punto todavía "pendiente" (sin arribo previo):
   la acción debe estar deshabilitada/no ofrecida en la UI (FR-007).
6. Marcar todos los puntos como "completado" y confirmar que aparece la confirmación de
   recorrido finalizado (FR-009).

## Escenario de validación 3 — Progreso general (US4)

1. Con el recorrido en un estado mixto (algunos completados, uno arribado, el resto
   pendientes), confirmar que el resumen numérico de progreso coincide con los conteos
   reales.

## Escenario de validación 4 — Offline y reintento (Edge case, FR-010)

1. Con las herramientas de desarrollador del navegador, simular "Offline".
2. Marcar un evento (arribo o descarga) sobre un punto.
3. **Resultado esperado**: la UI no bloquea la acción; el evento queda encolado
   localmente.
4. Volver a "Online".
5. **Resultado esperado**: el evento encolado se envía automáticamente y el estado del
   punto se actualiza en el servidor, sin duplicarse ni perderse.

## Escenario de validación 5 — Sin GPS disponible (Edge case, FR-006)

1. Denegar el permiso de geolocalización en el navegador.
2. Marcar un evento.
3. **Resultado esperado**: el evento se registra igual (con timestamp), sin ubicación
   GPS asociada, y sin bloquear ni mostrar un error bloqueante al chofer.
