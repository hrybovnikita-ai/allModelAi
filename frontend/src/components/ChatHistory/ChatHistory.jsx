import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./ChatHistory.css";

const SEED_CONVERSATIONS = [
  {
    id: "c1",
    title: "Refactor React state management",
    model: "Claude",
    date: "Today, 14:20",
    pinned: true,
    messages: 12,
  },
  {
    id: "c2",
    title: "Plan a product launch campaign",
    model: "GPT",
    date: "Today, 09:05",
    pinned: false,
    messages: 8,
  },
  {
    id: "c3",
    title: "Summarize Q3 market research",
    model: "Gemini",
    date: "Yesterday",
    pinned: false,
    messages: 5,
  },
  {
    id: "c4",
    title: "Debug Python asyncio error",
    model: "DeepSeek",
    date: "Yesterday",
    pinned: false,
    messages: 15,
  },
  {
    id: "c5",
    title: "Landing page copy ideas",
    model: "Grok",
    date: "2 days ago",
    pinned: false,
    messages: 6,
  },
  {
    id: "c6",
    title: "Translate proposal to Spanish",
    model: "Qwen",
    date: "3 days ago",
    pinned: false,
    messages: 3,
  },
];

export default function ChatHistory() {
  const navigate = useNavigate();
  const [items, setItems] = useState(SEED_CONVERSATIONS);
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState("All");

  const filtered = items.filter(
    (c) =>
      (folder === "All" || (folder === "Pinned" ? c.pinned : true)) &&
      c.title.toLowerCase().includes(query.toLowerCase()),
  );

  const togglePin = (id) =>
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
    );

  const remove = (id) => setItems((prev) => prev.filter((c) => c.id !== id));

  return (
    <div className="history-page">
      <header className="history-hero">
        <h1>Chat History</h1>
        <p>All your conversations in one place — search, pin and export.</p>
      </header>

      <div className="history-toolbar">
        <input
          type="search"
          placeholder="🔍 Search conversations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="history-folders">
          {["All", "Pinned"].map((f) => (
            <button
              key={f}
              className={f === folder ? "active" : ""}
              onClick={() => setFolder(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="history-empty">No conversations match your search.</p>
      )}

      <ul className="history-list">
        {filtered.map((c) => (
          <li
            key={c.id}
            className="history-item"
            onClick={() => navigate("/chat")}
          >
            <div className="history-main">
              <strong>{c.title}</strong>
              <small>
                {c.model} · {c.messages} messages · {c.date}
              </small>
            </div>
            <div className="history-actions">
              <button
                title={c.pinned ? "Unpin" : "Pin"}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePin(c.id);
                }}
              >
                {c.pinned ? "📌" : "📍"}
              </button>
              <button
                title="Export as Markdown"
                onClick={(e) => e.stopPropagation()}
              >
                ⬇
              </button>
              <button
                title="Delete"
                className="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(c.id);
                }}
              >
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
