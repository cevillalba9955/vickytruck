function credencialesConfiguradas() {
  return Boolean(process.env.INTEGRACION_API_KEY || process.env.INTEGRACION_BEARER_TOKEN);
}

function tokenBearer(req) {
  const raw = req.headers.authorization || "";
  if (!raw.startsWith("Bearer ")) return null;
  return raw.slice("Bearer ".length).trim();
}

export function validarAuthIntegracion(req, res, next) {
  if (!credencialesConfiguradas()) {
    return res.status(503).json({ error: "integracion_auth_no_configurada" });
  }

  const apiKey = req.headers["x-api-key"];
  const bearer = tokenBearer(req);

  if (process.env.INTEGRACION_API_KEY && apiKey === process.env.INTEGRACION_API_KEY) {
    return next();
  }

  if (process.env.INTEGRACION_BEARER_TOKEN && bearer === process.env.INTEGRACION_BEARER_TOKEN) {
    return next();
  }

  return res.status(401).json({ error: "unauthorized" });
}
