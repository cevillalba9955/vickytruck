# Feature Specification: Resiliencia offline del chofer al marcar puntos de entrega

**Feature Branch**: `007-chofer-resiliencia-offline`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "Resiliencia offline del chofer al marcar puntos de entrega: el chofer captura la hora real del press (clienteEn) junto con el GPS al marcar LLEGUE/DESCARGA COMPLETA/etc, y esa hora se preserva y se usa en el backend en vez de la hora de reconexión cuando la acción queda encolada por falta de conectividad y se reintenta más tarde. Además, el recorrido completo se cachea localmente (por token) para que un reload de la app mientras sigue offline muestre la última info guardada (con aviso "Sin conexión") en vez de romper con la pantalla de enlace inválido. Y cuando la cola offline reintenta con éxito en segundo plano al recuperar conexión, la pantalla se resincroniza sola con el servidor (ya no queda mostrando una acción como pendiente cuando el servidor ya la aplicó). Ya implementado y verificado en vivo en esta rama (main-cloud) — se pide documentarlo retroactivamente como spec de Spec Kit, siguiendo la convención de specs/005-chofer-estados-viaje y specs/006-normalizar-formato-horario ya existentes en el repo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - La hora de arribo/descarga registrada es la real, no la de reconexión (Priority: P1)

Un chofer se queda sin señal en la ruta de reparto. Igual marca LLEGUE al llegar a un punto y DESCARGA COMPLETA al terminar. Minutos u horas después, cuando el celular recupera señal, esas acciones se envían solas al servidor. El chofer (y Oracle/Central, que auditan esos horarios) necesitan que la hora que quede registrada sea la del momento real en que el chofer marcó cada cosa, no la del momento en que el teléfono volvió a tener señal.

**Why this priority**: Es un dato de auditoría operativa (Oracle/APEX lo consume) — una hora de arribo/descarga incorrecta por una demora de reconexión rompe la confianza en el registro y puede generar reclamos o decisiones erróneas sobre demoras reales.

**Independent Test**: Puede probarse marcando LLEGUE o DESCARGA COMPLETA sin conectividad, esperando un tiempo notorio, restableciendo la conexión, y verificando que la hora que quedó grabada en el punto coincide con el momento del marcado original, no con el de la reconexión.

**Acceptance Scenarios**:

1. **Given** el chofer sin conectividad marca LLEGUE en un punto de entrega, **When** la conexión se restablece varios minutos después y la acción se reintenta sola, **Then** la hora de arribo registrada corresponde al momento en que el chofer presionó LLEGUE, no al momento de la reconexión.
2. **Given** el chofer marca varias acciones seguidas sin conectividad (por ejemplo LLEGUE y luego DESCARGA COMPLETA en el mismo punto), **When** se reintentan al reconectar, **Then** cada una conserva su propia hora real de marcado, en el mismo orden en que ocurrieron.
3. **Given** el reloj del celular del chofer está mal configurado (por ejemplo, muestra una hora claramente futura o inválida), **When** esa acción se reintenta, **Then** el sistema descarta esa hora y usa la hora del servidor en su lugar, para no dejar un dato de auditoría absurdo.

---

### User Story 2 - El chofer puede recargar la app sin conexión y seguir viendo su recorrido (Priority: P2)

Un chofer con la app abierta se queda sin señal a mitad de su recorrido y sigue marcando puntos con normalidad (ver User Story 1). Si en ese momento recarga la app (por ejemplo porque se cierra sola, o el celular se reinicia), necesita seguir viendo su recorrido y lo que ya marcó, para poder seguir operando, en vez de encontrarse con una pantalla que dice que su enlace ya no es válido.

**Why this priority**: Sin esto, un simple reinicio de la app en una zona sin señal deja al chofer completamente bloqueado, sin poder ver ni marcar nada, aunque nada de su trabajo se haya perdido realmente.

**Independent Test**: Puede probarse cargando el recorrido con conexión, cortando la conectividad, marcando al menos un punto, recargando la app sin recuperar conexión, y verificando que la ruta se sigue mostrando (reflejando lo ya marcado) en vez de un error.

**Acceptance Scenarios**:

1. **Given** el chofer ya cargó su recorrido al menos una vez con conexión, **When** recarga o reabre la app estando sin conectividad, **Then** ve la última versión conocida de su recorrido, con un aviso visible de que está sin conexión y de que la información puede no estar 100% actualizada.
2. **Given** el chofer marcó puntos mientras estaba sin conexión, **When** recarga la app sin haber recuperado la señal todavía, **Then** ve reflejado ese progreso (no la versión del recorrido previa a haber marcado nada), para no arriesgarse a repetir una acción ya hecha.
3. **Given** el chofer nunca llegó a cargar el recorrido con éxito ni una vez (por ejemplo, abre el enlace por primera vez sin conexión), **When** intenta cargarlo sin conectividad, **Then** ve un mensaje que aclara que es un problema de conectividad y no de un enlace inválido o vencido.
4. **Given** el enlace del chofer es realmente inválido o ya no está disponible (no un problema de conectividad), **When** intenta cargarlo, **Then** ve el mensaje de enlace inválido correspondiente, sin que se le muestre por error una versión cacheada de otro recorrido.

---

### User Story 3 - La pantalla se pone al día sola cuando la sincronización en segundo plano tiene éxito (Priority: P3)

Un chofer marcó una acción sin conectividad y siguió operando. Cuando la señal vuelve, la app reintenta esa acción en segundo plano sin que el chofer tenga que hacer nada. El chofer necesita que, apenas eso se resuelve, la pantalla refleje el resultado real (por ejemplo, que ya puede avanzar al siguiente punto), sin quedar mostrando una acción como "todavía pendiente" cuando en realidad el servidor ya la aplicó.

**Why this priority**: Es un problema de confusión más que de pérdida de datos (la acción sí se aplica igual) — pero deja al chofer sin saber si puede seguir adelante, y podría llevarlo a intentar repetir una acción que el sistema ya procesó.

**Independent Test**: Puede probarse marcando una acción sin conectividad, restableciendo la conexión, esperando a que la sincronización automática la aplique, y verificando que la pantalla cambia sola para reflejar el nuevo estado, sin que el chofer tenga que tocar nada más.

**Acceptance Scenarios**:

1. **Given** una acción quedó encolada sin conectividad, **When** la conexión vuelve y esa acción se aplica con éxito en el servidor, **Then** la pantalla del chofer se actualiza sola para reflejar ese resultado (por ejemplo, mostrando el siguiente punto disponible), sin necesidad de que el chofer presione nada.
2. **Given** una acción encolada ya no puede aplicarse cuando por fin se reintenta (por ejemplo, porque el estado avanzó por otro medio mientras tanto), **When** el reintento se resuelve, **Then** la pantalla igual se pone al día con el estado real del servidor, en vez de seguir mostrando la acción como pendiente.
3. **Given** una acción todavía está encolada y no se sincronizó, **When** el chofer usa CANCELAR sobre ella, **Then** se descarta localmente sin tocar el servidor (porque nunca llegó a salir del dispositivo); pero si esa misma acción ya se sincronizó exitosamente en segundo plano justo antes, CANCELAR pasa a depender del estado real ya confirmado por el servidor, no de una versión local desactualizada.

---

### Edge Cases

- ¿Qué pasa si el chofer abre el mismo enlace en otro dispositivo mientras el primero tiene acciones sin sincronizar? Cada dispositivo mantiene su propia cola y caché local; no hay reconciliación entre dispositivos distintos como parte de esta feature.
- ¿Qué pasa si la conectividad es intermitente (aparece y desaparece varias veces) durante el reintento de una cola con varias acciones? Las acciones se aplican en el mismo orden en que el chofer las marcó; si una falla, las siguientes esperan su turno en vez de aplicarse desordenadas.
- ¿Qué pasa si el chofer presiona CANCELAR sobre la última acción justo cuando esa misma acción termina de sincronizarse en segundo plano? Gana el estado real del servidor: CANCELAR pasa a operar contra el servidor en vez de descartar localmente algo que ya no está solo en el dispositivo.
- ¿Qué pasa con la posición GPS si el chofer no tiene señal de datos pero sí GPS? La posición se sigue capturando con normalidad (no depende de la conectividad de red) y viaja junto con la hora real capturada.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE capturar la hora real del dispositivo del chofer en el momento exacto en que presiona una acción de marcado de estado (LLEGUE, DESCARGA COMPLETA, y las equivalentes de marcado libre de arribo/descarga), independientemente de si hay conectividad o de cuánto tarde en confirmarse la posición GPS.
- **FR-002**: El sistema DEBE conservar esa hora capturada junto con la acción mientras esta quede pendiente de enviar por falta de conectividad, de forma que sobreviva hasta que se reintente, incluso si la app se cierra o el dispositivo se reinicia en el medio.
- **FR-003**: Al aplicar una acción reintentada, el sistema DEBE registrar el evento con la hora capturada en el momento del marcado original, no con la hora en que se procesa el reintento — salvo que esa hora no sea plausible (por ejemplo, corresponda a un reloj de dispositivo mal configurado), en cuyo caso DEBE usar la hora del servidor como respaldo.
- **FR-004**: El sistema DEBE mantener una copia local del recorrido asignado al chofer, asociada a su enlace, que se actualiza con cada cambio de estado (incluidos los cambios hechos sin conectividad).
- **FR-005**: Cuando la app se recarga o reabre sin conectividad y existe una copia local del recorrido para ese enlace, el sistema DEBE mostrar esa copia en vez de bloquear con un error, indicando visiblemente al chofer que está viendo información guardada sin conexión.
- **FR-006**: Cuando la app se recarga o reabre sin conectividad y todavía no existe ninguna copia local del recorrido para ese enlace, el sistema DEBE mostrar un mensaje que distinga claramente "sin conectividad" de "enlace inválido o vencido", para que el chofer sepa que no necesita un enlace nuevo.
- **FR-007**: El sistema NO DEBE usar la copia local del recorrido para encubrir un enlace realmente inválido o vencido — esa distinción depende de si el servidor respondió que el enlace no existe (enlace inválido) o si la solicitud no pudo completarse por falta de conectividad.
- **FR-008**: Cuando una acción que había quedado pendiente por falta de conectividad se aplica con éxito en el servidor al recuperar la conexión, el sistema DEBE actualizar lo que ve el chofer en pantalla para reflejar ese resultado, sin requerir que el chofer realice ninguna acción adicional.
- **FR-009**: Cuando una acción pendiente ya no puede aplicarse al momento de reintentarla (por ejemplo, el estado avanzó por otra vía mientras estaba encolada), el sistema DEBE de todas formas actualizar la pantalla del chofer para reflejar el estado real del servidor, en vez de dejarla mostrando la acción como si siguiera pendiente.
- **FR-010**: El sistema DEBE impedir que el chofer deshaga localmente (sin tocar el servidor) una acción que ya salió del dispositivo y fue aplicada exitosamente en segundo plano; a partir de ese momento, deshacerla debe pasar por el mismo mecanismo de cancelación usado para acciones que siempre tuvieron conexión.

### Key Entities *(include if feature involves data)*

- **Acción de marcado encolada**: una acción de cambio de estado de viaje (LLEGUE, DESCARGA COMPLETA, etc.) que el chofer disparó sin conectividad; incluye el tipo de acción, la posición GPS capturada (si estuvo disponible) y la hora real de cuando el chofer la marcó. Vive en el dispositivo hasta que se confirma o se descarta.
- **Copia local del recorrido**: la última versión conocida del recorrido asignado al chofer para un enlace dado, guardada en el dispositivo y mantenida al día con cada cambio de estado, incluidos los hechos sin conexión.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las acciones de marcado hechas sin conectividad quedan registradas con la hora real en que el chofer las marcó, sin importar cuánto tiempo pase hasta que el dispositivo recupera conexión.
- **SC-002**: Un chofer puede completar todo el resto de su recorrido (marcar todos los puntos restantes) sin conectividad, y al reconectar el servidor termina reflejando exactamente esa misma secuencia de estados, sin ninguna acción perdida ni duplicada.
- **SC-003**: Un chofer que recarga o reabre la app mientras sigue sin conexión, habiendo cargado el recorrido con éxito al menos una vez antes, sigue viendo su recorrido (con su propio progreso) en el 100% de los casos, en vez de una pantalla de error.
- **SC-004**: Dentro de los pocos segundos posteriores a recuperar la conectividad, la pantalla del chofer queda alineada con el estado real del servidor para toda acción que estaba pendiente de sincronizar, sin que el chofer tenga que tocar nada.

## Assumptions

- Esta spec documenta una funcionalidad ya implementada y verificada en vivo (2026-08-12, rama `main-cloud`); se escribe en forma retroactiva para dejar registro formal en Spec Kit, no como diseño previo a la implementación. Las decisiones de alcance reflejan lo efectivamente construido.
- La app ya contaba con una cola de reintento offline para las acciones de marcado (persistida en el dispositivo, ver spec 005-chofer-estados-viaje) y ya capturaba la posición GPS del chofer al momento de marcar, sin depender de la conectividad de red; esta feature construye sobre esa base para agregar la hora real y la continuidad de la vista del recorrido, no los introduce desde cero.
- El reloj del dispositivo del chofer es razonablemente confiable; se aplica un margen de tolerancia para descartar una hora claramente implausible (por ejemplo, muy adelantada respecto del reloj del servidor) sin bloquear el marcado ni el reintento — el detalle exacto del margen es una decisión de implementación, no de producto.
- "Sin conectividad" incluye tanto la ausencia total de señal como fallas de red intermitentes que impiden completar la solicitud al servidor.
- Un chofer usa un enlace/token por vez en su dispositivo; compartir el mismo dispositivo entre varios choferes en simultáneo, o reconciliar el mismo recorrido editado desde dos dispositivos distintos, queda fuera de alcance.
- La copia local del recorrido y la cola de acciones pendientes viven en el dispositivo (no se sincronizan entre dispositivos); si el chofer cambia de dispositivo sin haber recuperado conexión antes, lo hecho offline en el dispositivo anterior no se traslada automáticamente.
