import { SCENARIOS } from "../scenario-config.js";

const scenarioById = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function createTwinSimulation({ intervalMs = 5000, now = () => new Date() } = {}) {
  let scenarioId = "baseline";
  let tick = 0;
  let running = true;
  const listeners = new Set();

  function getSnapshot() {
    const baseline = scenarioById.get(scenarioId).metrics;

    return {
      schemaVersion: 1,
      source: "simulated",
      timestamp: now().toISOString(),
      tick,
      scenarioId,
      running,
      metrics: {
        traffic: Math.round(clamp(baseline.traffic + Math.sin(tick * 0.7) * 4, 0, 100)),
        flood: Math.round(clamp(baseline.flood + Math.cos(tick * 0.45) * 3, 0, 100)),
        pressure: Number(clamp(baseline.pressure + Math.sin(tick * 0.35) * 0.08, 0, 8).toFixed(2)),
        power: Math.round(clamp(baseline.power + Math.cos(tick * 0.5) * 2, 0, 100))
      }
    };
  }

  function broadcast() {
    const snapshot = getSnapshot();

    for (const listener of listeners) {
      listener(snapshot);
    }

    return snapshot;
  }

  const intervalId = intervalMs > 0
    ? setInterval(() => {
        if (!running) return;
        tick += 1;
        broadcast();
      }, intervalMs)
    : null;

  intervalId?.unref();

  return {
    snapshot: getSnapshot,
    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Simulation listener must be a function.");
      }

      listeners.add(listener);
      listener(getSnapshot());
      return () => listeners.delete(listener);
    },
    setScenario(nextScenarioId) {
      if (!scenarioById.has(nextScenarioId)) {
        throw new RangeError(`Unknown scenario: ${nextScenarioId}`);
      }

      scenarioId = nextScenarioId;
      return broadcast();
    },
    setRunning(nextRunning) {
      if (typeof nextRunning !== "boolean") {
        throw new TypeError("Simulation running state must be a boolean.");
      }

      running = nextRunning;
      return broadcast();
    },
    close() {
      if (intervalId) clearInterval(intervalId);
      listeners.clear();
    }
  };
}
