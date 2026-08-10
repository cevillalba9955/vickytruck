# Contract: extensiones a integración Oracle y a Central

Deltas sobre contratos ya existentes — no reemplazan los documentos
originales, los extienden.

## 1. `POST /api/integracion/recorridos` (Oracle/APEX → cloud)

Extiende `specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`,
Endpoint 1. Cada punto del payload de `sincronizar_recorrido` puede incluir
ahora (todos opcionales, FR-001/FR-004):

```json
{
  "id": "P-1",
  "orden": 1,
  "estado": "pendiente",
  "lat": -34.6,
  "lon": -58.4,
  "cliente": "Distribuidora Sur SRL",
  "direccion": "Av. Rivadavia 1234, CABA",
  "rangoHorario": "09:00–12:00",
  "notasEntrega": "Tocar timbre de depósito, no el de oficina",
  "remitoIds": ["R-8801", "R-8802"]
}
```

- `remitoIds` reemplaza cualquier `remito_id` singular que Oracle enviara
  antes de esta feature; puede ser `[]` o estar ausente (se trata como `[]`).
- Si el recorrido tiene una reorden de chofer sin sincronizar
  (`ultimaOperacion.tipo === "ir-primero" && !sincronizada`), el `orden` que
  venga en este push **no se aplica** a los puntos `pendiente` afectados
  hasta que Oracle haya leído el orden vigente vía el Endpoint 2 extendido
  abajo (research.md, Decisión 4) — evita que un push con el orden viejo
  pise el reordenamiento del chofer antes de que Oracle se entere.

## 2. `GET /api/integracion/estado` (Oracle/APEX ← cloud) — agrega `orden`

Extiende `specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md`,
Endpoint 2, que hoy solo expone `estado`/timestamps/GPS de evento por punto.

**Response 200 (ejemplo)**
```json
{
  "recorridos": [
    {
      "id": "R-1001",
      "estado": "activo",
      "puntos": [
        {
          "id": "P-1",
          "orden": 1,
          "estado": "arribado",
          "arriboEn": "2026-08-07T13:31:00Z",
          "arriboLat": -34.61,
          "arriboLon": -58.41,
          "descargaEn": null,
          "descargaLat": null,
          "descargaLon": null
        }
      ]
    }
  ]
}
```

`orden` es el nuevo campo (antes ausente). Representa el orden vigente en el
cloud en este momento — incluye cualquier reordenamiento hecho por el chofer
vía `IR PRIMERO` que Oracle todavía no tenía. **Efecto colateral de este
endpoint**: servir una respuesta que incluye un recorrido marca
`ultimaOperacion.sincronizada = true` para ese recorrido si tenía una
operación de viaje pendiente de confirmar (research.md, Decisión 3) — leer
este endpoint ya no es 100% sin efectos secundarios como lo era antes de
esta feature (antes solo leía; ahora también "confirma" hacia el chofer que
Oracle se enteró).

**Dependencia fuera de este repo**: para que `orden` sea real order
autoritativo end-to-end (FR-016), el proceso Oracle/APEX que consume este
endpoint debe empezar a leer también `orden` y persistirlo en
`V_PUNTOS_ENTREGA.ORDEN` antes de su próximo `sincronizar_recorrido`. Este
plan solo puede garantizar el lado cloud del contrato; el trabajo del lado
Oracle es una dependencia externa a coordinar (no es una tarea de esta
feature, ver tasks.md/plan.md Complexity Tracking).

## 3. `GET /api/central/recorridos/activos`, `.../:id`, `.../historial` — agregan `viajeEstado`, `puntoActivoId`, `remitoIds`

Extiende los endpoints ya documentados implícitamente por
`specs/004-mapa-seguimiento-central/`.

**`GET /api/central/recorridos/activos` (ejemplo)**
```json
{
  "recorridos": [
    {
      "id": "R-1001",
      "flete": { "id": "F-12", "nombre": "Juan Pérez" },
      "progreso": { "pendientes": 6, "arribados": 0, "completados": 3 },
      "ultimaUbicacion": { "lat": -34.6, "lon": -58.4, "en": "2026-08-07T13:30:00Z" },
      "viajeEstado": "manejando",
      "puntoActivoId": "p3"
    }
  ]
}
```

**`GET /api/central/recorridos/:id` y `.../historial`** (vía
`serializarPuntosCentral`) agregan `remitoIds` a cada punto — visible para
Central (FR-003, "control interno"), no visible para el chofer.

```json
{
  "recorrido": { "id": "R-1001", "estado": "activo", "fleteId": "F-12" },
  "puntos": [
    { "id": "p3", "orden": 1, "lat": -34.6, "lon": -58.4, "estado": "pendiente", "arriboEn": null, "descargaEn": null, "remitoIds": ["R-8801", "R-8802"] }
  ]
}
```

`cliente`/`direccion`/`rangoHorario`/`notasEntrega` **no** se agregan a
estos endpoints de Central en esta feature — la spec 005 solo exige esos
campos para el chofer (FR-002); extenderlos a Central queda fuera de
alcance salvo que una feature futura lo pida explícitamente.
