import { useLocation, useNavigate } from 'react-router-dom';
import Login from './Login';

export default function AuthPage({ mode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const from = location.state?.from;
  const returnTo = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/dashboard';
  return <Login key={mode} mode={mode} returnTo={returnTo} returnState={location.state?.returnState}
    onClose={() => navigate('/')}
    onModeChange={(next) => navigate(next === 'signup' ? '/register' : '/login', { replace: true, state: location.state })} />;
}
