import { systemStatus } from "../../data/platformStats";
import "./StatusPage.css";

const STATE_META = {
  operational: { label: "Operational", cls: "ok" },
  degraded: { label: "Degraded", cls: "warn" },
  offline: { label: "Offline", cls: "down" },
};

export default function StatusPage() {
  const allOk = systemStatus.every((s) => s.state === "operational");
  return (
    <div className="status-page">
      <header className="status-hero">
        <span className={`status-pill ${allOk ? "ok" : "warn"}`}>
          <i /> {allOk ? "All systems operational" : "Partial degradation"}
        </span>
        <h1>System Status</h1>
        <p>Live availability of AllModelAI services. Updated continuously.</p>
      </header>

      <section className="status-list">
        {systemStatus.map((svc) => {
          const meta = STATE_META[svc.state];
          return (
            <div key={svc.name} className="status-row">
              <div className="status-name">
                <i className={`dot ${meta.cls}`} />
                <div>
                  <strong>{svc.name}</strong>
                  <small>{meta.label}</small>
                </div>
              </div>
              <div className="status-uptime-bars" aria-hidden="true">
                {Array.from({ length: 40 }).map((_, i) => (
                  <span
                    key={i}
                    className={
                      i === 37 && svc.state !== "operational" ? "warn" : "ok"
                    }
                  />
                ))}
              </div>
              <b className="status-uptime">{svc.uptime}</b>
            </div>
          );
        })}
      </section>

      <p className="status-note">
        Experiencing an issue not listed here? Contact{" "}
        <a href="mailto:support@allmodelai.com">support@allmodelai.com</a>.
      </p>
    </div>
  );
}
