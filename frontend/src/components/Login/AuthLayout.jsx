/** Full-viewport shell for /login and /signup. No landing or marketing content. */
export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout">
      {children}
    </div>
  );
}
