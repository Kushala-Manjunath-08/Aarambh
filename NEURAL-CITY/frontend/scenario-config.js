export const SCENARIOS = [
  {
    id: "baseline",
    label: "Baseline",
    detail: "Normal operations",
    metrics: { traffic: 38, flood: 16, pressure: 4.1, power: 62 }
  },
  {
    id: "rain",
    label: "Heavy rainfall",
    detail: "Stress drainage capacity",
    metrics: { traffic: 67, flood: 79, pressure: 3.2, power: 69 }
  },
  {
    id: "closure",
    label: "Road closure",
    detail: "Test a blocked corridor",
    metrics: { traffic: 76, flood: 19, pressure: 4, power: 64 }
  },
  {
    id: "drainage",
    label: "Drainage upgrade",
    detail: "Increase local capacity",
    metrics: { traffic: 40, flood: 9, pressure: 4.1, power: 62 }
  },
  {
    id: "signals",
    label: "Signal retiming",
    detail: "Optimize a junction",
    metrics: { traffic: 27, flood: 16, pressure: 4.1, power: 61 }
  }
];
