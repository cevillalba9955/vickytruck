// Fake de emqxProvisioning para tests de contrato/integración: implementa el
// mismo contrato que createEmqxProvisioning() (provisionarCredencial/
// revocarCredencial) sin llamar a la API real de EMQX Cloud.
export function createFakeEmqxProvisioning() {
  const credenciales = new Map();
  const revocados = [];
  const expulsados = []; // 004-chofer-cloud-broker (FR-005a)

  return {
    async provisionarCredencial(token) {
      const credencial = { username: token, password: `fake-pass-${token}` };
      credenciales.set(token, credencial);
      return credencial;
    },
    async revocarCredencial(token) {
      if (!token) return;
      credenciales.delete(token);
      revocados.push(token);
    },
    async expulsarCliente(clientId) {
      if (!clientId) return;
      expulsados.push(clientId);
    },
    // Helpers de inspección, solo para tests.
    _tieneCredencial(token) {
      return credenciales.has(token);
    },
    _revocados() {
      return [...revocados];
    },
    _expulsados() {
      return [...expulsados];
    },
  };
}
