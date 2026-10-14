export function formatCardNumber(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function formatExpiry(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

export function formatCvc(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

/** Common test PAN patterns — never charged when server test mode is on. */
export function isMockTestCardNumber(cardNumber) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (!digits) return false;
  if (/^4242/.test(digits)) return true;
  if (/^0000/.test(digits)) return true;
  if (digits === '4111111111111111') return true;
  return false;
}

export function cardFormComplete(card) {
  const digits = String(card.cardNumber || '').replace(/\D/g, '');
  const expiry = String(card.expiry || '').replace(/\D/g, '');
  return (
    digits.length >= 13
    && expiry.length >= 4
    && String(card.cvc || '').length >= 3
    && String(card.holder || '').trim().length >= 2
  );
}
