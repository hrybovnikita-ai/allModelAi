import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AUTH_STATUS } from '../../lib/authSessionStatus';
import { useSession } from '../Session/SessionProvider';
import Login from './Login';

export default function AuthPage({ mode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, authLoading } = useSession();
  const from = location.state?.from;
  const returnTo =
    mode === 'signup'
      ? '/dashboard'
      : typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')
        ? from
        : '/dashboard';

  useEffect(() => {
    if (authLoading || status === AUTH_STATUS.CHECKING_REDIRECT) return;
    if (status === AUTH_STATUS.AUTHENTICATED && user?.email) {
      navigate(returnTo, { replace: true, state: { user } });
    }
  }, [authLoading, navigate, returnTo, status, user]);

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
