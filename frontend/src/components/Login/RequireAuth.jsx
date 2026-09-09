import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

export default function RequireAuth() {
  const location = useLocation();
  const [session, setSession] = useState({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          sessionStorage.removeItem('allmodelai_user');
          setSession({ status: 'anonymous', key: location.key });
          return;
        }
        if (!response.ok) throw new Error('Session check failed');
        const data = await response.json();
        if (!data.user) throw new Error('Missing user');
        sessionStorage.setItem('allmodelai_user', JSON.stringify(data.user));
        setSession({ status: 'authenticated', key: location.key });
      })
      .catch((error) => { if (error.name !== 'AbortError') setSession({ status: 'error', key: location.key }); });
    return () => controller.abort();
  }, [location.key, attempt]);
  if (session.key !== location.key || session.status === 'loading') return <main className="dashboard-page" role="status">Checking your session...</main>;
  if (session.status === 'error') return <main className="dashboard-page"><p role="alert">Could not connect. Please try again.</p><button onClick={() => { setSession({ status: 'loading' }); setAttempt((value) => value + 1); }}>Retry</button></main>;
  if (session.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search + location.hash, returnState: location.state }} />;
  return <Outlet />;
}
