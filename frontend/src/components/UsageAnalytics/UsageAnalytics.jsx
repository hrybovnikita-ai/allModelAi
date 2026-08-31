import { useState } from "react";
import "./UsageAnalytics.css";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const RANGES = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

// Deterministic pseudo-random data
function seriesFor(range, seed) {
  const points = RANGES[range] || 7;
  let x = seed;

  return Array.from({ length: points }, (_, i) => {
    x = (x * 9301 + 49297) % 233280;
    const noise = x / 233280;

    const value =
      400 +
      500 * Math.sin(i / 2.4 + seed) +
      600 * noise;

    // Prevent negative chart values
    return Math.max(0, Math.round(value));
  });
}

export default function UsageAnalytics() {
  const [range, setRange] = useState("7d");

  const requests = seriesFor(range, 7);
  const tokens = seriesFor(range, 42);

  const maxReq = Math.max(...requests, 1);
  const maxTokens = Math.max(...tokens, 1);

  const totalRequests = requests.reduce((sum, value) => sum + value, 0);
  const totalTokens = tokens.reduce((sum, value) => sum + value, 0);

  const spend = ((totalTokens / 1000) * 0.42).toFixed(2);

  const byModel = [
    { name: "Claude", pct: 32, color: "#6366f1" },
    { name: "GPT", pct: 26, color: "#00D084" },
    { name: "Gemini", pct: 18, color: "#4285F4" },
    { name: "Llama", pct: 14, color: "#DC2D21" },
    { name: "Other", pct: 10, color: "#8b5cf6" },
  ];

  return (
    <div className="usage-page">
      <header className="usage-hero">
        <h1>Usage & Analytics</h1>

        <p>Track your requests, tokens and spend across models.</p>

        <div className="usage-ranges">
          {Object.keys(RANGES).map((r) => (
            <button
              key={r}
              type="button"
              className={r === range ? "active" : ""}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </header>

      <section className="usage-cards">
        <div className="usage-card">
          <small>Requests</small>
          <strong>{totalRequests.toLocaleString()}</strong>
          <span>+8% vs prev. period</span>
        </div>

        <div className="usage-card">
          <small>Tokens</small>
          <strong>{(totalTokens / 1000).toFixed(1)}K</strong>
          <span>+12% vs prev. period</span>
        </div>

        <div className="usage-card">
          <small>Estimated spend</small>
          <strong>${spend}</strong>
          <span>-3% vs prev. period</span>
        </div>

        <div className="usage-card">
          <small>Avg latency</small>
          <strong>1.4s</strong>
          <span>stable</span>
        </div>
      </section>

      <section className="usage-chart">
        <h3>Requests over time</h3>

        <div className="chart-bars">
          {requests.map((value, i) => (
            <div
              key={i}
              className="chart-col"
              title={`${value} requests`}
            >
              <i
                style={{
                  height: `${(value / maxReq) * 100}%`,
                }}
              />

              <span>{DAYS[i % DAYS.length]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="usage-split">
        <div className="usage-chart">
          <h3>Requests by model</h3>

          <div className="model-share">
            {byModel.map((model) => (
              <div key={model.name} className="share-row">
                <span>{model.name}</span>

                <div className="share-bar">
                  <i
                    style={{
                      width: `${model.pct}%`,
                      backgroundColor: model.color,
                    }}
                  />
                </div>

                <b>{model.pct}%</b>
              </div>
            ))}
          </div>
        </div>

        <div className="usage-chart">
          <h3>Tokens over time</h3>

          <div className="chart-bars tokens">
            {tokens.map((value, i) => (
              <div
                key={i}
                className="chart-col"
                title={`${value.toLocaleString()} tokens`}
              >
                <i
                  style={{
                    height: `${(value / maxTokens) * 100}%`,
                  }}
                />

                <span>{DAYS[i % DAYS.length]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}