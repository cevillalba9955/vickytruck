# Quickstart: Validación de Entrega de Recorrido y Token de Bróker vía Cloud

Guía de validación manual end-to-end de las tres historias de usuario de `spec.md`. Asume que
`003-mqtt-broker-fletes` (bróker EMQX Cloud) y `001-chofer-recorrido`/`002-panel-control-central`
ya están implementados y configurados (variables `EMQX_*`, conexión Oracle).

## Prerrequisitos

- Backend corriendo localmente (`cd backend && npm start`), **sin** exponer su puerto a
  internet ni tener IP pública — justamente lo que esta funcionalidad no debe requerir.
- `CHOFER_FRONTEND_URL` configurado en el entorno del backend (ej.
  `http://localhost:5173` en desarrollo, o la URL real de Cloudflare Pages en producción).
- Frontend desplegado por separado del backend:
  - **Desarrollo**: `cd frontend && npm run dev` (Vite, puerto propio, sin proxy hacia
    `backend/`).
  - **Producción**: `cd frontend && npm run build && npx wrangler pages deploy dist` (o
    equivalente), en un host que **no tenga ruta de red hacia el backend local** — para probar
    de verdad el objetivo de la feature, usar un dispositivo fuera de la red donde corre el
    backend (ej. datos móviles) al validar el enlace.
- Central corriendo (`cd central && npm run dev`) contra el mismo backend.

## Escenario 1 — Abrir el recorrido sin depender de la red local (US1)

1. Desde Central, asignar un recorrido de prueba (≤10 puntos) a un flete.
2. Copiar el `enlace` devuelto (ver [contracts/central-asignacion.md](./contracts/central-asignacion.md)) — verificar que es una URL completa con un fragmento largo después de `#/r/`, no un token corto.
3. Abrir ese enlace desde un dispositivo fuera de la red del backend (ej. celular con datos
   móviles apuntando al frontend desplegado).
4. **Esperado**: el recorrido completo se ve en <5s (SC-001), sin pantalla de carga de red
   prolongada.
5. Con las herramientas de red del navegador (o `read_network_requests` en un entorno de
   pruebas), confirmar que **ninguna** petición tiene como destino el host/IP del backend local
   (SC-002) — solo debe verse la carga inicial de assets del frontend (Cloudflare) y, luego,
   una conexión WebSocket hacia el host del bróker EMQX Cloud.
6. Recargar la página con el mismo enlace: el recorrido se ve igual (acceptance scenario 3).

## Escenario 2 — Publicar ubicación y acciones solo contra el bróker (US2)

1. Con el recorrido cargado (Escenario 1), marcar "Llegué" en un punto.
2. **Esperado**: el evento llega al backend (verificar en su log o en Central, que debería
   reflejar el punto como "arribado" en pocos segundos) — sin que el dispositivo del chofer haya
   hecho ninguna petición HTTP al backend.
3. Esperar al menos un ciclo de reporte de ubicación (`intervaloUbicacionMs`, por defecto 60s) y
   confirmar en Central que la última ubicación conocida del flete se actualiza.
4. Desde Central, finalizar o revocar ese recorrido. Intentar marcar "Descarga completa" desde
   la app del chofer que sigue abierta.
5. **Esperado**: el bróker rechaza la publicación (credencial revocada) y la app lo indica
   claramente al chofer (acceptance scenario 3 de US2).

## Escenario 3 — Enlace generado desde Central sin pasos manuales (US3)

1. Asignar un recorrido nuevo desde Central y confirmar que se obtiene un único `enlace` listo
   para copiar (sin pasos adicionales de configuración de red o credenciales).
2. Volver a pedir el enlace del mismo recorrido (sin reasignar) antes de que finalice.
3. **Esperado**: se obtiene exactamente el mismo `enlace` (idempotencia, ver research.md §4).

## Verificación del vínculo a primer dispositivo (FR-005a)

1. Abrir el enlace del Escenario 1 en un segundo dispositivo/navegador distinto (o el mismo
   navegador en una ventana de incógnito, para forzar un `deviceId`/`clientId` distinto).
2. **Esperado**: el recorrido se ve igual (la visualización no está restringida), pero al
   intentar marcar "Llegué"/"Descarga completa" o al conectar para reportar ubicación, la
   conexión al bróker se cae poco después de establecerse (kick reactivo, ver
   [contracts/vinculo-dispositivo.md](./contracts/vinculo-dispositivo.md)) y la app lo indica
   como error de conexión.
3. Confirmar en el log del backend que se registró el intento de conexión con un `clientId`
   distinto al vinculado, y la llamada de expulsión correspondiente.

## Edge cases a probar puntualmente

- Abrir el enlace sin conectividad a internet: el recorrido debe mostrarse igual (payload local,
  ver contracts/enlace-recorrido.md), solo la publicación debe fallar visiblemente.
- Abrir la URL raíz del frontend sin fragmento `#/r/...`: debe mostrar el mensaje de enlace
  inválido, sin exponer datos de otros recorridos.
- Simular el bróker caído (cortar red hacia EMQX Cloud) durante el uso: la app debe informar que
  no puede publicar y permitir reintentar sin perder el recorrido ya visible.
