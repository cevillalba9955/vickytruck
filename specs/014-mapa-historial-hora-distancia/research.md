# Research: Hora y alerta de distancia mínima en el mapa de Detalle

## Contexto verificado en el código existente

- `RecorridoDetalle.jsx` ya recibe, por punto, `arriboEn/arriboLat/arriboLon`,
  `descargaEn/descargaLat/descargaLon` e `inicioEn/inicioLat/inicioLon`, y a
  nivel de recorrido `cierreEn/cierreLat/cierreLon` — estos campos ya están
  expuestos por `GET /api/central/recorridos/:id` (usado tanto desde
  Monitoreo como para abrir un recorrido activo) y por `GET
  /api/central/recorridos/historial` (usado por `HistorialView`), sin
  diferencias de forma entre ambos. **Conclusión: no se requiere ningún
  cambio de contrato/API — es una feature 100% de presentación en el
  frontend `central`.**
- El umbral de distancia mínima (`RADIO_PROXIMIDAD_M = 500`) y el cálculo de
  distancia (`distanciaMetros`, fórmula de Haversine) ya existen: el radio
  está definido localmente en `RecorridoDetalle.jsx` (usado solo por la
  tabla) y `distanciaMetros` ya vive en `services/marcadores.js`.
- `MapaSeguimiento.jsx`, en modo "puntos" (el que usa `RecorridoDetalle`),
  dibuja cada punto de entrega como `CircleMarker` con un `Popup` que solo
  muestra `Punto {orden} — {estado}` — sin hora ni indicación de distancia.
  No dibuja ningún marcador para inicio/cierre del recorrido.
- `tiempo.js` solo expone `formatearHoraLocal` (HH:MM:SS). La spec pide
  hh:mm explícitamente para el mapa.

## Decisiones

### Decisión 1 — Sin cambios de backend/API
**Rationale**: todos los datos necesarios (horas y coordenadas de
llegada/descarga/inicio/cierre) ya llegan al frontend en la respuesta
existente de detalle de un recorrido, sin importar si es un recorrido
activo o finalizado. Agregar un contrato nuevo violaría el Principio VII
(Simplicidad) sin necesidad.
**Alternativas consideradas**: exponer un endpoint nuevo "resumen de mapa"
— descartado, sería una capa redundante sobre datos que ya llegan enteros.

### Decisión 2 — Mover `RADIO_PROXIMIDAD_M` a `services/marcadores.js`
**Rationale**: hoy el umbral vive como constante local de
`RecorridoDetalle.jsx` (solo la tabla lo usa). Para que el mapa use "el
mismo criterio de distancia mínima ya utilizado en la tabla" (FR-002) sin
duplicar el número mágico en dos archivos, el umbral se define una sola vez
en `marcadores.js` (junto a `distanciaMetros`, que ya vive ahí) y
`RecorridoDetalle.jsx` lo importa para la tabla igual que antes.
**Alternativas consideradas**: dejarlo duplicado en ambos archivos —
descartado, invita a que diverjan con el tiempo (Principio VII).

### Decisión 3 — Nueva función pura `puntoFueraDeRango(punto)` en `marcadores.js`
**Rationale**: FR-002/FR-003/FR-004 requieren decidir, por punto, si algún
evento registrado (llegada y/o descarga) cayó fuera del radio esperado, y
distinguir cuál. Una función pura y testeable (misma filosofía que el
resto de `marcadores.js`, "lógica pura, sin dependencia de Leaflet")
evalúa cada evento con coordenadas propias contra `distanciaMetros`, y
devuelve algo como `{ llegadaFueraDeRango, descargaFueraDeRango }` (ambos
`null` si el evento correspondiente no tiene GPS registrado — FR-003).
**Alternativas consideradas**: calcular la distancia dentro del componente
React — descartado, rompe el patrón existente de mantener esta lógica
testeable sin montar el mapa (ver comentario de cabecera de
`marcadores.js`).

### Decisión 4 — Enriquecer `construirPuntosEnMapa` en vez de crear una función paralela
**Rationale**: `construirPuntosEnMapa` ya es el punto único que transforma
`puntos` del detalle en la forma que consume `MapaSeguimiento`. Se le
agregan los campos de hora (`arriboEn`, `descargaEn`) y el resultado de
`puntoFueraDeRango` a la salida existente, en vez de introducir una segunda
función que el componente tendría que combinar — menos superficie, mismo
call site en `RecorridoDetalle.jsx`.
**Alternativas consideradas**: pasar los puntos crudos al mapa y calcular
ahí — descartado, movería lógica de negocio (umbral de distancia) al
componente visual.

### Decisión 5 — Marcadores de inicio/cierre como una función nueva y pequeña, no un tipo más de `construirMarcadoresMapaUnificado`
**Rationale**: `construirMarcadoresMapaUnificado` es específico del mapa
consolidado de Monitoreo general (010-mapa-central-unificado) — un caso no
tocado por esta feature. Para el mapa de Detalle (un solo recorrido), una
función chica `construirMarcadorExtremo({ iso, lat, lon }, tipo)` que
devuelve `null` si falta `lat`/`lon` (FR-007) es más simple que ramificar la
función unificada para un caso que no le pertenece.
**Alternativas consideradas**: reusar `construirMarcadoresMapaUnificado` —
descartado, mezclaría dos conceptos de mapa distintos (consolidado
multi-recorrido vs. detalle de uno solo) que hoy están intencionalmente
separados (ver comentario de cabecera de `MapaSeguimiento.jsx`).

### Decisión 6 — Señal visual de "fuera de rango": anillo/borde distintivo sobre el `CircleMarker` existente, no un ícono nuevo
**Rationale**: el color de relleno del punto ya codifica el estado
(pendiente/arribado/completado — `COLOR_POR_ESTADO_PUNTO`). Cambiar el color
de relleno para la alerta perdería esa información. Se usa el `color`
(borde) del `CircleMarker`, hoy sin uso diferenciado en modo "puntos", para
la alerta (p. ej. borde rojo cuando `fueraDeRango`, manteniendo el
`fillColor` de estado) — mismo principio que `HoraConProximidad` en la
tabla (badge de color superpuesto a la hora, sin ocultar el estado).
**Alternativas consideradas**: un ícono de advertencia superpuesto —
descartado por ahora, más complejidad visual (dos capas por marcador) para
el mismo resultado perceptible.

### Decisión 7 — Interacción: `Tooltip` (hover) en vez de `Popup` (click) para hora + alerta
**Rationale**: SC-001/SC-002 piden que el operador "identifique"/"lea"
la info mirando el mapa, no que tenga que hacer click punto por punto. El
modo "puntos" hoy usa `Popup`, pero el modo `marcadoresUnificados` ya usa
`Tooltip` para el mismo propósito de descubribilidad (ver comentario en
`MapaSeguimiento.jsx`: "Tooltip (hover) en vez de Popup (click)... para
que la información esté disponible con un vistazo"). Se unifica el modo
"puntos" al mismo patrón de `Tooltip`, agregando hora y, si corresponde,
el detalle de qué evento quedó fuera de rango.
**Alternativas consideradas**: mantener `Popup` — descartado, exige una
interacción por punto que las Historias 1/2 buscan evitar.

### Decisión 8 — Nueva función `formatearHoraCorta(iso)` en `tiempo.js`
**Rationale**: la spec pide explícitamente hh:mm (sin segundos) para el
mapa, distinto del HH:MM:SS que ya usa la tabla vía `formatearHoraLocal`.
Una función nueva y chica (mismo `Intl.DateTimeFormat`, sin `second`) evita
tocar el formato ya usado en la tabla.
**Alternativas consideradas**: truncar el string de `formatearHoraLocal`
con substring — descartado, frágil ante cambios de formato/locale.

## Resueltos: NEEDS CLARIFICATION

Ninguno pendiente — la única ambigüedad de alcance (aplicar a cualquier
mapa de Detalle vs. solo al abierto desde Historial) ya se resolvió en
`spec.md` (sección Clarifications, sesión 2026-09-16).
