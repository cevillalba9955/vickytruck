# Contract: Extensión de `GET /api/central/recorridos/:id` (y `/historial`) para el mapa

**Cambio**: se agregan los campos `lat`/`lon` a cada punto en la respuesta de
`GET /api/central/recorridos/:id` (`backend/src/routes/central.js`, Historia
3 de 002-panel-control-central). El campo ya existe en el modelo interno
(`punto.lat`/`punto.lon`, ver `backend/src/state/integracionStore.js`); antes
no se serializaba hacia Central porque no había ningún consumidor.

Como ambos endpoints comparten la misma función de serialización
(`serializarPuntosCentral`), `GET /api/central/recorridos/historial`
(Historia 5) también gana estos campos como efecto colateral inevitable de
no duplicar la función (ver research.md, Decisión 2) — es un campo adicional
opcional, no rompe ningún consumidor existente de ese endpoint.

## `GET /api/central/recorridos/:id`

### Response 200 — ANTES

```json
{
  "recorrido": { "id": "R-1001", "estado": "activo", "fleteId": "F-12" },
  "puntos": [
    { "id": "P-1", "orden": 1, "estado": "arribado", "arriboEn": "2026-08-05T13:31:00Z", "descargaEn": null }
  ]
}
```

### Response 200 — DESPUÉS (este cambio)

```json
{
  "recorrido": { "id": "R-1001", "estado": "activo", "fleteId": "F-12" },
  "puntos": [
    {
      "id": "P-1",
      "orden": 1,
      "lat": -34.61,
      "lon": -58.41,
      "estado": "arribado",
      "arriboEn": "2026-08-05T13:31:00Z",
      "descargaEn": null
    }
  ]
}
```

`lat`/`lon` son la topología fija del punto (destino de entrega), la misma
que ya viaja en `POST /api/integracion/recorridos` — **no** son el GPS de
auditoría de arribo/descarga (`arriboLat`/`arriboLon`, ver
`specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`), que sigue
sin exponerse a Central (no está en el alcance de esta feature).

## `GET /api/central/recorridos/activos` — sin cambios

Ya expone `ultimaUbicacion.lat`/`.lon` (ver
`specs/003-arquitectura-cloud-mqtt/data-model.md`, "Derivados de solo
lectura"). El mapa de la vista general (Historia 1) no requiere ningún
cambio de contrato.

## Errores

Sin cambios respecto al contrato ya vigente de 002-panel-control-central
(`404 recorrido_no_encontrado` si el `id` no existe).
