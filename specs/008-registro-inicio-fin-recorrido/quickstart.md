# Quickstart: validar registro de inicio/cierre de recorrido con regreso a base

Guía de validación manual end-to-end. Asume el backend corriendo localmente
con el store en memoria (sin Oracle real) y el frontend del chofer y de
Central apuntando a él — mismo setup que 001/005.

## Prerrequisitos

```bash
cd backend && npm install && npm test
cd ../frontend && npm install && npm test
cd ../central && npm install && npm test
```

Levantar backend, frontend y central (tres terminales):

```bash
cd backend && npm run dev
cd frontend && npm run dev
cd central && npm run dev
```

## Preparar un recorrido de prueba

Simular el push de Oracle con 2 puntos pendientes, usando el `x-api-key` de
`backend/.env` (`INTEGRACION_API_KEY`):

```bash
curl -X POST http://localhost:3000/api/integracion/recorridos \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTEGRACION_API_KEY" \
  -d '{
    "source": "oracle-apex",
    "recorridos": [{
      "id": "R-QS-8",
      "token": "qs-token-8",
      "fleteId": "F-QS-8",
      "fleteNombre": "Chofer de Prueba",
      "estado": "activo",
      "puntos": [
        { "id": "p1", "orden": 1, "estado": "pendiente", "lat": -34.60, "lon": -58.38 },
        { "id": "p2", "orden": 2, "estado": "pendiente", "lat": -34.61, "lon": -58.39 }
      ],
      "updatedAt": "2026-08-13T12:00:00Z"
    }]
  }'
```

Abrir en el navegador: `http://localhost:5173/?token=qs-token-8` (puerto de
Vite puede variar).

## Escenario 1 — INICIAR registra hora y ubicación (US1)

1. En `Detenido` con p1/p2 pendientes, tocar INICIAR sobre p1 (aceptar el
   permiso de ubicación del navegador si se pide).
2. Verificar en la respuesta de red de `POST /viaje/iniciar` (DevTools →
   Network) que devuelve `200 OK` con `viajeEstado: "manejando"`.
3. Consultar `GET http://localhost:3000/api/recorridos/qs-token-8` y
   confirmar que `puntos[0].inicioEn` (el punto p1) quedó seteado con una
   fecha/hora reciente.
4. Repetir denegando el permiso de ubicación del navegador (o simulando GPS
   no disponible): confirmar que INICIAR igual se aplica y `inicioEn` queda
   registrado (sin bloquear la acción).

## Escenario 2 — El recorrido ya no finaliza automáticamente (US2)

1. Completar el ciclo INICIAR → LLEGUE → DESCARGA COMPLETA para p1, y luego
   para p2 (el último punto pendiente).
2. Tras la descarga completa de p2, consultar
   `GET http://localhost:3000/api/recorridos/qs-token-8` y verificar que
   `recorrido.estado` sigue siendo `"activo"` (no `"finalizado"`), aunque
   `progreso.completados === 2` y ya no queden pendientes.
3. Verificar en la UI del chofer que aparece el botón FINALIZAR (igual que
   antes), pero que el recorrido **no** se muestra como cerrado hasta
   tocarlo.

## Escenario 3 — FINALIZAR registra el cierre y el tiempo de regreso a base (US2)

1. Con el estado del Escenario 2 (todos los puntos completados, recorrido
   todavía `activo`), tocar FINALIZAR en la UI del chofer.
2. Verificar que `POST /viaje/finalizar` devuelve `200 OK` con
   `estado: "finalizado"` y un `cierreEn` reciente.
3. Consultar de nuevo `GET .../qs-token-8` y confirmar que
   `recorrido.estado === "finalizado"`.
4. Calcular manualmente la diferencia entre `puntos[1].descargaEn` (último
   punto) y `recorrido.cierreEn` — debe ser un intervalo positivo,
   representando el tiempo de regreso a base.
5. Volver a tocar FINALIZAR (o reenviar el mismo `POST /viaje/finalizar`)
   y confirmar que sigue devolviendo `200 OK` con el **mismo** `cierreEn`
   (idempotente, no lo pisa).

## Escenario 4 — Central ve el cierre y el intervalo de regreso a base

1. Antes de tocar FINALIZAR (estado del Escenario 2), abrir Central
   (`central/`, ya corriendo) y verificar en la vista de monitoreo que el
   recorrido `R-QS-8` aparece con una señal de "esperando finalizar"
   (`esperandoFinalizar: true` en `GET /api/central/recorridos/activos`).
2. Tocar FINALIZAR desde el chofer.
3. En Central, abrir el historial (`GET /api/central/recorridos/historial`
   o la vista correspondiente) y verificar que `R-QS-8` aparece con su
   `cierreEn`, y que el detalle de cada punto incluye `inicioEn`.

## Escenario 5 — Central ve las coordenadas de inicio y cierre (User Story 3, 2026-08-25)

1. Con el recorrido `R-QS-8` ya finalizado (Escenario 3), consultar
   `GET http://localhost:3000/api/central/recorridos/R-QS-8` (o el id que
   corresponda) y confirmar que `recorrido.cierreLat`/`recorrido.cierreLon`
   están presentes (no `undefined`), con el mismo valor enviado al tocar
   FINALIZAR en el Escenario 3.
2. En la misma respuesta, confirmar que cada punto dentro de `puntos`
   incluye `inicioLat`/`inicioLon`, con el valor enviado al tocar INICIAR
   en el Escenario 1.
3. Repetir contra `GET http://localhost:3000/api/central/recorridos/historial`
   y confirmar que `R-QS-8` también trae `cierreLat`/`cierreLon` en ese
   listado (no solo en el detalle puntual).
4. Repetir el flujo completo (Escenarios 1-3) pero denegando el permiso de
   ubicación del navegador en INICIAR y en FINALIZAR: confirmar que
   `inicioLat`/`inicioLon`/`cierreLat`/`cierreLon` quedan en `null` (no
   bloquean nada, FR-013) mientras que `inicioEn`/`cierreEn` sí quedan
   registrados.
5. En la UI de Central (`central/`), abrir el detalle de `R-QS-8` y
   confirmar visualmente que los campos "Hora inicio" y "Final" muestran
   un indicador (tooltip/ícono) con las coordenadas cuando existen, y que
   no lo muestran (o indican "sin ubicación") cuando el paso 4 las dejó en
   `null`.
6. Antes de tocar FINALIZAR (con el recorrido todavía `activo`), consultar
   `GET /api/central/recorridos/activos` y confirmar que `puntos[].inicioLat`/
   `inicioLon` **sí** aparecen ahí también (mismo `serializarPuntosCentral`
   que historial/detalle — no es una omisión, ver data-model.md § Nota de
   corrección), mientras que `recorrido.cierreLat`/`cierreLon` siguen
   ausentes a nivel de recorrido (un recorrido activo no tiene cierre).

## Escenario 6 — Oracle/APEX lee inicio/cierre a través del mecanismo existente (User Story 4, 2026-08-25)

Requiere una instancia Oracle real con `INTEGRACION_CLOUD_API` instalado
(ver `backend/sql/integracion-cloud/README.md`) — sección **no probada
todavía contra Oracle real**, confirmar antes de dar esto por cerrado.

1. Con `R-QS-8` en el mismo estado del Escenario 3 (INICIAR sobre p1 y p2,
   FINALIZAR ya tocado, todos con ubicación GPS), consultar directamente
   `GET http://localhost:3000/api/integracion/estado?recorridoId=R-QS-8`
   (con el header `x-api-key` correspondiente) y confirmar que:
   - `recorridos[0].inicioEn`/`inicioLat`/`inicioLon` (a nivel `recorrido`,
     no dentro de `puntos`) coinciden con el evento de inicio de **p1** (el
     primer punto en iniciarse), no con el de p2.
   - `recorridos[0].cierreEn`/`cierreLat`/`cierreLon` coinciden con el
     evento de FINALIZAR.
   - `recorridos[0].puntos[0].inicioEn`/`inicioLat`/`inicioLon` (por punto)
     siguen presentes, igual que antes.
2. Desde Oracle/APEX (o `sqlplus`/SQL Developer contra la instancia real),
   correr `INTEGRACION_CLOUD_API.leer_estado_puntos(p_recorrido_id => <id
   real de R-QS-8 en Oracle>, ...)` (ver bloque "Probar" del README de
   `backend/sql/integracion-cloud/`) y confirmar:
   - `T_PUNTOS_ENTREGA.INICIO_EN/INICIO_LAT/INICIO_LON` quedan seteados por
     punto.
   - `T_RECORRIDOS.CIERRE_EN/CIERRE_LAT/CIERRE_LON` quedan seteados.
   - `T_RECORRIDOS.INICIO_EN/INICIO_LAT/INICIO_LON` quedan seteados con la
     hora/ubicación de **p1** (el primero en iniciarse), no la de p2.
3. Repetir el paso 2 varias veces (reintento) y confirmar que los valores
   no cambian entre corridas (mismo criterio idempotente que ya rige para
   arribo/descarga/cierre — el cloud sigue siendo la fuente de verdad,
   pisa sin comparar versiones, pero el valor en sí no cambia si el cloud
   no cambió).

## Automatizado

```bash
cd backend && npm test    # unit/contract/integration nuevos y existentes
cd frontend && npm test   # RouteView/DeliveryPointCard/main.jsx actualizados
cd central && npm test    # RecorridoDetalle/HistorialView/MonitorView actualizados
```
