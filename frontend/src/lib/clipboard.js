export async function copyToClipboard(text) {
  try {
    if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    globalThis.window?.prompt('Copy this text:', text);
    return false;
  }
}
