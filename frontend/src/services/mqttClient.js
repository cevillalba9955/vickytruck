import mqtt from "mqtt";

// Cliente MQTT-sobre-WebSocket del chofer: conexión saliente hacia el bróker
// (config.url = wss://..., credenciales por token recibidas en el payload
// embebido en el enlace, ver enlacePayload.js) para publicar ubicación y
// acciones, en vez de llamar directo al backend (003-mqtt-broker-fletes,
// objetivo: evitar exponer IP propia). `clientId` (deviceId.js,
// 004-chofer-cloud-broker) identifica el dispositivo ante el backend para el
// vínculo a primer dispositivo (FR-005a).
let client = null;
let listeners = [];

function emitirEstado(estado, detalle = {}) {
  for (const cb of listeners) {
    try {
      cb({ estado, ...detalle });
    } catch (err) {
      console.error("[mqtt] error en listener de estado:", err?.message || err);
    }
  }
}

/** Conecta (o reutiliza la conexión ya abierta) con la config recibida en el payload embebido. */
export function conectar({ url, username, password, clientId }) {
  if (client) return client;
  emitirEstado("conectando");
  client = mqtt.connect(url, {
    username,
    password,
    clientId,
    reconnectPeriod: 4000,
  });
  // Sin acción correctiva acá (mqtt.js reintenta solo; publish() falla
  // mientras tanto y el llamador decide si encolar, ver offlineQueue.js),
  // pero SÍ se loguea: sin esto, un rechazo de credenciales/ACL es invisible
  // en devtools y parece "no pasa nada" en vez de un error concreto.
  client.on("error", (err) => {
    console.error("[mqtt] error de conexión:", err?.message || err);
    emitirEstado("error", { mensaje: err?.message });
  });
  client.on("connect", () => emitirEstado("conectado"));
  client.on("reconnect", () => emitirEstado("conectando"));
  client.on("close", () => {
    console.warn("[mqtt] conexión cerrada, reintentando…");
    emitirEstado("desconectado", { motivo: "red" });
  });
  // Paquete DISCONNECT enviado por el bróker (solo si la conexión negocia
  // MQTT5): posible expulsión administrativa por vínculo a otro dispositivo
  // (FR-005a, ver contracts/vinculo-dispositivo.md). No todo mecanismo de
  // "kick" del bróker garantiza enviar este paquete antes de cortar la
  // conexión — si nunca llega, el consumidor de onEstadoCambio ve el
  // "desconectado"/motivo:"red" genérico de arriba (fallback aceptado,
  // research.md §3).
  client.on("disconnect", (packet) => {
    emitirEstado("desconectado", { motivo: "expulsado", reasonCode: packet?.reasonCode });
  });
  return client;
}

/**
 * Suscribe `cb({ estado, motivo?, mensaje?, reasonCode? })` a los cambios de
 * estado de la conexión (`conectando`/`conectado`/`desconectado`/`error`,
 * FR-008 y FR-005a). Devuelve una función para desuscribirse.
 */
export function onEstadoCambio(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

/** Publica un mensaje JSON en `topic`. Rechaza si no hay conexión activa. */
export function publicar(topic, payload, { qos = 0, retain = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!client) return reject(new Error("mqtt_no_conectado"));
    client.publish(topic, JSON.stringify(payload), { qos, retain }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Cierra la conexión (uso en tests/cleanup). */
export function desconectar() {
  if (client) {
    client.end(true);
    client = null;
  }
}
