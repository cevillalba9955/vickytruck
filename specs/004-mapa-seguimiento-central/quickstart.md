# Quickstart: Central — Mapa de Seguimiento de Fletes

## Prerrequisitos

- Backend corriendo localmente (`cd backend && npm run dev`, ver
  `docs/deploy-cloud.md` para variables de entorno mínimas).
- Central corriendo localmente (`cd central && npm run dev`), apuntando al
  backend local (proxy de `vite.config.js`).
- Al menos un recorrido activo cargado en el store cloud, con `fleteId`
  asignado (usar el helper/fixture que ya usan los tests de integración de
  002/003, o un `POST /api/integracion/recorridos` manual — ver
  `specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`).

## Escenario 1 — Ver el mapa general de fletes activos (Historia 1)

1. Con el recorrido activo cargado, hacer que el chofer (o un cliente MQTT
   de prueba) publique una ubicación en `chofer/{fleteId}/ubicacion` (ver
   `specs/003-arquitectura-cloud-mqtt/contracts/mqtt-topics.md`), o esperar
   a que el backend resuelva un respaldo desde Oracle si corresponde.
2. Abrir Central (`http://localhost:5173` o el puerto que asigne Vite) y
   cambiar a la vista de mapa (FR-004).
3. **Verificar**: aparece un marcador en las coordenadas reportadas
   (FR-001); si se publica una nueva ubicación, el marcador se mueve en <=10s
   sin recargar la página (FR-002, SC-002).
4. Cargar un segundo recorrido activo sin ninguna ubicación reportada aún.
   **Verificar**: ese flete no genera ningún marcador (FR-007) — no aparece
   en 0,0 ni en ninguna posición inventada.

## Escenario 2 — Ver los puntos de un recorrido en el mapa (Historia 2)

1. Desde la vista de mapa (o de lista), abrir el detalle de un recorrido con
   varios puntos en estados mixtos (pendiente/arribado/completado).
2. **Verificar**: `GET /api/central/recorridos/:id` devuelve `lat`/`lon` por
   punto (ver `contracts/central-map-api.md`) y el mapa de detalle dibuja
   cada punto en su posición fija, distinguiendo visualmente su estado
   (FR-006).
3. **Verificar**: el marcador de posición del flete (si tiene ubicación
   conocida) aparece junto con los puntos del recorrido.

## Escenario 3 — Compatibilidad con iframe de Oracle APEX (Principio III)

1. Servir Central embebida dentro de una página de prueba con un
   `<iframe src="http://localhost:5173">`.
2. **Verificar**: la vista de mapa se renderiza igual que en acceso directo
   (sin errores de consola por bloqueo de frame, sin popups bloqueados) —
   FR-008, SC-004.

## Validación de éxito

Repasar contra `spec.md` → Success Criteria (SC-001 a SC-005) y registrar
cualquier desviación de forma explícita, siguiendo el mismo criterio ya
aplicado en `docs/validacion-sc-staging.md` de 003-arquitectura-cloud-mqtt
(evidencia concreta, no solo "funciona").
