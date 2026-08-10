# Quickstart: validar App Chofer — Información de Recorrido y Estados de Viaje Guiados

Guía de validación manual end-to-end. Asume el backend corriendo localmente
con el store en memoria (sin Oracle real) y el frontend del chofer apuntando
a él — mismo setup que ya usan 001/003 (`backend/.env`, `frontend/.env`).

## Prerrequisitos

```bash
cd backend && npm install && npm test
cd ../frontend && npm install && npm test
```

Levantar backend y frontend (dos terminales):

```bash
cd backend && npm run dev
cd frontend && npm run dev
```

## Preparar un recorrido de prueba

Simular el push de Oracle (`sincronizar_recorrido`) con datos completos,
incluyendo los campos nuevos y varios `remitoIds` por punto — usar el
`x-api-key` de `backend/.env` (`INTEGRACION_API_KEY`):

```bash
curl -X POST http://localhost:3000/api/integracion/recorridos \
  -H "Content-Type: application/json" \
  -H "x-api-key: $INTEGRACION_API_KEY" \
  -d '{
    "source": "oracle-apex",
    "recorridos": [{
      "id": "R-QS-1",
      "token": "qs-token-1",
      "fleteId": "F-QS-1",
      "fleteNombre": "Chofer de Prueba",
      "estado": "activo",
      "puntos": [
        { "id": "p1", "orden": 1, "estado": "pendiente", "lat": -34.60, "lon": -58.38, "cliente": "Cliente A", "direccion": "Calle Falsa 123", "rangoHorario": "09:00–12:00", "notasEntrega": "Tocar timbre", "remitoIds": ["R-1", "R-2"] },
        { "id": "p2", "orden": 2, "estado": "pendiente", "lat": -34.61, "lon": -58.39, "cliente": "Cliente B", "direccion": "Av. Siempreviva 742", "remitoIds": [] },
        { "id": "p3", "orden": 3, "estado": "pendiente", "lat": -34.62, "lon": -58.40, "cliente": "Cliente C", "direccion": "Ruta 8 km 45" }
      ],
      "updatedAt": "2026-08-07T12:00:00Z"
    }]
  }'
```

Abrir en el navegador: `http://localhost:5173/?token=qs-token-1` (puerto de
Vite puede variar).

## Escenario 1 — Historia 1: información visible, remito oculto

1. Verificar que cada punto muestra cliente, dirección, rango horario y
   notas de entrega cuando están presentes (p1), y que omite con
   normalidad los campos ausentes (p2 sin rango horario/notas, p3 sin
   remitos).
2. Inspeccionar la respuesta de red de `GET /api/recorridos/qs-token-1`
   (DevTools → Network) y confirmar que **ningún** campo `remito`/
   `remitoIds` aparece en el JSON — no solo que la UI no lo muestre.

## Escenario 2 — Historia 2: ciclo guiado completo

1. Estado inicial: `Detenido`, lista de 3 pendientes, p1 (primero) con
   INICIAR, p2/p3 con IR PRIMERO.
2. Tocar INICIAR en p1 → pasa a `Manejando`; solo p1 muestra LLEGUE; p2/p3
   aparecen desactivados y reducidos.
3. Tocar LLEGUE → pasa a `Descargando`; verificar en el backend
   (`GET /api/integracion/estado?recorridoId=R-QS-1` con las credenciales de
   integración) que `p1.arriboEn` quedó seteado.
4. Tocar DESCARGA COMPLETA → vuelve a `Detenido`; `p1` queda `completado`;
   la lista de pendientes ahora muestra p2 primero (con INICIAR) y p3 con
   IR PRIMERO.

## Escenario 3 — Historia 3: IR PRIMERO

1. En `Detenido` con p2, p3 pendientes, tocar IR PRIMERO sobre p3.
2. Verificar que p3 pasa a mostrarse primero (con INICIAR) y p2 queda
   detrás (con IR PRIMERO).
3. Llamar `GET /api/integracion/estado?recorridoId=R-QS-1` y confirmar que
   `orden` de p3 es menor que el de p2 (el nuevo contrato extendido,
   `contracts/sincronizacion-oracle-central.md`).
4. Re-enviar el mismo `POST /api/integracion/recorridos` original (con el
   orden viejo, p1/p2/p3) **antes** de haber vuelto a leer `GET /estado`, y
   confirmar que el orden de p3/p2 fijado por IR PRIMERO **no se pisa**
   (research.md, Decisión 4) — recién se pisaría en un push posterior a que
   `GET /estado` haya sido leído una vez.

## Escenario 4 — Historia 4: CANCELAR

1. Con p2 pendiente en `Detenido`, tocar INICIAR → `Manejando`.
2. Sin llamar a `GET /api/integracion/estado` todavía, tocar CANCELAR →
   debe volver a `Detenido` con p2 nuevamente como primer pendiente (sin
   evento de arribo registrado).
3. Repetir: INICIAR → LLEGUE (queda `Descargando`) → llamar
   `GET /api/integracion/estado?recorridoId=R-QS-1` (simula el poll de
   Oracle) → intentar CANCELAR → debe devolver `409 nada_para_cancelar`
   (ya "sincronizado").

## Escenario 5 — Historia 5: FINALIZAR

1. Completar el ciclo INICIAR→LLEGUE→DESCARGA COMPLETA para todos los
   puntos restantes.
2. Verificar que en `Detenido`, sin pendientes, aparece el botón FINALIZAR
   en lugar de la lista.
3. Tocar FINALIZAR → confirmación visible de recorrido finalizado.

## Escenario 6 — Central ve el estado de viaje

1. Con el recorrido en `Manejando` sobre algún punto, abrir Central
   (`central/`, `npm run dev`) y verificar en la vista de monitoreo que
   aparece el `viajeEstado`/punto activo del flete `F-QS-1` (refleja el
   polling de 5s existente, sin recargar manualmente).

## Automatizado

```bash
cd backend && npm test    # contract/unit/integration nuevos y existentes
cd frontend && npm test   # componentes RouteView/DeliveryPointCard actualizados
cd central && npm test    # si se agrega columna/badge de viajeEstado
```
