export const BILLING_FIELD_INITIAL = {
  cardholderName: '',
  email: '',
  country: '',
  city: '',
  streetAddress: '',
  postalCode: '',
  stateRegion: '',
  apartment: '',
  firstName: '',
  lastName: '',
  middleName: '',
};

const COUNTRY_ALIASES = {
  us: 'US',
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  uk: 'GB',
  'united kingdom': 'GB',
  ukraine: 'UA',
  canada: 'CA',
  germany: 'DE',
  france: 'FR',
};

export function normalizeCountryCode(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const alias = COUNTRY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return trimmed.slice(0, 2).toUpperCase();
}

export function buildFullName(fields) {
  const cardholder = String(fields.cardholderName || '').trim();
  if (cardholder) return cardholder;
  return [fields.firstName, fields.middleName, fields.lastName]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
}

export function buildStripeBillingAddress(fields) {
  const country = normalizeCountryCode(fields.country);
  const address = {
    line1: String(fields.streetAddress || '').trim(),
    city: String(fields.city || '').trim(),
    postal_code: String(fields.postalCode || '').trim(),
    country,
  };
  const line2 = String(fields.apartment || '').trim();
  if (line2) address.line2 = line2;
  const state = String(fields.stateRegion || '').trim();
  if (state) address.state = state;
  return {
    name: buildFullName(fields),
    address,
  };
}

export function validateBillingFields(fields) {
  const required = ['cardholderName', 'email', 'country', 'city', 'streetAddress', 'postalCode'];
  const labels = {
    cardholderName: 'cardholder name',
    email: 'email',
    country: 'country',
    city: 'city',
    streetAddress: 'billing address',
    postalCode: 'postal code',
  };
  for (const key of required) {
    if (!String(fields[key] || '').trim()) {
      return `Enter your ${labels[key]}.`;
    }
  }
  if (!String(fields.email).includes('@')) {
    return 'Enter a valid email address.';
  }
  const country = normalizeCountryCode(fields.country);
  if (country.length !== 2) {
    return 'Enter a two-letter country code (for example US, GB, UA) or a recognized country name.';
  }
  return '';
}
