// Fake de emqxProvisioning para tests de contrato/integración: implementa el
// mismo contrato que createEmqxProvisioning() (provisionarCredencial/
// provisionarCredencialChofer/revocarCredencial) sin llamar a la API real de
// EMQX Cloud.
export function createFakeEmqxProvisioning() {
  const credenciales = new Map();
  const credencialesChofer = new Map();
  const revocados = [];

  return {
    async provisionarCredencial(fleteId) {
      const credencial = { username: `chofer-${fleteId}`, password: `fake-pass-${fleteId}` };
      credenciales.set(fleteId, credencial);
      return credencial;
    },
    // 2026-08-10 (spec.md FR-013): a diferencia de provisionarCredencial,
    // llamadas repetidas con el mismo choferId devuelven siempre la misma
    // credencial (contador de llamadas expuesto vía _llamadasChofer para que
    // los tests puedan validar la persistencia entre recorridos).
    async provisionarCredencialChofer(choferId) {
      const credencial = credencialesChofer.get(choferId) ?? {
        username: `chofer-${choferId}`,
        password: `fake-pass-chofer-${choferId}`,
      };
      credencialesChofer.set(choferId, credencial);
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
    _tieneCredencialChofer(choferId) {
      return credencialesChofer.has(choferId);
    },
    _revocados() {
      return [...revocados];
    },
  };
}
