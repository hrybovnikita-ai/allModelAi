import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { dashboardModels } from "../../data/dashboardModels";
import {
  leaderboardCategories,
  leaderboardFor,
} from "../../data/platformStats";
import "./Leaderboard.css";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const [category, setCategory] = useState("overall");
  const [voted, setVoted] = useState(null);
  const navigate = useNavigate();
  const rows = leaderboardFor(category);
  const modelBySlug = (slug) => dashboardModels.find((m) => m.slug === slug);

  return (
    <div className="leaderboard-page">
      <header className="leaderboard-hero">
        <h1>🏆 Model Leaderboard</h1>
        <p>
          Community rankings across categories. Vote for your favorite and see
          who leads.
        </p>
      </header>

      <div className="leaderboard-tabs">
        {leaderboardCategories.map((cat) => (
          <button
            key={cat}
            className={cat === category ? "active" : ""}
            onClick={() => setCategory(cat)}
          >
            {cat === "overall"
              ? "Overall"
              : cat[0].toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      <ol className="leaderboard-list">
        {rows.map((row) => {
          const model = modelBySlug(row.slug);
          if (!model) return null;
          return (
            <li key={row.slug} className={`leader-row rank-${row.rank}`}>
              <span className="leader-rank">
                {MEDALS[row.rank - 1] || `#${row.rank}`}
              </span>
              <img src={model.image} alt="" />
              <div className="leader-info">
                <strong>{model.name}</strong>
                <small>{model.provider}</small>
              </div>
              <div className="leader-score">
                <div className="leader-bar">
                  <i style={{ width: `${row.score}%` }} />
                </div>
                <b>{row.score}</b>
              </div>
              {voted === row.slug && (
                <span className="leader-voted">✓ Your pick</span>
              )}
              <button
                className="leader-try"
                onClick={() => navigate(`/chat?model=${row.slug}`)}
              >
                Try
              </button>
            </li>
          );
        })}
      </ol>

      <section className="leaderboard-vote">
        <h3>Cast your vote</h3>
        <div className="vote-chips">
          {rows.slice(0, 6).map((row) => (
            <button
              key={row.slug}
              className={voted === row.slug ? "active" : ""}
              onClick={() => setVoted(row.slug)}
            >
              <img src={modelBySlug(row.slug)?.image} alt="" />{" "}
              {modelBySlug(row.slug)?.name}
            </button>
          ))}
        </div>
        {voted && (
          <p className="vote-confirm">
            Thanks! Your vote for <b>{modelBySlug(voted)?.name}</b> has been
            counted.
          </p>
        )}
      </section>
    </div>
  );
}
