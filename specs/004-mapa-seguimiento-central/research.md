# Research: Central — Mapa de Seguimiento de Fletes

## Decisión 1: Biblioteca de mapas

**Decision**: `leaflet` + `react-leaflet`, con tiles públicos de OpenStreetMap (sin API key).

**Rationale**: Central ya es una SPA React de escritorio sin backend propio de
assets estáticos más allá de Cloudflare Workers. Leaflet es la opción de
menor huella para el alcance actual (decenas de marcadores, sin necesidad de
mapas vectoriales 3D ni estilos custom avanzados): no requiere API key, no
requiere cuenta de facturación en un proveedor, y su bundle (~40 KB gzip) es
liviano frente al resto de la app. `react-leaflet` da bindings declarativos
de React sobre Leaflet, evitando manejar el ciclo de vida imperativo de
Leaflet a mano dentro de componentes React (menos código, Principio VII).

**Alternatives considered**:
- **Mapbox GL JS**: mapas vectoriales de mejor calidad visual, pero requiere
  API key y cuenta de facturación (aunque tenga capa gratuita) — complejidad
  operativa innecesaria para mostrar puntos y marcadores simples.
- **Google Maps JavaScript API**: igual problema (API key, facturación,
  cuota), más pesado, y agrega una dependencia a un proveedor con términos de
  uso más restrictivos.
- **MapLibre GL JS**: fork open-source de Mapbox GL sin necesidad de API key
  propia, pero requiere un proveedor de tiles vectoriales propio o de
  terceros y una curva de configuración mayor (estilos, sprites) que Leaflet
  para el caso simple de "marcador sobre mapa base" que cubre esta feature.
- **Renderizado propio (SVG/canvas con proyección manual)**: descartado —
  reinventar paneo/zoom/proyección de coordenadas es mucho más código y
  riesgo que adoptar una biblioteca madura.

**Riesgo documentado (no bloqueante para este alcance)**: el servidor de
tiles demo de OpenStreetMap (`tile.openstreetmap.org`) tiene una [política de
uso](https://operations.osmfoundation.org/policies/tiles/) que desalienta uso
productivo de volumen alto sin atribución/cache propio. Para el volumen
actual (un panel operativo interno, no público) es aceptable; si el uso
crece, la migración es acotada a cambiar la URL del tile layer (p. ej. a un
proveedor con capa gratuita como MapTiler o Stadia Maps, o tiles
autoalojados) sin tocar el resto de la implementación.

## Decisión 2: Origen de datos del mapa (sin nueva sincronización)

**Decision**: El mapa consume exclusivamente los endpoints de Central ya
existentes (`GET /api/central/recorridos/activos` y
`GET /api/central/recorridos/:id`), extendiendo el segundo para incluir
`lat`/`lon` de cada punto — campo que ya existe en el modelo interno
(`punto.lat`/`punto.lon`, ver `backend/src/state/integracionStore.js`) pero
que la función `serializarPuntosCentral` no expone hoy.

**Rationale**: `listarActivos()` ya devuelve `ultimaUbicacion` con `lat`/`lon`
resuelta (memoria del backend + respaldo Oracle, FR-016 de
002-panel-control-central) — no requiere ningún cambio para la Historia 1.
Para la Historia 2 (puntos de un recorrido en el mapa), la única alternativa
a exponer `lat`/`lon` en el endpoint de detalle sería que el frontend derive
las coordenadas de otra fuente (no existe ninguna) o que se cree un endpoint
nuevo — ambas opciones son más complejas que extender la serialización
existente con dos campos ya presentes en el store.

**Alternatives considered**:
- **Endpoint de mapa dedicado** (`GET /api/central/recorridos/:id/mapa`):
  descartado — duplicaría datos ya servidos por el endpoint de detalle sin
  aportar valor, violando Principio VII.
- **Calcular/derivar coordenadas en el frontend**: no aplica, no hay fuente
  alternativa de la topología del recorrido fuera del backend.

## Decisión 3: Actualización en vivo del mapa

**Decision**: Reutilizar sin cambios el mecanismo ya implementado en
`central/src/main.jsx` (polling cada 5 s vía `pollEvery` + suscripción MQTT
opcional vía `conectarUbicacionEnTiempoReal`, ver 003-arquitectura-cloud-mqtt).
El mapa se re-renderiza cuando cambia el estado `activos` que ya mantiene
`main.jsx`, igual que hoy lo hace `MonitorView`.

**Rationale**: Evita un segundo mecanismo de actualización en paralelo
(Principio VII); el mapa y la tabla quedan sincronizados por construcción al
derivar del mismo estado React.

**Alternatives considered**: polling o suscripción MQTT independiente para
el componente de mapa — descartado, generaría dos fuentes de verdad de
"última ubicación" dentro del mismo frontend, con riesgo de desincronización
visual entre tabla y mapa.

## Decisión 4: Estrategia de testing para componentes con Leaflet

**Decision**: Aislar la lógica de negocio (qué recorridos/puntos generan
marcador, filtrando ubicaciones ausentes — FR-007) en una función pura
(`central/src/services/marcadores.js`), testeada con `vitest` sin montar
Leaflet. El componente `MapaSeguimiento.jsx` se testea mockeando
`react-leaflet` (`vi.mock`) para verificar qué props/marcadores recibe,
siguiendo el mismo patrón ya usado en `central/tests/components/MonitorView.test.jsx`.

**Rationale**: `jsdom` (entorno de test de Vitest) no implementa el layout
real (`getBoundingClientRect`, tamaños de tile) que Leaflet necesita para
inicializarse correctamente; montarlo en tests headless es frágil y lento.
Separar la lógica pura de la capa de renderizado permite cobertura real de
negocio (FR-001, FR-003, FR-007, FR-009) sin depender del comportamiento
interno de Leaflet.

**Alternatives considered**: usar `leaflet` real en tests con polyfills de
DOM adicionales — descartado por fragilidad y costo de mantenimiento
desproporcionado para lo que se necesita validar (qué se pasa como marcador,
no cómo Leaflet pinta un tile).

## Resumen de NEEDS CLARIFICATION resueltos

Ninguno — la especificación (`spec.md`) no dejó marcadores
`[NEEDS CLARIFICATION]` pendientes; las decisiones de esta fase son
puramente técnicas (biblioteca, origen de datos, testing), no de alcance.
