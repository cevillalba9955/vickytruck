// Módulo compartido en memoria para la posición instantánea de un flete
// mientras su recorrido está activo (FR-014 a FR-017 de 001-chofer-recorrido;
// research.md §8 de 002-panel-control-central). Efímero por diseño: no hay
// persistencia, se pierde ante un reinicio del proceso (aceptado por FR-017).
//
// Se exporta como factory (`createUbicacionEnMemoria`) para poder usar
// instancias aisladas en tests, más un singleton (`ubicacionEnMemoriaCompartida`)
// que es el que importan `recorrido.js` (escribe) y `centralRepository.js` (lee)
// en producción, ya que ambos corren en el mismo proceso backend.
export function createUbicacionEnMemoria() {
  const posiciones = new Map();

  return {
    registrar(recorridoId, { lat, lon, en }) {
      posiciones.set(String(recorridoId), { lat, lon, en });
    },

    obtener(recorridoId) {
      return posiciones.get(String(recorridoId)) ?? null;
    },
  };
}

export const ubicacionEnMemoriaCompartida = createUbicacionEnMemoria();
