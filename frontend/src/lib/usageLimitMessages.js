const MESSAGES = {
  en: {
    title: "You've reached your usage limit",
    body: 'Your available AI requests have been used. Please try again when your limit resets.',
    later: 'Please try again later.',
    resetPrefix: 'Estimated reset:',
    viewUsage: 'View usage',
    viewPlans: 'View plans',
  },
  ru: {
    title: 'Вы достигли лимита использования',
    body: 'Ваши доступные запросы к AI закончились. Попробуйте снова после обновления лимита.',
    later: 'Попробуйте позже.',
    resetPrefix: 'До обновления:',
    viewUsage: 'Посмотреть лимиты',
    viewPlans: 'Тарифы',
  },
  uk: {
    title: 'Ви досягли ліміту використання',
    body: 'Ваші доступні запити до AI закінчилися. Спробуйте знову після оновлення ліміту.',
    later: 'Спробуйте пізніше.',
    resetPrefix: 'До оновлення:',
    viewUsage: 'Переглянути ліміти',
    viewPlans: 'Тарифи',
  },
  pl: {
    title: 'Osiągnięto limit wykorzystania',
    body: 'Wykorzystano dostępne zapytania AI. Spróbuj ponownie po odnowieniu limitu.',
    later: 'Spróbuj ponownie później.',
    resetPrefix: 'Do odnowienia:',
    viewUsage: 'Zobacz limity',
    viewPlans: 'Plany',
  },
  de: {
    title: 'Ihr Nutzungslimit wurde erreicht',
    body: 'Ihre verfügbaren KI-Anfragen sind aufgebraucht. Versuchen Sie es erneut, wenn das Limit zurückgesetzt wird.',
    later: 'Bitte versuchen Sie es später erneut.',
    resetPrefix: 'Geschätzter Reset:',
    viewUsage: 'Nutzung anzeigen',
    viewPlans: 'Pläne',
  },
  fr: {
    title: "Vous avez atteint votre limite d'utilisation",
    body: 'Vos requêtes IA disponibles ont été utilisées. Réessayez après le renouvellement de la limite.',
    later: 'Veuillez réessayer plus tard.',
    resetPrefix: 'Réinitialisation estimée :',
    viewUsage: "Voir l'utilisation",
    viewPlans: 'Voir les offres',
  },
  es: {
    title: 'Has alcanzado tu límite de uso',
    body: 'Se han usado tus solicitudes de IA disponibles. Inténtalo de nuevo cuando se restablezca el límite.',
    later: 'Inténtalo de nuevo más tarde.',
    resetPrefix: 'Reinicio estimado:',
    viewUsage: 'Ver uso',
    viewPlans: 'Ver planes',
  },
};

const UNIT = {
  en: { hour: ['hour', 'hours'], minute: ['minute', 'minutes'] },
  ru: { hour: ['час', 'часа', 'часов'], minute: ['минута', 'минуты', 'минут'] },
  uk: { hour: ['година', 'години', 'годин'], minute: ['хвилина', 'хвилини', 'хвилин'] },
  pl: { hour: ['godzina', 'godziny', 'godzin'], minute: ['minuta', 'minuty', 'minut'] },
  de: { hour: ['Stunde', 'Stunden'], minute: ['Minute', 'Minuten'] },
  fr: { hour: ['heure', 'heures'], minute: ['minute', 'minutes'] },
  es: { hour: ['hora', 'horas'], minute: ['minuto', 'minutos'] },
};

export function isUserQuotaExceeded(error) {
  const code = error?.code || error?.error?.code;
  return code === 'USER_QUOTA_EXCEEDED' || code === 'PLAN_LIMIT_REACHED';
}

export function usageLimitCopy(languageCode) {
  const code = String(languageCode || 'en').toLowerCase().split('-')[0];
  return MESSAGES[code] || MESSAGES.en;
}

function plural(lang, key, value) {
  const forms = UNIT[lang]?.[key] || UNIT.en[key];
  if (forms.length === 2) return value === 1 ? forms[0] : forms[1];
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function formatResetRemaining(resetAt, languageCode, now = Date.now()) {
  if (!resetAt) return null;
  const ms = Date.parse(resetAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const lang = String(languageCode || 'en').toLowerCase().split('-')[0];
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} ${plural(lang, 'hour', hours)}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} ${plural(lang, 'minute', minutes)}`);
  return parts.join(' ');
}
