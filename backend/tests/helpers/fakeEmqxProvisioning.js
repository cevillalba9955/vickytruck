// Fake de emqxProvisioning para tests de contrato/integración: implementa el
// mismo contrato que createEmqxProvisioning() (provisionarCredencial/
// revocarCredencial) sin llamar a la API real de EMQX Cloud.
export function createFakeEmqxProvisioning() {
  const credenciales = new Map();
  const revocados = [];

  return {
    async provisionarCredencial(fleteId) {
      const credencial = { username: `chofer-${fleteId}`, password: `fake-pass-${fleteId}` };
      credenciales.set(fleteId, credencial);
      return credencial;
    },
    async revocarCredencial(fleteId) {
      if (!fleteId) return;
      credenciales.delete(fleteId);
      revocados.push(fleteId);
    },
    // Helpers de inspección, solo para tests.
    _tieneCredencial(fleteId) {
      return credenciales.has(fleteId);
    },
    _revocados() {
      return [...revocados];
    },
  };
}
