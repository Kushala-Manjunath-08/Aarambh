import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTwinApiServer } from "./index.js";
import { createRoadNetwork } from "./roadNetwork.js";
import { createTwinSimulation } from "./twinSimulation.js";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("scenario changes emit updated snapshots and reject unknown scenarios", () => {
  const simulation = createTwinSimulation({ intervalMs: 0 });

  try {
    assert.equal(simulation.snapshot().scenarioId, "baseline");
    const rainySnapshot = simulation.setScenario("rain");
    assert.equal(rainySnapshot.scenarioId, "rain");
    assert.ok(rainySnapshot.metrics.flood > simulation.setScenario("baseline").metrics.flood);
    assert.throws(() => simulation.setScenario("unknown"), /Unknown scenario/);
  } finally {
    simulation.close();
  }
});

test("API exposes snapshots, validates commands, and streams telemetry events", async () => {
  const simulation = createTwinSimulation({ intervalMs: 0 });
  const server = createTwinApiServer({ simulation });
  const baseUrl = await listen(server);

  try {
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { status: "ok", source: "simulated" });

    const scenarioResponse = await fetch(`${baseUrl}/api/twin/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "closure" })
    });
    assert.equal(scenarioResponse.status, 200);
    assert.equal((await scenarioResponse.json()).scenarioId, "closure");

    const invalidScenarioResponse = await fetch(`${baseUrl}/api/twin/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "unknown" })
    });
    assert.equal(invalidScenarioResponse.status, 400);

    const streamResponse = await fetch(`${baseUrl}/api/twin/stream`);
    assert.equal(streamResponse.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const reader = streamResponse.body.getReader();
    const firstEvent = await reader.read();
    const eventText = new TextDecoder().decode(firstEvent.value);
    assert.match(eventText, /event: snapshot/);
    assert.match(eventText, /"source":"simulated"/);
    await reader.cancel();
  } finally {
    await close(server);
  }
});

test("routing API calculates real GeoJSON paths and closure detours", async () => {
  const data = JSON.parse(
    await readFile(new URL("../public/data/roads.geojson", import.meta.url), "utf8")
  );
  const simulation = createTwinSimulation({ intervalMs: 0 });
  const roadNetwork = createRoadNetwork(data.features);
  const server = createTwinApiServer({ simulation, roadNetwork });
  const baseUrl = await listen(server);

  try {
    const baselineResponse = await fetch(`${baseUrl}/api/twin/routes`);
    const baseline = await baselineResponse.json();
    assert.equal(baselineResponse.status, 200);
    assert.equal(baseline.scenarioId, "baseline");
    assert.ok(baseline.routes.every((route) => route.status === "available"));

    await fetch(`${baseUrl}/api/twin/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: "closure" })
    });

    const closureResponse = await fetch(`${baseUrl}/api/twin/routes`);
    const closure = await closureResponse.json();
    assert.equal(closure.scenarioId, "closure");
    assert.ok(closure.routes.every((route) =>
      route.status === "available" && Boolean(route.blockedSegment?.roadName)
    ));
  } finally {
    await close(server);
  }
});
