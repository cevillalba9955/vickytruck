// Script de desarrollo: levanta el backend local (si no está corriendo ya),
// le empuja un recorrido de prueba vía POST /api/integracion/recorridos
// (mismo contrato que usa Oracle/APEX, ver
// specs/003-arquitectura-cloud-mqtt/contracts/integracion-api.md) y muestra
// el link con el token para abrir en el frontend del chofer — no forma
// parte de `npm test` (vive en scripts/, node --test no lo escanea).
//
// Uso:
//   npm run dev:seed
//   npm run dev:seed -- --token=mi-token --puntos=5
//   npm run dev:seed -- --sin-backend   (solo seedea, asume que ya corre)

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = join(__dirname, "..");

function parseArgs(argv) {
  const args = { puntos: 3 };
  for (const raw of argv) {
    const [clave, valor] = raw.replace(/^--/, "").split("=");
    if (clave === "token") args.token = valor;
    else if (clave === "puntos") args.puntos = Number(valor) || 3;
    else if (clave === "sin-backend") args.sinBackend = true;
  }
  return args;
}

function puerto() {
  return Number(process.env.PORT || 3001);
}

function baseUrl() {
  return `http://localhost:${puerto()}`;
}

async function backendResponde() {
  try {
    const res = await fetch(`${baseUrl()}/api/recorridos/__healthcheck__`);
    return res.status === 404; // "enlace_invalido": el server está arriba y respondiendo
  } catch {
    return false;
  }
}

async function esperarBackend({ intentos = 30, esperaMs = 500 } = {}) {
  for (let i = 0; i < intentos; i++) {
    if (await backendResponde()) return true;
    await new Promise((resolve) => setTimeout(resolve, esperaMs));
  }
  return false;
}

function arrancarBackend() {
  const proceso = spawn(process.execPath, ["--env-file-if-exists=.env", "src/server.js"], {
    cwd: BACKEND_DIR,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  proceso.unref();
  return proceso.pid;
}

function generarPuntos(cantidad) {
  const base = [
    { cliente: "Distribuidora Sur SRL", direccion: "Av. Rivadavia 1234, CABA", rangoHorario: "09:00-12:00", notasEntrega: "Tocar timbre de depósito", remitoIds: ["R-1001", "R-1002"] },
    { cliente: "Kiosco El Águila", direccion: "Av. Siempreviva 742" },
    { cliente: "Ferretería Norte", direccion: "Ruta 8 km 45", rangoHorario: "14:00-18:00" },
    { cliente: "Almacén Don José", direccion: "Calle Corrientes 5678", notasEntrega: "Entrar por el fondo" },
    { cliente: "Cliente Genérico" },
  ];
  const puntos = [];
  for (let i = 0; i < cantidad; i++) {
    const info = base[i % base.length];
    puntos.push({
      id: `p${i + 1}`,
      orden: i + 1,
      estado: "pendiente",
      lat: -34.6 - i * 0.01,
      lon: -58.38 - i * 0.01,
      ...info,
    });
  }
  return puntos;
}

async function seedearRecorrido(token, cantidadPuntos) {
  const apiKey = process.env.INTEGRACION_API_KEY;
  if (!apiKey) {
    throw new Error(
      "INTEGRACION_API_KEY no está configurado (ver backend/.env / .env.example) — sin esto POST /api/integracion/recorridos devuelve 401.",
    );
  }

  const recorridoId = `R-DEV-${token}`;
  const payload = {
    source: "oracle-apex",
    recorridos: [
      {
        id: recorridoId,
        token,
        fleteId: `F-DEV-${token}`,
        fleteNombre: "Chofer de Prueba (dev-seed)",
        estado: "activo",
        puntos: generarPuntos(cantidadPuntos),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(`${baseUrl()}/api/integracion/recorridos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new Error(`POST /api/integracion/recorridos devolvió ${res.status}: ${texto}`);
  }

  return recorridoId;
}

function frontendUrl(token) {
  const base = process.env.FRONTEND_DEV_URL || "http://localhost:5173";
  return `${base}/?token=${encodeURIComponent(token)}`;
}

export async function run({ argv = process.argv.slice(2), print = console.log, error = console.error } = {}) {
  const args = parseArgs(argv);
  const token = args.token || `dev-${Date.now()}`;

  if (!args.sinBackend) {
    if (await backendResponde()) {
      print(`[dev-seed] Backend ya está corriendo en ${baseUrl()}.`);
    } else {
      print(`[dev-seed] Arrancando backend (puerto ${puerto()})...`);
      const pid = arrancarBackend();
      print(`[dev-seed] Backend arrancado en segundo plano (PID ${pid}). Para detenerlo más tarde: taskkill /PID ${pid} /F (Windows) o kill ${pid}.`);
      const listo = await esperarBackend();
      if (!listo) {
        error(`[dev-seed] FALLO: el backend no respondió en ${baseUrl()} tras esperar. Revisar logs (¿falta backend/.env? ¿puerto ${puerto()} ocupado?).`);
        return 1;
      }
    }
  }

  print(`[dev-seed] Sincronizando recorrido de prueba (token "${token}", ${args.puntos} puntos)...`);
  try {
    const recorridoId = await seedearRecorrido(token, args.puntos);
    print(`[dev-seed] Recorrido "${recorridoId}" sincronizado.`);
  } catch (err) {
    error(`[dev-seed] FALLO al sincronizar: ${err.message}`);
    return 1;
  }

  print("");
  print("========================================================");
  print(`  Link del chofer:  ${frontendUrl(token)}`);
  print("========================================================");
  print("");
  print(`  Si el frontend todavía no está corriendo: cd frontend && npm run dev`);
  print(`  Consultar el estado en Central (si corre): cd central && npm run dev`);

  return 0;
}

const esModuloPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esModuloPrincipal) {
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(`[dev-seed] Error fatal: ${err.message}`);
      process.exitCode = 1;
    });
}
