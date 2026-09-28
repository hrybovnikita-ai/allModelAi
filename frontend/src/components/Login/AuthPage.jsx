import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { restoreSession } from '../../lib/session';
import Login from './Login';

export default function AuthPage({ mode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const from = location.state?.from;
  const returnTo =
    mode === 'signup'
      ? '/dashboard'
      : typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
        ? from
        : '/dashboard';
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    restoreSession()
      .then((user) => {
        if (active && user) {
          navigate('/dashboard', { replace: true, state: { user } });
        }
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  if (checking) {
    return (
      <main className="dashboard-page" role="status">
        Checking your session…
      </main>
    );
  }

  return (
    <Login
      key={mode}
      mode={mode}
      returnTo={returnTo}
      returnState={location.state?.returnState}
      onClose={() => navigate('/')}
      onModeChange={(next) =>
        navigate(next === 'signup' ? '/register' : '/login', {
          replace: true,
          state: location.state,
        })
      }
    />
  );
}
