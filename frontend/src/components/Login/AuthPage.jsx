import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AUTH_STATUS } from '../../lib/authSessionStatus';
import { clearPendingCheckout, resolvePostAuthDestination } from '../../lib/pendingCheckout';
import { useSession } from '../Session/SessionProvider';
import Login from './Login';

export default function AuthPage({ mode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, user, authLoading } = useSession();
  const checkoutReturn = resolvePostAuthDestination(location.state?.from);
  const returnTo = checkoutReturn || '/dashboard';

  useEffect(() => {
    if (authLoading || status === AUTH_STATUS.CHECKING_REDIRECT) return;
    if (status === AUTH_STATUS.AUTHENTICATED && user?.email) {
      if (checkoutReturn) clearPendingCheckout();
      navigate(returnTo, { replace: true, state: { user } });
    }
  }, [authLoading, checkoutReturn, navigate, returnTo, status, user]);

  return (
    <Login
      key={mode}
      mode={mode}
      returnTo={returnTo}
      returnState={location.state?.returnState}
      onClose={() => {
        clearPendingCheckout();
        navigate('/');
      }}
      onModeChange={(next) =>
        navigate(next === 'signup' ? '/register' : '/login', {
          replace: true,
          state: location.state,
        })
      }
    />
  );
}
