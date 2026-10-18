export async function load(url, context, nextLoad) {
  if (url.endsWith('.css') || url.endsWith('.svg') || url.endsWith('.png')) {
    return {
      format: 'module',
      source: 'export default {};',
      shortCircuit: true,
    };
  }
  const result = await nextLoad(url, context);
  if (url.includes('/src/') && url.endsWith('.js') && result.source) {
    return { ...result, source: String(result.source).replaceAll('import.meta.env.', '(import.meta.env || {}).') };
  }
  return result;
}
