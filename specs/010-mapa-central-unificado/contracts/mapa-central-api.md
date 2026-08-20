# Contract: Extensión de `GET /api/central/recorridos/activos` para el mapa consolidado

**Cambio 1**: cada recorrido de `recorridos` agrega el campo `puntos` (mismo
formato ya producido por `serializarPuntosCentral`, usado hoy en
`GET /api/central/recorridos/historial` y `GET /api/central/recorridos/:id`)
y, opcionalmente, `puntoSalida`.

**Cambio 2**: la respuesta agrega el campo de nivel superior
`puntoSalidaDefault`, siempre presente (incluso con `recorridos: []`).

## `GET /api/central/recorridos/activos`

### Response 200 — ANTES

```json
{
  "recorridos": [
    {
      "id": "R-1001",
      "flete": { "id": "F-12", "nombre": "Camión 7" },
      "chofer": { "id": "CH-345", "nombre": "Nora Vidal" },
      "updatedAt": "2026-08-05T13:20:00Z",
      "progreso": { "completados": 1, "arribados": 0, "pendientes": 2 },
      "ultimaUbicacion": { "lat": -34.61, "lon": -58.41, "en": "2026-08-20T12:00:00Z", "reciente": true },
      "viajeEstado": "manejando",
      "puntoActivoId": "P-2",
      "puntoActivo": { "id": "P-2", "orden": 2, "cliente": "Almacén Centro" },
      "esperandoFinalizar": false
    }
  ]
}
```

### Response 200 — DESPUÉS (este cambio)

```json
{
  "recorridos": [
    {
      "id": "R-1001",
      "flete": { "id": "F-12", "nombre": "Camión 7" },
      "chofer": { "id": "CH-345", "nombre": "Nora Vidal" },
      "updatedAt": "2026-08-05T13:20:00Z",
      "progreso": { "completados": 1, "arribados": 0, "pendientes": 2 },
      "ultimaUbicacion": { "lat": -34.61, "lon": -58.41, "en": "2026-08-20T12:00:00Z", "reciente": true },
      "viajeEstado": "manejando",
      "puntoActivoId": "P-2",
      "puntoActivo": { "id": "P-2", "orden": 2, "cliente": "Almacén Centro" },
      "esperandoFinalizar": false,
      "puntos": [
        { "id": "P-1", "orden": 1, "lat": -34.6, "lon": -58.4, "cliente": "Depósito Norte", "estado": "completado", "arriboEn": "...", "descargaEn": "..." },
        { "id": "P-2", "orden": 2, "lat": -34.62, "lon": -58.42, "cliente": "Almacén Centro", "estado": "pendiente", "arriboEn": null, "descargaEn": null }
      ],
      "puntoSalida": null
    }
  ],
  "puntoSalidaDefault": { "lat": -34.8097527, "lon": -58.4574414 }
}
```

`puntoSalida` es `null`/ausente en el caso hoy habitual (el recorrido parte
del punto por defecto); cuando un recorrido trae `puntoSalida` propio desde
Oracle (ver Cambio 3 más abajo), aparece como `{ "lat": ..., "lon": ... }`.

### Response 200 — sin recorridos activos

```json
{
  "recorridos": [],
  "puntoSalidaDefault": { "lat": -34.8097527, "lon": -58.4574414 }
}
```

`puntoSalidaDefault` sigue presente aunque `recorridos` esté vacío (US4,
Acceptance Scenario 1) — el frontend usa este campo para seguir mostrando el
mapa con el punto de salida incluso sin ningún recorrido en curso.

## Cambio 3: `POST /api/integracion/recorridos` (Oracle → Cloud, Endpoint 1)

Se agrega el campo opcional `puntoSalida` al cuerpo de cada recorrido, junto
a `puntos` (ver `specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`):

```json
{
  "source": "oracle-apex",
  "recorridos": [
    {
      "id": "R-1001",
      "token": "a1b2c3d4",
      "fleteId": "F-12",
      "choferId": "CH-345",
      "fleteNombre": "Juan Pérez",
      "estado": "activo",
      "puntoSalida": { "lat": -34.55, "lon": -58.35 },
      "puntos": [{ "id": "P-1", "orden": 1, "estado": "pendiente", "lat": -34.6, "lon": -58.4 }],
      "updatedAt": "2026-08-05T13:20:00Z"
    }
  ]
}
```

- Campo opcional; si se omite (caso hoy habitual), el recorrido no tiene
  `puntoSalida` propio y el mapa usa `puntoSalidaDefault`.
- Es topología fija del recorrido (igual criterio que `puntos[].lat/.lon`),
  no un evento del chofer — se re-sincroniza en cada push como el resto de
  la topología, sin pisar ningún progreso ya confirmado por el chofer (mismo
  criterio ya vigente para `puntos`).

## Errores

Sin cambios respecto a los contratos ya vigentes de 002-panel-control-central
y 003-arquitectura-cloud-mqtt.
