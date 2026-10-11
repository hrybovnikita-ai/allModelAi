import { modelGuides } from './modelGuides.js';

const CATEGORY = {
  programming: 'programming',
  reasoning: 'reasoning',
  writing: 'writing',
  research: 'research',
  documents: 'documents',
  general: 'general',
};

function entry(title, category, prompt) {
  return { title, category, prompt };
}

const EXTRA_BY_SLUG = {
  mistral: [
    entry('Multilingual release notes', CATEGORY.writing, 'Convert these technical notes into a concise bilingual release summary with sections for changes, risks, and required user actions.'),
    entry('Fast classification', CATEGORY.reasoning, 'Classify each item by topic and urgency. Return compact JSON with id, topic, and urgency.'),
  ],
  gpt: [
    entry('Structured launch plan', CATEGORY.writing, 'Create a launch plan for a small SaaS product. Return milestones, owners, risks, and success metrics as a structured table.'),
  ],
  claude: [
    entry('Spec review', CATEGORY.programming, 'Read this specification as a senior engineer. List ambiguous requirements, propose safer alternatives, and rewrite the acceptance criteria.'),
  ],
  gemini: [
    entry('UI screenshot review', CATEGORY.documents, 'Analyze this interface screenshot. Identify usability problems, group them by severity, and propose concrete layout changes.'),
  ],
  deepseek: [
    entry('Debug helper', CATEGORY.programming, 'Find the defect in this function. Explain why it occurs, provide the smallest safe patch, and add tests that fail before the fix.'),
  ],
  perplexity: [
    entry('Market scan', CATEGORY.research, 'Research recent changes in this market. Prioritize primary sources, include publication dates, and separate confirmed facts from analyst interpretation.'),
  ],
};

export function promptGalleryForSlug(slug) {
  const guide = modelGuides[slug] || modelGuides.smart;
  const primary = entry('Recommended starter', CATEGORY.general, guide.prompt);
  const extras = EXTRA_BY_SLUG[slug] || [];
  const deduped = [primary, ...extras].filter(
    (item, index, list) => list.findIndex((other) => other.prompt === item.prompt) === index,
  );
  return deduped.slice(0, 4);
}
