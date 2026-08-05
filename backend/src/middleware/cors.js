// CORS mínimo, sin dependencia extra: frontend/central se sirven como
// Workers de Cloudflare (otro origen) y llaman directo a este backend en
// Fly.io (ver docs/deploy-cloud.md). Allowlist explícita por env var en vez
// de "*" — /api/central no tiene autenticación propia, así que abrir a
// cualquier origen expondría datos operativos (recorridos, nombres de
// flete) a cualquier sitio de terceros.
function origenesPermitidos() {
  return (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && origenesPermitidos().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization");
  }

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
}
