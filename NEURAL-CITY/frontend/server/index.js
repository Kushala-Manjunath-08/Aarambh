import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createRoadNetwork } from "./roadNetwork.js";
import { createTwinSimulation } from "./twinSimulation.js";

const MAX_BODY_BYTES = 8 * 1024;
const DEFAULT_PORT = 3001;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function sendEvent(response, snapshot) {
  response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
}

async function handleRequest(request, response, simulation, roadNetwork) {
  const requestUrl = new URL(request.url, "http://localhost");

  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, { status: "ok", source: "simulated" });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/snapshot") {
    sendJson(response, 200, simulation.snapshot());
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/routes") {
    if (!roadNetwork) {
      sendJson(response, 503, { error: "Road network data is unavailable." });
      return;
    }

    sendJson(response, 200, {
      scenarioId: simulation.snapshot().scenarioId,
      assumptions: {
        speedModel: "Estimated speeds by OpenStreetMap road class",
        directionality: "Bidirectional; one-way tags are not present in the source data",
        traffic: "No live traffic data is applied"
      },
      routes: roadNetwork.calculateRoutes(simulation.snapshot().scenarioId)
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/stream") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    response.flushHeaders();

    const unsubscribe = simulation.subscribe((snapshot) => {
      if (!response.destroyed) sendEvent(response, snapshot);
    });
    const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 15000);
    heartbeat.unref();
    response.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/twin/scenario") {
    const body = await readJsonBody(request);

    try {
      sendJson(response, 200, simulation.setScenario(body?.scenarioId));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/twin/control") {
    const body = await readJsonBody(request);

    try {
      sendJson(response, 200, simulation.setRunning(body?.running));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: "API endpoint not found." });
}

export function createTwinApiServer({ simulation = createTwinSimulation(), roadNetwork = null } = {}) {
  const server = createServer((request, response) => {
    handleRequest(request, response, simulation, roadNetwork).catch((error) => {
      console.error("NEURAL CITY API error:", error);

      if (!response.headersSent) {
        sendJson(response, error.statusCode ?? 500, {
          error: error.statusCode ? error.message : "The API could not process the request."
        });
      } else {
        response.destroy(error);
      }
    });
  });

  server.on("close", () => simulation.close());
  return server;
}

async function startServer() {
  const port = Number(process.env.API_PORT ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be a valid TCP port.");
  }

  const roadData = JSON.parse(
    await readFile(new URL("../public/data/roads.geojson", import.meta.url), "utf8")
  );
  const roadNetwork = createRoadNetwork(roadData.features);
  const server = createTwinApiServer({ roadNetwork });

  server.listen(port, "127.0.0.1", () => {
    console.log(
      `Neural City simulated API listening on http://127.0.0.1:${port} `
      + `(${roadNetwork.nodeCount} road nodes, ${roadNetwork.edgeCount} segments)`
    );
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close((error) => {
        if (error) {
          console.error("Failed to close Neural City API:", error);
          process.exitCode = 1;
        }
      });
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((error) => {
    console.error("Failed to start Neural City API:", error);
    process.exitCode = 1;
  });
}
