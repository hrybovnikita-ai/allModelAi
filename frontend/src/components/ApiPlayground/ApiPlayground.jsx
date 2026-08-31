import { useState } from "react";
import { dashboardModels } from "../../data/dashboardModels";
import "./ApiPlayground.css";

export default function ApiPlayground() {
  const [model, setModel] = useState("claude");
  const [prompt, setPrompt] = useState("Write a haiku about the sea.");
  const [temperature, setTemperature] = useState(0.7);
  const [status, setStatus] = useState("idle"); // idle | loading | done
  const [response, setResponse] = useState(null);

  const run = () => {
    setStatus("loading");
    setResponse(null);
    setTimeout(() => {
      setResponse({
        id: `cmpl-${Math.random().toString(36).slice(2, 10)}`,
        model,
        choices: [
          {
            message: {
              role: "assistant",
              content: `[demo] ${model} responds to "${prompt}" — connect a real API key in Settings to get live completions.`,
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: prompt.split(/\s+/).length,
          completion_tokens: 24,
          total_tokens: prompt.split(/\s+/).length + 24,
        },
        latency_ms: Math.round(400 + Math.random() * 900),
      });
      setStatus("done");
    }, 800);
  };

  const requestSnippet = `POST /api/chat
{
  "model": "${model}",
  "prompt": "${prompt}",
  "temperature": ${temperature}
}`;

  return (
    <div className="playground-page">
      <header className="playground-hero">
        <h1>API Playground</h1>
        <p>
          Experiment with requests against the AllModelAI API — no setup
          required.
        </p>
      </header>

      <div className="playground-layout">
        <section className="playground-panel">
          <label>Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {dashboardModels
              .filter((m) => m.slug !== "smart")
              .map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.name} · {m.provider}
                </option>
              ))}
          </select>

          <label>Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />

          <label>
            Temperature: <b>{temperature.toFixed(1)}</b>
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />

          <button
            className="playground-run"
            onClick={run}
            disabled={status === "loading" || !prompt.trim()}
          >
            {status === "loading" ? "Running…" : "▶ Run request"}
          </button>
        </section>

        <section className="playground-output">
          <div className="playground-block">
            <h4>Request</h4>
            <pre>{requestSnippet}</pre>
          </div>
          <div className="playground-block">
            <h4>
              Response{" "}
              {status === "done" && (
                <span className="latency">{response?.latency_ms}ms</span>
              )}
            </h4>
            {status === "idle" && (
              <p className="placeholder">
                Run a request to see the response here.
              </p>
            )}
            {status === "loading" && (
              <p className="placeholder">Waiting for response…</p>
            )}
            {status === "done" && response && (
              <pre>{JSON.stringify(response, null, 2)}</pre>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
