// Decodifica el payload del recorrido embebido en el fragmento de la URL
// (`#/r/<payload-base64url>`, ver ../../specs/004-chofer-cloud-broker/contracts/enlace-recorrido.md).
// El fragmento nunca se envía al servidor que sirve esta SPA: leerlo acá es
// síncrono y no implica ninguna llamada de red (FR-002a).

const PATRON_HASH = /^#\/r\/(.+)$/;
const MAX_PUNTOS = 10; // Principio II de la constitución

function base64UrlAJson(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binario = atob(padded);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

function esPayloadValido(payload) {
  const mqtt = payload?.recorrido?.mqtt;
  if (!mqtt?.url || !mqtt?.username || !mqtt?.password || !mqtt?.ubicacionTopic || !mqtt?.eventosTopic) {
    return false;
  }
  if (!Array.isArray(payload.puntos) || payload.puntos.length === 0 || payload.puntos.length > MAX_PUNTOS) {
    return false;
  }
  return true;
}

/**
 * Lee y valida el payload del fragmento de `window.location.hash`. No
 * distingue en el valor de retorno el motivo del fallo (hash ausente, Base64
 * inválido, JSON inválido, forma inválida): todos devuelven `null`, tratados
 * por igual como "enlace inválido" (FR-007, sin exponer detalles internos).
 */
export function leerPayloadDeUrl() {
  const match = PATRON_HASH.exec(window.location.hash);
  if (!match) return null;

  try {
    const payload = JSON.parse(base64UrlAJson(match[1]));
    return esPayloadValido(payload) ? payload : null;
  } catch {
    return null;
  }
}
