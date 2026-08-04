/**
 * FR-011/FR-012 (Principio III): Central debe funcionar embebida en un
 * iframe dentro de una página Oracle APEX y degradar de forma segura si se
 * abre fuera de ese contexto.
 */
export function estaEmbebidoEnIframe() {
  try {
    return window.self !== window.top;
  } catch {
    // Acceso a window.top bloqueado por política de origen cruzado: sigue
    // siendo un caso embebido (en un frame de otro origen), no el caso a
    // bloquear.
    return true;
  }
}
