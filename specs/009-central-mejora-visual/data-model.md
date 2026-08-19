# Data Model: Rediseño visual de Central

Esta feature es exclusivamente de presentación (FR-006): no agrega, quita ni
modifica entidades, campos, ni relaciones de datos.

Los componentes restylados siguen consumiendo exactamente las mismas formas
de datos que ya reciben hoy vía `central/src/services/api.js` y
`central/src/services/mqttClient.js`:

- **Recorrido activo** (`MonitorView`): `id`, `flete.nombre`, `progreso`
  (`completados`/`arribados`/`pendientes`), `viajeEstado`, `puntoActivoId`,
  `esperandoFinalizar`, `ultimaUbicacion` (`lat`, `lon`, `en`, `reciente`),
  `updatedAt` — sin cambios de forma ni de origen.
- **Recorrido histórico** (`HistorialView`): `id`, `fleteId`, `puntos`,
  `cierreEn` — sin cambios.
- **Detalle de recorrido** (`RecorridoDetalle`): `recorrido` (`id`, `estado`,
  `fleteId`, `cierreEn`) y `puntos[]` (`id`, `orden`, `estado`, `inicioEn`,
  `arriboEn`, `descargaEn`) — sin cambios.
- **Marcador de mapa** (`MapaSeguimiento`, vía `services/marcadores.js`): sin
  cambios de lógica ni de forma.

No se requiere `contracts/` ni migraciones: no hay endpoints, mensajes MQTT
ni payloads nuevos o modificados por esta feature.
