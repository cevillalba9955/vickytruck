import { test } from "node:test";
import assert from "node:assert/strict";
import { createDeduplicadorEventos } from "../../src/services/mqttBridge.js";

test("createDeduplicadorEventos detecta duplicados por eventId", () => {
  const dedupe = createDeduplicadorEventos(3);

  assert.equal(dedupe.yaVisto("evt-1"), false);
  assert.equal(dedupe.yaVisto("evt-1"), true);
  assert.equal(dedupe.yaVisto("evt-2"), false);
});

test("createDeduplicadorEventos recorta memoria al exceder límite", () => {
  const dedupe = createDeduplicadorEventos(2);

  assert.equal(dedupe.yaVisto("evt-a"), false);
  assert.equal(dedupe.yaVisto("evt-b"), false);
  assert.equal(dedupe.yaVisto("evt-c"), false);

  // evt-a pudo haber sido desalojado por límite.
  assert.equal(dedupe.yaVisto("evt-a"), false);
});
