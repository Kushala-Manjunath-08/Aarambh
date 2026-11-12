import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  CloudRain,
  Droplets,
  Layers3,
  MapPin,
  Pause,
  Play,
  Radio,
  Route,
  ShieldAlert,
  Signal,
  Sparkles,
  Timer,
  Zap
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import CityScene from "./components/city/CityScene";
import { SCENARIOS } from "../scenario-config.js";
import "./App.css";

const METRICS = {
  traffic: { label: "Traffic load", unit: "%", color: "#f5a640", icon: Activity },
  flood: { label: "Flood risk", unit: "%", color: "#45b7d1", icon: CloudRain },
  pressure: { label: "Water pressure", unit: "bar", color: "#5b9eff", icon: Droplets }
};

const LAYER_OPTIONS = [
  { id: "buildings", label: "Buildings", color: "#e7e9ed" },
  { id: "roads", label: "Roads", color: "#f8b457" },
  { id: "risk", label: "Risk zones", color: "#fb7185" },
  { id: "sensors", label: "IoT nodes", color: "#61d8b2" },
  { id: "utilities", label: "Utility routes", color: "#70a9ff", schematic: true }
];

const EMPTY_METRICS = { traffic: 0, flood: 0, pressure: 0, power: 0 };

function isTwinSnapshot(value) {
  return value?.schemaVersion === 1
    && value.source === "simulated"
    && Number.isInteger(value.tick)
    && typeof value.timestamp === "string"
    && SCENARIOS.some((scenario) => scenario.id === value.scenarioId)
    && typeof value.running === "boolean"
    && ["traffic", "flood", "pressure", "power"].every(
      (key) => Number.isFinite(value.metrics?.[key])
    );
}

function isRouteResponse(value, expectedScenario) {
    return value?.scenarioId === expectedScenario
      && Array.isArray(value.routes)
      && value.routes.every((route) =>
        typeof route.id === "string"
        && typeof route.origin === "string"
        && typeof route.destination === "string"
        && (route.status === "unavailable"
          || (
            route.status === "available"
            && Number.isFinite(route.estimatedMinutes)
            && Number.isFinite(route.distanceKm)
            && Array.isArray(route.coordinates)
            && route.coordinates.length > 1
          ))
      );
}

function makeForecast(metricId, snapshot, tick) {
  const value = snapshot[metricId];
  const maximum = metricId === "pressure" ? 6 : 100;
  const trend = metricId === "flood" ? 1.4 : metricId === "traffic" ? 0.7 : -0.015;
  const amplitude = metricId === "pressure" ? 0.12 : 4;

  return Array.from({ length: 12 }, (_, index) => {
    const offset = index - 5;
    const projected = Math.max(
      0,
      Math.min(maximum, value + offset * trend + Math.sin((index + tick) * 0.7) * amplitude)
    );

    return {
      time: index < 6 ? `${(6 - index) * 10}m ago` : `+${(index - 5) * 10}m`,
      observed: index <= 5 ? (metricId === "pressure" ? Number(projected.toFixed(2)) : Math.round(projected)) : null,
      forecast: index >= 5 ? (metricId === "pressure" ? Number(projected.toFixed(2)) : Math.round(projected)) : null
    };
  });
}

function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function MetricCard({ title, value, unit, status, icon: Icon, tone, trend }) {
  const TrendIcon = trend >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="metric-copy">
        <span className="metric-title">{title}</span>
        <div className="metric-value">
          <strong>{value}</strong>
          <span>{unit}</span>
        </div>
        <span className="metric-status">{status}</span>
      </div>
      <span className={`metric-trend ${trend >= 0 ? "trend-up" : "trend-down"}`}>
        <TrendIcon size={14} />
        {Math.abs(trend)}%
      </span>
    </article>
  );
}

function App() {
  const [chartMetric, setChartMetric] = useState("traffic");
  const [snapshot, setSnapshot] = useState(null);
  const [connectionState, setConnectionState] = useState("connecting");
  const [apiError, setApiError] = useState("");
  const [layers, setLayers] = useState({
    buildings: true,
    roads: true,
    risk: true,
    sensors: true,
    utilities: false
  });
  const [mapStats, setMapStats] = useState({ buildings: 0, roads: 0 });
  const [routeData, setRouteData] = useState({ requestKey: "", routes: [], error: "" });
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [routeVersion, setRouteVersion] = useState(0);
  const [planGenerated, setPlanGenerated] = useState(false);

  useEffect(() => {
    const stream = new EventSource("/api/twin/stream");

    stream.onopen = () => setConnectionState("connecting");
    stream.addEventListener("snapshot", (event) => {
      try {
        const nextSnapshot = JSON.parse(event.data);

        if (!isTwinSnapshot(nextSnapshot)) {
          throw new Error("Telemetry API returned an invalid snapshot.");
        }

        setSnapshot(nextSnapshot);
        setConnectionState("connected");
        setApiError("");
      } catch (error) {
        setApiError(error.message);
      }
    });
    stream.onerror = () => {
      setConnectionState("reconnecting");
      setApiError("Telemetry stream disconnected. Retrying connection…");
    };

    return () => stream.close();
  }, []);

  const sendCommand = useCallback(async (path, body) => {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? `API request failed (${response.status}).`);
      }
      if (!isTwinSnapshot(result)) {
        throw new Error("Telemetry API returned an invalid command response.");
      }

      setSnapshot(result);
      setConnectionState("connected");
      setApiError("");
    } catch (error) {
      setApiError(error.message);
    }
  }, []);

  const hasSnapshot = snapshot !== null;
  const metrics = snapshot?.metrics ?? EMPTY_METRICS;
  const scenarioId = snapshot?.scenarioId ?? "baseline";
  const isRunning = snapshot?.running ?? false;
  const tick = snapshot?.tick ?? 0;
  const updatedAt = snapshot?.timestamp;
  const routeRequestKey = `${scenarioId}:${routeVersion}`;
  const hasCurrentRouteData = routeData.requestKey === routeRequestKey;
  const routes = hasCurrentRouteData ? routeData.routes : [];
  const routesLoading = hasSnapshot && connectionState === "connected" && !hasCurrentRouteData;
  const routesError = hasCurrentRouteData ? routeData.error : "";
  const forecast = useMemo(
    () => hasSnapshot ? makeForecast(chartMetric, metrics, tick) : [],
    [chartMetric, hasSnapshot, metrics, tick]
  );
  const selectedRoute = routes.find((route) => route.id === selectedRouteId);
  const mapMetricUpdate = useCallback((stats) => setMapStats(stats), []);
  const selectedMetric = METRICS[chartMetric];
  const alertCount = scenarioId === "rain" ? 4 : scenarioId === "closure" ? 3 : 1;
  const pressureStatus = metrics.pressure < 3.4 ? "Pressure below target" : "Within operating range";
  const trafficStatus =
    metrics.traffic > 70 ? "Heavy corridor congestion" : metrics.traffic > 50 ? "Elevated flow" : "Flow is moving";
  const floodStatus = metrics.flood > 65 ? "High waterlogging risk" : metrics.flood > 35 ? "Watch conditions" : "Low local risk";

  useEffect(() => {
    if (!hasSnapshot || connectionState !== "connected") return undefined;

    let cancelled = false;

    async function loadRoutes() {
      try {
        const response = await fetch("/api/twin/routes");
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error ?? `Route request failed (${response.status}).`);
        }
        if (!isRouteResponse(result, scenarioId)) {
          throw new Error("Routing API returned an invalid result.");
        }
        if (!cancelled) {
          setSelectedRouteId(result.routes.find((route) => route.status === "available")?.id ?? "");
          setRouteData({ requestKey: routeRequestKey, routes: result.routes, error: "" });
        }
      } catch (error) {
        if (!cancelled) setRouteData({ requestKey: routeRequestKey, routes: [], error: error.message });
      }
    }

    void loadRoutes();

    return () => {
      cancelled = true;
    };
  }, [connectionState, hasSnapshot, routeRequestKey, scenarioId]);

  const toggleLayer = (layerId) => {
    setLayers((currentLayers) => ({
      ...currentLayers,
      [layerId]: !currentLayers[layerId]
    }));
  };

  const selectScenario = (nextScenario) => {
    setPlanGenerated(false);
    void sendCommand("/api/twin/scenario", { scenarioId: nextScenario });
  };

  const recommendations =
    scenarioId === "rain"
      ? ["Stage 3 drainage crews near risk zones", "Inspect 2 low-lying road segments", "Keep 1 emergency route clear"]
      : scenarioId === "closure"
        ? ["Divert traffic at the north junction", "Stage 2 response units on alternate roads", "Notify 3 downstream intersections"]
        : scenarioId === "drainage"
          ? ["Monitor the upgraded drainage segment", "Keep 1 inspection crew on standby", "Review water-level readings in 15 min"]
          : scenarioId === "signals"
            ? ["Apply the retimed signal plan", "Monitor queues at 2 junctions", "Recheck corridor travel time in 10 min"]
            : ["Keep 2 traffic units on standby", "Inspect 1 water-pressure anomaly", "Review corridor demand in 15 min"];

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Neural City dashboard home">
          <span className="brand-mark"><Activity size={21} /></span>
          <span className="brand-name">NEURAL<span>CITY</span></span>
        </a>
        <div className="topbar-right">
          <div className="workspace-label">
            <span className="eyebrow">DIGITAL TWIN</span>
            <strong>Yelahanka, Bengaluru</strong>
          </div>
          <div className={`feed-badge feed-${connectionState}`}>
            <span className="feed-dot" />
            {connectionState === "connected" ? "SIMULATED STREAM" : connectionState === "reconnecting" ? "RECONNECTING" : "CONNECTING"}
          </div>
          <button
            className="run-toggle"
            type="button"
            disabled={!hasSnapshot || connectionState !== "connected"}
            onClick={() => void sendCommand("/api/twin/control", { running: !isRunning })}
            aria-label={isRunning ? "Pause simulation" : "Resume simulation"}
          >
            {isRunning ? <Pause size={15} /> : <Play size={15} />}
            {isRunning ? "Pause" : "Resume"}
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="page-heading">
          <div>
            <div className="eyebrow page-eyebrow"><MapPin size={13} /> URBAN OPERATIONS / KARNATAKA</div>
            <h1>City intelligence, <span>in motion.</span></h1>
            <p>Explore infrastructure conditions, test interventions, and review their projected impact.</p>
          </div>
          <div className="updated-at">
            <Clock3 size={15} />
            <span>{updatedAt ? `Updated ${formatClock(updatedAt)}` : "Waiting for telemetry"}</span>
            <span className="cadence">· 5 sec cadence</span>
          </div>
        </section>

        {apiError && <div className="stream-error" role="alert">{apiError}</div>}

        <section className="metrics-grid" aria-label="Current city conditions">
          <MetricCard title="Traffic load" value={hasSnapshot ? metrics.traffic : "—"} unit="%" status={hasSnapshot ? trafficStatus : "Waiting for telemetry"} icon={Activity} tone="amber" trend={hasSnapshot ? scenarioId === "signals" ? -12 : scenarioId === "closure" ? 18 : 4 : 0} />
          <MetricCard title="Flood risk" value={hasSnapshot ? metrics.flood : "—"} unit="%" status={hasSnapshot ? floodStatus : "Waiting for telemetry"} icon={CloudRain} tone="cyan" trend={hasSnapshot ? scenarioId === "drainage" ? -24 : scenarioId === "rain" ? 21 : 2 : 0} />
          <MetricCard title="Water pressure" value={hasSnapshot ? metrics.pressure.toFixed(1) : "—"} unit="bar" status={hasSnapshot ? pressureStatus : "Waiting for telemetry"} icon={Droplets} tone="blue" trend={hasSnapshot ? metrics.pressure < 3.4 ? -8 : 1 : 0} />
          <MetricCard title="Grid demand" value={hasSnapshot ? metrics.power : "—"} unit="%" status={hasSnapshot ? metrics.power > 75 ? "Peak demand watch" : "Stable demand" : "Waiting for telemetry"} icon={Zap} tone="violet" trend={hasSnapshot ? scenarioId === "rain" ? 7 : -2 : 0} />
        </section>

        <section className="main-grid">
          <article className="panel map-panel">
            <div className="panel-heading map-heading">
              <div>
                <div className="panel-kicker"><Layers3 size={14} /> GEOSPATIAL DIGITAL TWIN</div>
                <h2>Yelahanka urban model</h2>
                <p>OpenStreetMap footprints · {mapStats.buildings.toLocaleString()} buildings · {mapStats.roads.toLocaleString()} road features</p>
              </div>
              <span className="view-chip"><span className="view-chip-dot" /> 3D LIVE VIEW</span>
            </div>

            <div className="map-stage">
              <CityScene layers={layers} scenario={scenarioId} onStats={mapMetricUpdate} route={selectedRoute} />
              <div className="map-label map-label-top">
                <span className="map-label-pin"><MapPin size={13} /></span>
                <span><strong>Yelahanka New Town</strong><small>13.1007° N, 77.5963° E</small></span>
              </div>
              <div className="map-label map-label-scale"><span /> 500 m</div>
              <div className="map-attribution">GIS footprints from OpenStreetMap · scenario layers are illustrative</div>
            </div>

            <div className="map-footer">
              <div className="layer-label"><Layers3 size={14} /> MAP LAYERS</div>
              <div className="layer-list">
                {LAYER_OPTIONS.map((layer) => (
                  <button
                    className={`layer-toggle ${layers[layer.id] ? "selected" : ""}`}
                    key={layer.id}
                    type="button"
                    aria-pressed={layers[layer.id]}
                    onClick={() => toggleLayer(layer.id)}
                  >
                    <span className="layer-swatch" style={{ "--layer-color": layer.color }} />
                    {layer.label}
                    {layer.schematic && <span className="schematic-tag">SIM</span>}
                  </button>
                ))}
              </div>
            </div>
          </article>

          <aside className="panel scenario-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-kicker"><Sparkles size={14} /> WHAT-IF SIMULATOR</div>
                <h2>Test an intervention</h2>
                <p>Explore how a change could affect the network.</p>
              </div>
            </div>

            <div className="scenario-list" role="group" aria-label="Simulation scenario">
              {SCENARIOS.map((scenario) => (
                <button
                  className={`scenario-option ${scenarioId === scenario.id ? "active" : ""}`}
                  key={scenario.id}
                  type="button"
                  aria-pressed={scenarioId === scenario.id}
                  disabled={!hasSnapshot || connectionState !== "connected"}
                  onClick={() => selectScenario(scenario.id)}
                >
                  <span className="scenario-radio" />
                  <span className="scenario-copy"><strong>{scenario.label}</strong><small>{scenario.detail}</small></span>
                  {scenario.id === "rain" && <CloudRain size={15} className="scenario-icon" />}
                </button>
              ))}
            </div>

            <div className="scenario-impact">
              <div className="impact-heading"><span>PROJECTED IMPACT</span><span className="model-tag">DEMO MODEL</span></div>
              <div className="impact-row">
                <span>Network alerts</span>
                <strong className={alertCount > 2 ? "impact-warning" : ""}>{alertCount} <small>{alertCount === 1 ? "watch" : "areas to review"}</small></strong>
              </div>
              <div className="impact-row">
                <span>Response window</span>
                <strong>{scenarioId === "rain" ? "12" : "18"} <small>min</small></strong>
              </div>
              <button
                className={`plan-button ${planGenerated ? "generated" : ""}`}
                type="button"
                onClick={() => setPlanGenerated(true)}
              >
                {planGenerated ? "Draft plan ready" : "Prepare response plan"}
                <Route size={15} />
              </button>
              {planGenerated && <p className="plan-note">Draft only — no field teams have been dispatched.</p>}
            </div>
          </aside>
        </section>

        <section className="lower-grid">
          <article className="panel forecast-panel">
            <div className="panel-heading forecast-heading">
              <div>
                <div className="panel-kicker"><Activity size={14} /> TIME-SERIES OUTLOOK</div>
                <h2>Condition forecast</h2>
                <p>Illustrative 60-minute projection · simulated history and forecast</p>
              </div>
              <label className="metric-select-label">
                <span className="sr-only">Forecast metric</span>
                <select value={chartMetric} onChange={(event) => setChartMetric(event.target.value)}>
                  <option value="traffic">Traffic load</option>
                  <option value="flood">Flood risk</option>
                  <option value="pressure">Water pressure</option>
                </select>
              </label>
            </div>
            <div className="chart-summary">
              <strong style={{ color: selectedMetric.color }}>{hasSnapshot ? metrics[chartMetric] : "—"}{hasSnapshot ? selectedMetric.unit : ""}</strong>
              <span>Current {selectedMetric.label.toLowerCase()}</span>
              <span className="forecast-legend"><i className="legend-observed" /> Observed <i className="legend-predicted" /> Forecast</span>
            </div>
            <div className="chart-wrap">
              {hasSnapshot ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={selectedMetric.color} stopOpacity={0.2} />
                        <stop offset="100%" stopColor={selectedMetric.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#26364a" strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#8290a4", fontSize: 10 }} axisLine={false} tickLine={false} interval={2} />
                    <YAxis domain={[0, chartMetric === "pressure" ? 6 : 100]} tick={{ fill: "#8290a4", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}`} />
                    <Tooltip
                      contentStyle={{ background: "#111e2d", border: "1px solid #29394e", borderRadius: 8, color: "#eaf0f6", fontSize: 12 }}
                      formatter={(value) => [`${value}${selectedMetric.unit}`, selectedMetric.label]}
                    />
                    <Area type="monotone" dataKey="observed" stroke={selectedMetric.color} strokeWidth={2} fill="url(#forecastFill)" connectNulls={false} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="forecast" stroke={selectedMetric.color} strokeWidth={2} strokeDasharray="5 5" connectNulls={false} dot={false} activeDot={{ r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="chart-waiting">Waiting for the telemetry stream…</div>}
            </div>
            <div className="forecast-footnote"><Signal size={13} /> Forecast is a deterministic demo projection, not a trained model.</div>
          </article>

          <div className="operations-column">
            <article className="panel route-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <div className="panel-kicker"><Route size={14} /> EMERGENCY ROUTING</div>
                  <h2>Priority corridors</h2>
                </div>
                <button
                  className="text-button"
                  type="button"
                  disabled={routesLoading || !hasSnapshot}
                  onClick={() => setRouteVersion((version) => version + 1)}
                >
                  {routesLoading ? "Routing…" : "Recalculate"}
                </button>
              </div>
              <div className="route-list">
                {routesLoading && <div className="route-message">Calculating routes on the mapped road network…</div>}
                {routesError && <div className="route-message route-message-error" role="alert">{routesError}</div>}
                {!hasSnapshot && <div className="route-message">Waiting for the telemetry API…</div>}
                {!routesLoading && !routesError && routes.map((route, index) => (
                  <button
                    className={`route-row ${selectedRouteId === route.id ? "selected" : ""} ${route.status === "unavailable" ? "unavailable" : ""}`}
                    key={route.id}
                    type="button"
                    disabled={route.status !== "available"}
                    aria-pressed={selectedRouteId === route.id}
                    onClick={() => setSelectedRouteId(route.id)}
                  >
                    <span className={`route-number ${index === 0 ? "route-best" : ""}`}>0{index + 1}</span>
                    <span className="route-destination">
                      <strong>{route.origin}</strong>
                      <small>{route.destination}</small>
                      {route.status === "available" && (
                        <small className="route-detail">
                          {route.distanceKm} km · {route.edgeCount} road links
                          {route.blockedSegment && ` · detour: ${route.blockedSegment.roadName}`}
                        </small>
                      )}
                      {route.status === "unavailable" && <small>{route.reason}</small>}
                    </span>
                    <span className="route-time">
                      {route.status === "available" ? route.estimatedMinutes : "—"}
                      {route.status === "available" && <small> min</small>}
                    </span>
                  </button>
                ))}
              </div>
              <div className="panel-footnote"><Route size={12} /> Estimated from OSM road class; no live traffic or one-way data.</div>
            </article>

            <article className="panel response-panel">
              <div className="panel-heading compact-heading">
                <div>
                  <div className="panel-kicker"><ShieldAlert size={14} /> RESOURCE GUIDANCE</div>
                  <h2>Recommended next steps</h2>
                </div>
                <span className="recommendation-count">{recommendations.length}</span>
              </div>
              <ul className="recommendation-list">
                {recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
              </ul>
              <div className="panel-footnote"><Timer size={12} /> Recommendations update with the selected scenario.</div>
            </article>
          </div>
        </section>

        <section className="panel monitoring-panel">
          <div className="monitoring-heading">
            <div>
              <div className="panel-kicker"><Radio size={14} /> INFRASTRUCTURE MONITORING</div>
              <h2>Virtual sensor network</h2>
              <p>Telemetry shown here is simulated; no physical IoT devices are connected.</p>
            </div>
            <div className="sensor-summary"><span className="feed-dot" /> 6 virtual nodes <span className="summary-separator">·</span> {hasSnapshot ? alertCount : "—"} model alerts</div>
          </div>
          <div className="sensor-grid">
            <div className="sensor-card">
              <span className="sensor-icon water"><Droplets size={16} /></span>
              <span className="sensor-copy"><strong>Water network</strong><small>Pressure · {hasSnapshot ? `${metrics.pressure.toFixed(1)} bar` : "Waiting for telemetry"}</small></span>
              <span className={`sensor-state ${hasSnapshot && metrics.pressure < 3.4 ? "state-watch" : ""}`}>{hasSnapshot ? metrics.pressure < 3.4 ? "WATCH" : "NORMAL" : "WAIT"}</span>
            </div>
            <div className="sensor-card">
              <span className="sensor-icon energy"><Zap size={16} /></span>
              <span className="sensor-copy"><strong>Power distribution</strong><small>Grid demand · {hasSnapshot ? `${metrics.power}%` : "Waiting for telemetry"}</small></span>
              <span className="sensor-state">{hasSnapshot ? "NORMAL" : "WAIT"}</span>
            </div>
            <div className="sensor-card">
              <span className="sensor-icon drainage"><CloudRain size={16} /></span>
              <span className="sensor-copy"><strong>Drainage system</strong><small>{scenarioId === "rain" ? "Capacity under stress" : "Flow within limits"}</small></span>
              <span className={`sensor-state ${scenarioId === "rain" ? "state-watch" : ""}`}>{hasSnapshot ? scenarioId === "rain" ? "WATCH" : "NORMAL" : "WAIT"}</span>
            </div>
            <div className="sensor-card">
              <span className="sensor-icon mobility"><Activity size={16} /></span>
              <span className="sensor-copy"><strong>Road conditions</strong><small>{hasSnapshot ? `${metrics.traffic}% corridor load` : "Waiting for telemetry"}</small></span>
              <span className={`sensor-state ${hasSnapshot && metrics.traffic > 70 ? "state-watch" : ""}`}>{hasSnapshot ? metrics.traffic > 70 ? "WATCH" : "NORMAL" : "WAIT"}</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <span>NEURAL CITY <span className="footer-divider">/</span> DIGITAL TWIN DEMO</span>
        <span><span className="footer-pulse" /> {hasSnapshot ? isRunning ? "Simulation running" : "Simulation paused" : "Waiting for telemetry"} · last tick {tick}</span>
        <span>{mapStats.buildings.toLocaleString()} buildings mapped</span>
      </footer>
    </div>
  );
}

export default App;
