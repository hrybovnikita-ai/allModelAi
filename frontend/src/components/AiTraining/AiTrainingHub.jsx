import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import './AiTraining.css';

export default function AiTrainingHub() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/ai-training/lessons');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.message || 'Could not load course catalog');
          return;
        }
        setCatalog(data);
      } catch (e) {
        setError(e.message || 'Network error');
      }
    })();
  }, []);

  const progressMap = useMemo(() => {
    const map = new Map();
    (catalog?.progress || []).forEach((row) => map.set(row.lessonId, row));
    return map;
  }, [catalog]);

  const lessonsByTrack = useMemo(() => {
    const tracks = catalog?.tracks || [];
    const lessons = catalog?.lessons || [];
    return tracks.map((track) => ({
      ...track,
      lessons: lessons.filter((l) => l.trackId === track.id),
    }));
  }, [catalog]);

  return (
    <div className="py-lab-container">
      <header className="py-lab-header">
        <div className="py-lab-brand">
          <Link to="/" className="brand-logo">
            AllModelAI
          </Link>
          <span className="brand-tag">AI Training</span>
        </div>
        <nav className="py-lab-nav">
          <Link to="/ai-learning" className="py-btn-nav">
            AI Learning Lab
          </Link>
          <Link to="/python-ai" className="py-btn-nav">
            PyTorch Lab
          </Link>
          <Link to="/model-lab" className="py-btn-nav">
            Model Lab
          </Link>
          <Link to="/chat" className="py-btn-nav primary">
            Chat
          </Link>
        </nav>
      </header>

      <div className="at-page at-hero">
        <h1>AI Training</h1>
        <p>
          Fifteen-lesson path from linear regression through regularization and transformers — with interactive
          NumPy/PyTorch labs, loss charts, tutor help, and Deep Research.
        </p>
      </div>

      {error && <p className="at-error at-page">{error}</p>}

      {lessonsByTrack.map((track) => (
        <section key={track.id} className="at-page" style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: 12 }}>{track.title}</h2>
          <div className="at-grid">
            {track.lessons.map((lesson) => {
              const prog = progressMap.get(lesson.id);
              const pct = Math.round((prog?.progress ?? 0) * 100);
              return (
                <article key={lesson.id} className="at-card">
                  <span className={`at-badge ${lesson.status === 'planned' ? 'planned' : ''}`}>
                    {lesson.status === 'lab' ? 'Interactive lab' : lesson.status === 'planned' ? 'Planned' : 'Lesson'}
                  </span>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.summary}</p>
                  {prog && (
                    <>
                      <div className="at-progress-bar" aria-hidden>
                        <div className="at-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="at-muted">Progress: {pct}%</p>
                    </>
                  )}
                  <Link to={`/ai-training/${lesson.id}`} className="py-btn-nav primary" style={{ display: 'inline-block', marginTop: 8 }}>
                    Open lesson →
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
