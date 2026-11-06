const SUPPORT_EMAIL = 'support@allmodelai.com';

export const pages = {
  privacy: ['Privacy Policy', 'We keep account and workspace data only to provide AllModelAI features. Payment card details are collected and processed by Stripe, Creem, Paddle, or WayForPay and are never stored on AllModelAI servers. AI chat content may be processed by third-party model providers according to your settings.'],
  terms: ['Terms of Service', 'Use AllModelAI responsibly. AI responses can be inaccurate, so review important information before relying on it. Prepaid AI credits are non-transferable and consumed per usage rules published in the product. Generating NSFW, explicit, sexually suggestive, illegal, or harmful image or video content is prohibited and may result in suspension without refund.'],
  refund: ['Refund Policy', 'Paid subscriptions and prepaid AI credit packs are processed by our payment partners (Stripe, Creem, Paddle, or WayForPay). Refund eligibility depends on the product type, unused credit balance, and applicable law. Contact support before disputing a charge.'],
  cookies: ['Cookie Policy', 'AllModelAI uses an HttpOnly session cookie to keep you signed in. It does not contain your password or payment information.'],
  aup: ['Acceptable Use Policy', 'Do not use AllModelAI for illegal activity, malware, harassment, NSFW or sexually explicit image/video generation, deepfakes, face-swap abuse, or attempts to bypass provider safety systems. Automated abuse, credential stuffing, and reselling access without authorization are prohibited. We may suspend accounts that violate this policy.'],
  contact: ['Contact & Support', `Questions about billing, privacy, or technical issues? Email ${SUPPORT_EMAIL}. We aim to respond within two business days.`],
};

export const SUPPORT_EMAIL_INFO = SUPPORT_EMAIL;

export const LEGAL_PAGE_TYPES = Object.keys(pages);
