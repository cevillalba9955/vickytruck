# Research: Mapa Central Unificado

## Decisión 1: Exponer `puntos` en `GET /api/central/recorridos/activos`

**Decision**: Agregar el campo `puntos` (mismo formato que ya produce
`serializarPuntosCentral`, usado hoy por `listarHistorial`/`obtenerDetalle`)
a cada recorrido de `listarActivos()` en `backend/src/state/integracionStore.js`.

**Rationale**: Es el único dato que falta para la Historia 1 — `listarActivos()`
ya expone `ultimaUbicacion` (posición de flete) pero nunca expuso los
`puntos` completos, solo un resumen (`puntoActivo`). Reutilizar
`serializarPuntosCentral` evita duplicar lógica de serialización y mantiene
un único lugar que decide qué campos de un punto son públicos para Central
(hoy incluye `arriboLat`/`arriboLon`/etc. agregados en 009-central-mejora-visual).
El polling ya vigente de Monitoreo/Mapa (`GET /api/central/recorridos/activos`)
pasa a traer todo lo necesario para pintar el mapa consolidado sin pedidos
adicionales por recorrido (Constraint de plan.md: sin N+1).

**Alternatives considered**:
- **Pedir el detalle de cada recorrido activo por separado** (`GET
  /api/central/recorridos/:id` × N): descartado — reintroduce el problema de
  red que `RecorridoDetalle` ya evita hoy pasando `marcadorFlete` desde
  `activos` en vez de pedirlo aparte; con hasta 10 recorridos activos serían
  hasta 10 pedidos adicionales por ciclo de polling sin necesidad.
- **Endpoint nuevo `GET /api/central/mapa`**: descartado por Principio VII —
  duplicaría datos que `listarActivos()` ya casi expone completos.

## Decisión 2: Punto de salida — constante de backend + campo opcional por recorrido

**Decision**: El punto de salida predeterminado (`lat=-34.8097527`,
`lon=-58.4574414`, aclaración de spec.md) vive como constante de
configuración del backend cloud (junto a otras constantes operativas de
`integracionStore.js`/config, no como variable de entorno obligatoria, para
no exigir configuración adicional en cada deploy) y se expone en la
respuesta de `GET /api/central/recorridos/activos` como un campo de nivel
superior — `puntoSalidaDefault: { lat, lon }` — independiente de la lista de
`recorridos`, para que el frontend lo tenga disponible aunque esa lista esté
vacía (US4, Acceptance Scenario 1). El punto de salida propio de un
recorrido (cuando exista) se modela como el campo opcional `puntoSalida:
{ lat, lon }` dentro del payload de upsert ya existente (Endpoint 1,
`integracion-api.md`) y se expone igual en cada recorrido de `listarActivos()`
solo cuando está presente.

**Rationale**: Cumple FR-006/FR-008 sin crear un canal de sincronización
nuevo (Principio IV) — el campo por-recorrido viaja por el mismo contrato ya
auditado que trae `puntos`. Poner el default como constante de backend (no
del store operacional en memoria, que se reinicia, ni de Oracle, que no
tiene ningún concepto de "punto de salida" hoy) es la opción más simple: no
depende de que Oracle re-envíe nada para que el default exista, y el
frontend no necesita ningún caso especial para "no hay recorridos activos
todavía".

**Alternatives considered**:
- **Hardcodear las coordenadas del default en el frontend** (`central/src`):
  descartado — el propio pedido del usuario es que sea el backend quien
  las tenga predeterminadas, y mezclar una constante de negocio en el
  frontend contradice Principio IV (Central en cloud es de solo lectura;
  no debería ser dueño de un dato operativo como este).
- **Persistir el default en el store operacional** (`recorridos` Map):
  descartado — no es un dato por-recorrido ni cambia en runtime; una
  constante de configuración es más simple (Principio VII) y sobrevive a un
  reinicio del proceso sin reconciliación.
- **Exigir que Oracle envíe `puntoSalida` en cada push, incluso repitiendo el
  default**: descartado — obligaría a tocar Oracle/APEX ya para el caso
  común (recorrido sin origen particular), cuando hoy ningún recorrido lo
  necesita; el campo opcional cubre el caso futuro sin ese costo inmediato.

## Decisión 3: Color por recorrido — paleta fija determinística en el frontend

**Decision**: Definir una paleta fija de colores distinguibles (10, uno por
recorrido activo esperado como máximo — Principio II/escenario "menos de 10
simultáneos") en `central/src/services/marcadores.js`, y asignar un color a
cada recorrido activo de forma determinística por posición en la lista
`recorridos` que ya devuelve `listarActivos()` (orden estable entre ciclos
de polling mientras el conjunto de recorridos activos no cambie), reciclando
la paleta con módulo si hubiera más recorridos que colores.

**Rationale**: No hay ningún requisito de que el operador elija colores
(spec.md, Assumptions), así que una asignación determinística y sin estado
adicional (Principio VII) alcanza; construirla en el frontend evita tocar el
backend solo para decidir un color de presentación. Derivar el color de la
posición en la lista (no de un hash del `id`) es suficientemente estable
para la duración de una sesión de Central — el caso "un recorrido cambia de
color al refrescar" solo podría ocurrir si el conjunto de recorridos
activos cambia (uno finaliza, otro arranca), lo cual ya es un cambio visual
esperado (aparece/desaparece un recorrido del mapa).

**Alternatives considered**:
- **Hash determinístico del `recorridoId` sobre la paleta**: más estable
  entre sesiones/reinicios, pero con < 10 recorridos y una paleta de 10
  colores el riesgo de colisión visual (dos recorridos activos con el mismo
  color por hash) es real y más difícil de razonar que la asignación
  posicional; se descarta por complejidad innecesaria para el beneficio.
- **Colores configurables por el operador**: fuera de alcance (spec.md,
  Assumptions) — no hay pedido de personalización.

## Decisión 4: Tipos de marcador e íconos (flete, punto de entrega, punto de salida)

**Decision**: Extender `MapaSeguimiento.jsx` con tres formas de marcador
`react-leaflet` distintas entre sí (independientes del color):
posición de flete/chofer (forma ya usada hoy, `CircleMarker` con relleno
sólido), punto de entrega (forma ya usada hoy en el mapa de detalle, sin
cambios), y un tercer tipo — ícono de punto de salida (`L.divIcon`/marcador
con forma de bandera o pin distinto, sin relación con la paleta de colores
de recorrido, según Clarifications de spec.md). El nombre de cliente / "punto
de salida" / identificación de flete se muestra con el mecanismo de hover
que ya provee Leaflet (`Tooltip` con `permanent={false}`, mostrado al pasar
el mouse) en vez del `Popup` actual (que requiere click).

**Rationale**: `react-leaflet` ya distingue `Tooltip` (hover) de `Popup`
(click) — cambiar de `Popup` a `Tooltip` para el nombre de cliente es el
único ajuste necesario para cumplir FR-004/FR-005 sin lógica propia de
detección de hover. Mantener el `Popup`/click existente sobre la posición de
flete para abrir el Detalle (FR-007) no es incompatible: Leaflet permite que
un mismo marcador tenga `Tooltip` (hover) y `eventHandlers.click` (para
abrir Detalle) simultáneamente.

**Alternatives considered**:
- **Un solo tipo de marcador con solo color para diferenciar todo**:
  descartado explícitamente por spec.md (US2) — no alcanza para distinguir
  "posición de flete" de "punto de entrega" dentro del mismo recorrido
  cuando comparten color.
- **Tooltip permanente (siempre visible, no solo hover)**: descartado —
  con hasta 10 recorridos × 10 puntos el mapa quedaría saturado de texto
  superpuesto; contradice la razón de ser de esta feature (panorama claro).

## Resumen de NEEDS CLARIFICATION resueltos

Ninguno quedaba pendiente al llegar a esta fase — las dos ambigüedades reales
de esta feature (comportamiento del punto de salida por defecto, y su estilo
visual) ya se resolvieron en la sesión de `/speckit-clarify` del
2026-08-20 y quedaron incorporadas a `spec.md` (sección Clarifications). Las
decisiones de esta fase son puramente técnicas (dónde vive cada dato, cómo
se renderiza), no de alcance.
