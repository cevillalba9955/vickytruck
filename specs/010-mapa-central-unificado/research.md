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

## Decisión 3: Color por flete — paleta fija por posición, con override opcional de Oracle

**Decision** *(revisada tras `/speckit-clarify` del 2026-08-20, ver
Clarifications de spec.md)*: la clave de asignación de color es el
**`flete_id`**, no el `recorridoId` ni una posición arbitraria — aunque en la
práctica, para una única respuesta de `listarActivos()`, ambas claves
coinciden (un flete no tiene más de un recorrido activo a la vez, FR-002).
Sin color explícito, se asigna de forma determinística por posición del
flete dentro de la lista `recorridos` que devuelve `listarActivos()` en ese
ciclo de polling (paleta fija de 10 colores en
`central/src/services/marcadores.js`, reciclada con módulo si hubiera más
fletes activos que colores) — **sin persistir ningún estado** para
garantizar que un flete conserve su color entre un recorrido y el siguiente
(decisión explícita del usuario: FR-002a). Cuando el backend expone un
campo `color` para ese recorrido (porque Oracle lo envió, ver Decisión 3b),
ese valor tiene prioridad absoluta y se usa tal cual, sin pasar por la
paleta.

**Rationale**: usar `flete_id` en vez de `recorridoId` como clave documenta
la intención real (el color identifica al camión, no al recorrido puntual)
aunque no cambie el resultado observable sin el campo explícito, y deja la
implementación lista para el día en que se necesite decidir el color de
otro modo dentro de una misma respuesta. Explícitamente se decidió NO
agregar un mapa de continuidad persistido (ni en frontend ni en backend)
para el caso automático — el usuario, al elegir entre las tres opciones
planteadas en clarify, prefirió la más simple (Principio VII): sin color
explícito, es aceptable que el color cambie entre un recorrido de un flete
y el siguiente; quien necesite continuidad garantizada la logra enviando el
color desde Oracle.

**Alternatives considered**:
- **Hash determinístico del `flete_id` sobre la paleta (sin estado, estable
  entre sesiones)**: descartado — con < 10 fletes activos y una paleta de
  10 colores, el riesgo de colisión visual (dos fletes activos con el mismo
  color por hash) es real (problema del cumpleaños con `k≈n≈10`); no vale
  la pena frente a la opción posicional, que dentro de una misma respuesta
  nunca colisiona.
- **Persistir flete_id→color en el store operacional o en memoria del
  frontend** (para dar continuidad automática entre recorridos sucesivos
  del mismo flete): era la opción recomendada en la primera ronda de
  clarify, pero el usuario la descartó explícitamente a favor de la más
  simple — sin esa persistencia, y dejando la continuidad real a cargo del
  campo `color` opcional que puede enviar Oracle.
- **Colores configurables por el operador**: fuera de alcance (spec.md,
  Assumptions) — no hay pedido de personalización.

## Decisión 3b: Color explícito opcional desde Oracle

**Decision**: agregar el campo opcional `color` (string, valor CSS/hex) al
payload de upsert de Oracle (Endpoint 1, junto a `puntoSalida` — ver
Decisión 2) y a la respuesta de `listarActivos()`. Cuando está presente para
un recorrido, el frontend lo usa tal cual (sin pasar por la paleta) para la
posición de ese flete, sus puntos de entrega y su punto de salida propio si
lo tuviera.

**Rationale**: es el único mecanismo que puede dar continuidad real de color
entre recorridos sucesivos de un mismo flete (Decisión 3), ya que Oracle sí
tiene visibilidad de la identidad del flete a través del tiempo (a
diferencia del store operacional cloud, que solo conoce recorridos
individuales). Igual que `fleteNombre` (ya opcional en el mismo contrato),
un recorrido sin `color` sigue siendo válido y usa la asignación automática.

**Alternatives considered**:
- **No permitir override de Oracle, resolver todo en el frontend**:
  descartado — es exactamente lo que pidió el usuario para poder controlar
  el color desde el origen de datos que sí conoce la continuidad de un
  flete en el tiempo.
- **Validar/restringir el valor de `color` a una paleta cerrada**:
  descartado por ahora (Principio VII) — no hay ningún requisito de
  consistencia visual entre el color que Oracle decida enviar y la paleta
  automática; si hiciera falta, es un cambio acotado a la validación del
  endpoint de upsert, no a este diseño.

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

## Decisión 5: Qué pasa con el color "reciente/no reciente" del marcador de flete en la vista unificada

**Decision**: en la vista de Mapa unificada, el color del marcador de
posición de flete pasa a representar la identidad del flete/recorrido
(FR-002), no la recencia de la ubicación (`COLOR_RECIENTE`/`COLOR_NO_RECIENTE`
de `MapaSeguimiento.jsx`, hoy verde/naranja). La información de "ubicación
reciente/no reciente" no se pierde: se agrega al texto del `Tooltip` de
hover de ese marcador (FR-005 ya exige mostrar "información suficiente para
identificar a qué flete/recorrido corresponde esa posición" — se extiende
con una palabra más, p. ej. "Camión 7 — ubicación reciente").

**Rationale**: FR-002 es explícito en que el color identifica al flete de
forma consistente en todos sus marcadores; no hay dos canales de color
disponibles sobre el mismo `CircleMarker` para transmitir identidad y
recencia a la vez sin volverlos ambiguos entre sí (¿es naranja porque es
"ese" flete o porque su ubicación no es reciente?). Mover la recencia al
texto del tooltip no pierde información (ya viaja en `ultimaUbicacion.reciente`),
solo cambia el canal de "color" a "texto al pasar el mouse" — consistente
con que esta feature ya mueve otra información similar (nombre de cliente)
de un click (`Popup`) a un hover (`Tooltip`, Decisión 4). El mapa embebido
en el Detalle de un recorrido (fuera de alcance de esta feature, ver
Assumptions de spec.md) sigue mostrando un único flete a la vez, así que
**no** tiene este conflicto y conserva sin cambios su color reciente/no
reciente actual — el cambio de esta decisión aplica solo a la vista general
de Mapa.

**Alternatives considered**:
- **Codificar recencia con el borde del marcador** (p. ej. borde sólido si
  reciente, punteado si no) manteniendo el relleno como color de flete:
  técnicamente posible con `pathOptions` de Leaflet, pero agrega una
  distinción visual adicional no pedida por spec.md; se descarta para no
  ampliar el alcance sin un pedido explícito (Principio VII) — queda como
  mejora futura de bajo costo si se pidiera.
- **Mantener el color por recencia y usar un segundo indicador (badge/ícono
  superpuesto) para el flete**: descartado — invierte la prioridad que pide
  FR-002 (el color debe identificar al flete, no la recencia) y complica el
  marcador (dos capas visuales superpuestas) para un beneficio menor al de
  simplemente mover el dato a texto.

## Resumen de NEEDS CLARIFICATION resueltos

Ninguno quedaba pendiente al llegar a esta fase — las dos ambigüedades reales
de esta feature (comportamiento del punto de salida por defecto, y su estilo
visual) ya se resolvieron en la sesión de `/speckit-clarify` del
2026-08-20 y quedaron incorporadas a `spec.md` (sección Clarifications). Las
decisiones de esta fase son puramente técnicas (dónde vive cada dato, cómo
se renderiza), no de alcance.
