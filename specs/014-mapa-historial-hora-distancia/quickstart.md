# Quickstart: Validar hora y alerta de distancia mínima en el mapa de Detalle

## Prerrequisitos

- Node.js instalado (mismo que usa el resto del monorepo).
- Dependencias del frontend `central` instaladas: `npm install` dentro de
  `central/`.
- Un backend (real o el repositorio en memoria de test) con al menos:
  - un recorrido **finalizado** con un punto de entrega cuya posición de
    llegada/descarga registrada esté claramente fuera de 500 m de su
    destino, y otro punto dentro de rango, para ver ambos casos a la vez;
  - ubicación de inicio (`inicioEn/inicioLat/inicioLon` en algún punto) y de
    cierre (`cierreEn/cierreLat/cierreLon` en el recorrido) presentes;
  - opcionalmente, un recorrido **activo** con al menos un punto ya
    `completado` (con `arriboEn`/`descargaEn` registrados), para validar
    que la misma información aparece también en el Detalle abierto desde
    Monitoreo (Clarifications, sesión 2026-09-16).

## Pasos

1. Pruebas unitarias de la lógica pura (sin levantar el mapa):
   ```bash
   cd central
   npx vitest run tests/components/marcadores.test.js tests/services/tiempo.test.js
   ```
   Esperado: casos nuevos de `construirPuntosEnMapa` (hora + `alerta` por
   evento), `construirMarcadorExtremo` (con y sin coordenadas) y
   `formatearHoraCorta` (hh:mm) en verde.

2. Pruebas de componente:
   ```bash
   npx vitest run tests/components/MapaSeguimiento.test.jsx tests/components/RecorridoDetalle.test.jsx
   ```
   Esperado: casos nuevos que verifican que un punto fuera de rango se
   distingue visualmente del que está dentro de rango, y que aparecen los
   marcadores de inicio/cierre cuando hay datos.

3. Validación manual en el navegador:
   ```bash
   cd central
   npm run dev
   ```
   - Abrir Central, ir a **Historial**, abrir "Ver línea de tiempo" de un
     recorrido finalizado que cumpla los prerrequisitos.
   - En el mapa: pasar el mouse (o tocar) sobre cada punto de entrega y
     verificar que se ve la hora (hh:mm) de llegada/descarga, y que el
     punto fuera de distancia mínima se distingue visualmente del resto
     (Historia 1).
   - Verificar que aparece un marcador de inicio y uno de cierre, cada uno
     con su hora (hh:mm), distintos entre sí y de los puntos de entrega
     (Historia 2).
   - Repetir sobre un recorrido **activo** abierto desde **Monitoreo** ("Ver
     detalle") con al menos un punto ya completado: la misma información
     (hora + alerta) debe verse igual, sin depender de si el recorrido ya
     cerró (Clarifications).

## Resultado esperado

- Ningún cambio de comportamiento en la tabla de puntos del Detalle (sigue
  igual que antes).
- Ningún cambio de contrato de red — mismas llamadas a
  `GET /api/central/recorridos/:id` y `GET
  /api/central/recorridos/historial` que ya existían.
