import { changelogEntries } from "../../data/platformStats";
import "./Changelog.css";

const TAG_CLS = {
  New: "tag-new",
  Improved: "tag-improved",
  Planned: "tag-planned",
  Fix: "tag-fix",
};

export default function Changelog() {
  return (
    <div className="changelog-page">
      <header className="changelog-hero">
        <h1>Changelog</h1>
        <p>Everything new, improved and coming next on AllModelAI.</p>
      </header>

      <div className="changelog-timeline">
        {changelogEntries.map((entry) => (
          <article key={entry.version} className="changelog-entry">
            <div className="entry-marker">
              <span>{entry.version}</span>
            </div>
            <div className="entry-card">
              <header>
                <h3>{entry.title}</h3>
                <span className={`entry-tag ${TAG_CLS[entry.tag] || ""}`}>
                  {entry.tag}
                </span>
                <time>{entry.date}</time>
              </header>
              <ul>
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
