/** Dev-only: surfaces React hook-order failures with a clearer label in the console. */
export function installHooksDevDiagnostics() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;

  const previous = console.error;
  console.error = (...args) => {
    const combined = args.map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.message;
      return '';
    }).join(' ');
    if (/Rendered more hooks|Rendered fewer hooks|order of Hooks/i.test(combined)) {
      previous('[AllModelAI hook-order]', ...args);
      return;
    }
    if (/Accessing element\.ref was removed in React 19/i.test(combined)) {
      previous('[AllModelAI react-19-ref]', ...args);
      return;
    }
    previous(...args);
  };
}
