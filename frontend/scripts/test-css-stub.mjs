export async function load(url, context, nextLoad) {
  if (url.endsWith('.css') || url.endsWith('.svg') || url.endsWith('.png')) {
    return {
      format: 'module',
      source: 'export default {};',
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
