import { useMemo, useState } from "react";
import { dashboardModels } from "../../data/dashboardModels";
import { modelBenchmarks } from "../../data/platformStats";
import "./ModelComparison.css";

const METRICS = [
  { key: "reasoning", label: "Reasoning" },
  { key: "coding", label: "Coding" },
  { key: "writing", label: "Writing" },
  { key: "speed", label: "Speed" },
];

export default function ModelComparison() {
  const comparable = dashboardModels.filter((m) => modelBenchmarks[m.slug]);
  const [slugs, setSlugs] = useState(["claude", "gpt", "gemini"]);
  const [prompt, setPrompt] = useState(
    "Explain quantum computing to a 10-year-old",
  );

  const selected = useMemo(
    () =>
      slugs
        .map((slug) => dashboardModels.find((m) => m.slug === slug))
        .filter(Boolean),
    [slugs],
  );

  const toggle = (slug) => {
    setSlugs((prev) =>
      prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : prev.length >= 4
          ? prev
          : [...prev, slug],
    );
  };

  const demoAnswer = (model) => {
    const styles = {
      claude: `Sure! Imagine tiny Lego blocks so small you can't see them. Everything around you is built from them...`,
      gpt: `Think of the universe as a giant video game, and quantum computing is the cheat code that...`,
      gemini: `Imagine a coin that's spinning — heads and tails at the same time until it lands. That's...`,
    };
    return (
      styles[model.slug] ||
      `Great question! Here's a simple explanation of ${prompt.toLowerCase()}...`
    );
  };

  return (
    <div className="comparison-page">
      <header className="comparison-hero">
        <h1>Compare Models</h1>
        <p>
          Pick up to 4 models and see how they differ — specs, benchmarks and
          sample answers, side by side.
        </p>
      </header>

      <section className="comparison-picker">
        <h3>Choose models ({slugs.length}/4)</h3>
        <div className="picker-chips">
          {comparable.map((m) => (
            <button
              key={m.slug}
              className={`chip ${slugs.includes(m.slug) ? "active" : ""}`}
              onClick={() => toggle(m.slug)}
            >
              <img src={m.image} alt="" /> {m.name}
            </button>
          ))}
        </div>
      </section>

      {selected.length === 0 && (
        <p className="comparison-empty">Select at least one model above.</p>
      )}

      <section
        className="comparison-grid"
        style={{ "--cols": selected.length }}
      >
        {selected.map((m) => {
          const bench = modelBenchmarks[m.slug];
          return (
            <article key={m.slug} className="comparison-card">
              <header>
                <img src={m.image} alt="" />
                <div>
                  <h3>{m.name}</h3>
                  <small>{m.provider}</small>
                </div>
              </header>
              <ul className="spec-list">
                <li>
                  <span>Context window</span>
                  <strong>{bench.context}</strong>
                </li>
                <li>
                  <span>Price label</span>
                  <strong>{m.priceLabel || "Standard"}</strong>
                </li>
                <li>
                  <span>Strengths</span>
                  <strong>{m.strengths[0]}</strong>
                </li>
              </ul>
              <div className="bench-list">
                {METRICS.map((metric) => (
                  <div key={metric.key} className="bench-row">
                    <span>{metric.label}</span>
                    <div className="bench-bar">
                      <i style={{ width: `${bench[metric.key]}%` }} />
                    </div>
                    <b>{bench[metric.key]}</b>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className="comparison-prompt">
        <h3>Same prompt, different answers</h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Type a prompt to compare answers…"
        />
        <div className="answer-grid" style={{ "--cols": selected.length }}>
          {selected.map((m) => (
            <div key={m.slug} className="answer-card">
              <header>
                <img src={m.image} alt="" /> {m.name}
              </header>
              <p>{demoAnswer(m)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
