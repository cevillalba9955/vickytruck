# Feature Specification: Hora y alerta de distancia mínima en el mapa de historial

**Feature Branch**: `014-mapa-historial-hora-distancia`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "en Central, cuando veo el mapa del historial de un recorrido, quiero ver los puntos registrados con la hora (hh:mm) tanto de inicio y final, y ademas mostrar si un punto de entrega esta fuera de la distancia minima"

## Clarifications

### Session 2026-09-16

- Q: El mapa de puntos vive en el componente de Detalle de un recorrido, compartido entre Monitoreo (recorrido activo) e Historial (recorrido finalizado). ¿La hora + alerta de distancia por punto debe aplicarse solo al mapa abierto desde Historial, o a cualquier mapa de Detalle? → A: Aplica a cualquier mapa de Detalle de un recorrido (activo o finalizado), sin distinguir si se llegó desde Monitoreo o desde Historial.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hora y alerta de distancia en cada punto de entrega (Priority: P1)

Como operador de Central, cuando abro el mapa del historial de un recorrido
finalizado, quiero ver directamente sobre cada punto de entrega la hora
(hh:mm) en que se registró su llegada y su descarga, y una señal visual
cuando la posición GPS registrada en ese punto quedó fuera de la distancia
mínima esperada respecto del destino, para detectar entregas dudosas sin
tener que cruzar la información con la grilla de la tabla.

**Why this priority**: es el pedido explícito de la feature — hoy esa
información (hora de llegada/descarga y aviso de distancia) solo existe en
la tabla de puntos del Detalle del recorrido; el mapa muestra los mismos
puntos pero sin hora ni aviso, obligando al operador a mirar dos lugares
distintos para relacionar "dónde" con "cuándo" y "qué tan lejos".

**Independent Test**: con un recorrido finalizado que tenga al menos un
punto de entrega con llegada/descarga registrada dentro de la distancia
mínima y otro fuera de ella, abrir su mapa de historial y verificar que
cada punto muestra su hora (hh:mm) y que el punto fuera de rango se
distingue visualmente del que está dentro de rango.

**Acceptance Scenarios**:

1. **Given** un punto de entrega con hora de llegada y hora de descarga
   registradas, **When** el operador ve el mapa de historial, **Then** el
   punto muestra ambas horas en formato hh:mm (por ejemplo al pasar el
   mouse/tocar el punto), sin necesidad de abrir la tabla.
2. **Given** un punto de entrega cuya posición GPS registrada (en llegada o
   en descarga) está fuera de la distancia mínima esperada respecto del
   destino, **When** el operador ve el mapa, **Then** ese punto se distingue
   visualmente (color/ícono) de los puntos cuya posición registrada sí cayó
   dentro de la distancia mínima.
3. **Given** un punto de entrega cuyas posiciones registradas (llegada y
   descarga) están dentro de la distancia mínima esperada, **When** el
   operador ve el mapa, **Then** el punto no muestra ninguna señal de alerta.
4. **Given** un punto de entrega sin ninguna posición GPS registrada todavía
   (por ejemplo, un punto que quedó pendiente al cerrarse el recorrido),
   **When** el operador ve el mapa, **Then** el punto no muestra hora ni
   señal de distancia (no hay con qué calcularla), sin que esto se confunda
   visualmente con "dentro de rango".

---

### User Story 2 - Punto de inicio y punto de cierre del recorrido en el mapa (Priority: P2)

Como operador de Central, cuando abro el mapa del historial de un recorrido,
quiero ver también dónde y a qué hora (hh:mm) comenzó y dónde y a qué hora
terminó el recorrido, para tener la ruta completa a la vista (no solo las
entregas) sin tener que leer el encabezado de texto del Detalle.

**Why this priority**: complementa a la Historia 1 — hoy la hora y
ubicación de inicio/cierre del recorrido ya se calculan y se muestran como
texto en el encabezado del Detalle, pero el mapa del historial no dibuja
esas dos ubicaciones; agregarlas da contexto geográfico a esos datos que ya
existen, aunque el valor principal de la feature (Historia 1) no depende de
esto.

**Independent Test**: con un recorrido finalizado que tenga ubicación de
inicio y de cierre registradas, abrir su mapa de historial y verificar que
aparecen un marcador de inicio y un marcador de cierre, cada uno distinguible
de los puntos de entrega y con su hora (hh:mm) visible.

**Acceptance Scenarios**:

1. **Given** un recorrido finalizado con ubicación de inicio registrada,
   **When** el operador ve el mapa de historial, **Then** aparece un
   marcador de inicio en esa posición con su hora (hh:mm), visualmente
   distinto de los marcadores de punto de entrega.
2. **Given** un recorrido finalizado con ubicación de cierre registrada,
   **When** el operador ve el mapa de historial, **Then** aparece un
   marcador de cierre en esa posición con su hora (hh:mm), visualmente
   distinto de los marcadores de punto de entrega y del marcador de inicio.
3. **Given** un recorrido finalizado sin ubicación de inicio o sin ubicación
   de cierre registrada (dato ausente, por ejemplo un recorrido antiguo),
   **When** el operador ve el mapa, **Then** el marcador correspondiente
   simplemente no se dibuja, sin inventar una posición ni romper el resto
   del mapa.

---

### Edge Cases

- ¿Qué pasa si el punto de inicio y el punto de cierre caen en la misma
  coordenada (o muy cerca) de un punto de entrega? Ambos marcadores deben
  poder distinguirse e inspeccionarse por separado (mismo criterio que ya
  usa el mapa para marcadores superpuestos).
- ¿Qué pasa si un punto de entrega tiene llegada dentro de la distancia
  mínima pero descarga fuera de ella (o viceversa)? El punto debe mostrar la
  señal de alerta (Historia 1, Escenario 2) y, al inspeccionarlo, debe poder
  distinguirse cuál de los dos eventos fue el que quedó fuera de rango.
- ¿Qué pasa con recorridos históricos que no tienen distancia mínima
  calculable por faltar coordenadas del punto de destino? No se muestra
  alerta de distancia para ese punto (mismo criterio que Escenario 4 de la
  Historia 1).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El mapa del historial de un recorrido DEBE mostrar, para cada
  punto de entrega con hora de llegada y/o hora de descarga registrada, esa
  hora en formato hh:mm, accesible al inspeccionar el punto (sin necesidad
  de abrir la tabla de puntos).
- **FR-002**: El mapa DEBE indicar visualmente cuándo la posición GPS
  registrada de un punto de entrega (en llegada o en descarga) quedó fuera
  de la distancia mínima esperada respecto del destino de ese punto, usando
  el mismo criterio de distancia mínima ya utilizado en la tabla de puntos
  del Detalle del recorrido.
- **FR-003**: El mapa NO DEBE mostrar señal de alerta de distancia en un
  punto de entrega que no tiene ninguna posición GPS registrada para
  comparar (no se puede calcular la distancia).
- **FR-004**: Cuando un punto de entrega tiene más de un evento registrado
  (llegada y descarga) y solo uno de los dos quedó fuera de la distancia
  mínima, el operador DEBE poder distinguir, al inspeccionar el punto, cuál
  de los dos eventos fue el que se alejó.
- **FR-005**: El mapa del historial DEBE mostrar un marcador para la
  ubicación de inicio del recorrido (cuando esté registrada) con su hora en
  formato hh:mm, visualmente distinto de los marcadores de punto de entrega.
- **FR-006**: El mapa del historial DEBE mostrar un marcador para la
  ubicación de cierre del recorrido (cuando esté registrada) con su hora en
  formato hh:mm, visualmente distinto de los marcadores de punto de entrega
  y del marcador de inicio.
- **FR-007**: Cuando la ubicación de inicio o de cierre del recorrido no
  está registrada (dato ausente), el mapa NO DEBE dibujar ese marcador ni
  inventar una posición.
- **FR-008**: Esta funcionalidad se aplica al mapa embebido en el Detalle de
  un recorrido sin distinguir si se accede desde el Historial de recorridos
  finalizados o desde el Monitoreo de un recorrido activo — es el mismo
  componente de mapa en ambos casos, y muestra hora y alerta de distancia
  para cualquier punto de entrega que ya tenga eventos registrados,
  independientemente del estado general del recorrido.

### Key Entities *(include if feature involves data)*

- **Punto de entrega (en el mapa de historial)**: posición geográfica de una
  parada del recorrido, con su estado, y opcionalmente la hora y la posición
  GPS en que se registró la llegada y la descarga en ese punto. Ya existe
  como dato; esta feature agrega su representación visual de hora y de
  alerta de distancia sobre el mapa.
- **Distancia mínima esperada**: criterio ya existente que compara la
  posición GPS registrada de un evento (llegada/descarga) contra las
  coordenadas del punto de entrega, para determinar si esa posición quedó
  razonablemente cerca del destino o no.
- **Marcador de inicio / marcador de cierre**: ubicación y hora del primer
  evento con posición GPS del recorrido, y de su evento de cierre,
  respectivamente. Ya existen como datos mostrados en el encabezado del
  Detalle; esta feature agrega su representación como marcadores en el
  mapa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un operador puede identificar, mirando únicamente el mapa de
  historial (sin abrir ni leer la tabla de puntos), si algún punto de
  entrega quedó fuera de la distancia mínima esperada.
- **SC-002**: Un operador puede leer la hora (hh:mm) de llegada y de
  descarga de cualquier punto de entrega inspeccionándolo directamente en el
  mapa, sin buscarla en otra parte de la pantalla.
- **SC-003**: Un operador puede ubicar en el mapa dónde y a qué hora
  comenzó y dónde y a qué hora terminó un recorrido, cuando esos datos están
  disponibles, sin salir de la vista de mapa.

## Assumptions

- El criterio de "distancia mínima esperada" reutiliza el mismo umbral y
  fórmula de distancia ya vigente en la tabla de puntos del Detalle del
  recorrido (radio de tolerancia entre la posición registrada y el destino
  del punto); esta feature no introduce un nuevo umbral ni lo hace
  configurable.
- El formato hh:mm (sin segundos) es el que se usa específicamente en el
  mapa; no reemplaza el formato con segundos ya usado en la tabla del
  Detalle.
- Esta mejora aplica al mismo componente de mapa que ya se usa para el
  Detalle de un recorrido (activo o histórico); no se pide una vista de mapa
  separada exclusiva para Historial.
- No se requiere ninguna acción del operador sobre la alerta de distancia
  (no bloquea nada, es solo informativa) — mismo criterio que ya rige la
  señal equivalente en la tabla del Detalle.
