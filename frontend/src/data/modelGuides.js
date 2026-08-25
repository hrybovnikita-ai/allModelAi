const guide = (overview, workflow, bestFor, prompt, caution) => ({ overview, workflow, bestFor, prompt, caution });

export const modelGuides = {
  smart: guide(
    'Smart Router is the orchestration layer of AllModelAI. It examines the task, requested speed, budget preference, and the kind of output you need before selecting a provider.',
    'Describe the result rather than choosing a model yourself. Router mode can prioritize maximum quality, balanced cost, low latency, or economy. The selected provider remains visible in the response metadata.',
    'Use it for mixed workloads, unfamiliar tasks, or projects that move between research, code, planning, and writing.',
    'Review this product idea, identify its biggest risk, and produce a practical seven-day validation plan.',
    'Automatic selection is a recommendation, not a guarantee. For regulated or highly specialized work, review the chosen provider and verify important claims.'
  ),
  claude: guide(
    'Claude is especially useful when a problem needs careful interpretation, coherent long-form writing, or a thoughtful review of competing requirements.',
    'Give Claude the background, constraints, audience, and definition of success. For large tasks, ask it to form a plan first and then complete each stage while preserving the original goal.',
    'Choose Claude for document critique, nuanced rewriting, product specifications, policy analysis, and patient code review.',
    'Read this specification as a senior engineer. List ambiguous requirements, propose safer alternatives, and then rewrite the acceptance criteria.',
    'Its polished language can make uncertain conclusions sound confident. Ask it to label assumptions and separate evidence from recommendations.'
  ),
  gemini: guide(
    'Gemini is designed for multimodal work and large bodies of context. It is a strong option when text must be considered together with images, files, or structured information.',
    'Attach the relevant material, explain what should be compared, and specify the desired structure. For visual analysis, point to the exact elements or regions that matter.',
    'Use Gemini for screenshot analysis, document synthesis, visual explanations, large-context summaries, and fast exploratory work.',
    'Analyze this interface screenshot. Identify usability problems, group them by severity, and propose concrete layout changes.',
    'Multimodal conclusions still require verification. Low-resolution images, incomplete documents, or hidden context can produce misleading interpretations.'
  ),
  gpt: guide(
    'GPT is a flexible general-purpose model for conversation, structured generation, coding, planning, and tasks that combine several kinds of work.',
    'State the role, objective, constraints, and required output format. When consistency matters, provide a small example of the expected structure or a schema to follow.',
    'Choose GPT for tool-oriented workflows, JSON output, application prototypes, brainstorming, technical explanations, and general assistance.',
    'Create a launch plan for a small SaaS product. Return milestones, owners, risks, and success metrics as a structured table.',
    'Broad capability does not replace domain expertise. Validate legal, medical, financial, and security-sensitive output with qualified sources.'
  ),
  llama: guide(
    'Llama represents Meta’s open-weight model family and is useful for teams that value deployment flexibility, customization, and control over infrastructure.',
    'Keep prompts explicit and provide examples when you need a stable tone or format. Open-model workflows benefit from clear system instructions and focused context.',
    'Use Llama for private deployments, repeatable internal assistants, classification, extraction, drafting, and customizable application features.',
    'Extract the customer problem, requested feature, urgency, and sentiment from these support messages. Return valid JSON only.',
    'Results vary considerably between model sizes and hosting providers. Record the exact version used before comparing quality or latency.'
  ),
  grok: guide(
    'Grok uses a direct conversational style that works well for quick criticism, energetic ideation, and examining a topic from an unconventional angle.',
    'Ask for a clear position, then request the strongest counterargument. This produces a more useful result than requesting an unstructured opinion.',
    'Choose Grok for rapid product critique, debate preparation, alternative perspectives, punchy copy, and early-stage brainstorming.',
    'Challenge this startup idea. Give me the three strongest reasons it could fail, then redesign it to address those weaknesses.',
    'A confident or entertaining tone is not evidence of accuracy. Verify current facts and avoid treating provocative framing as objective analysis.'
  ),
  copilot: guide(
    'Copilot is presented in AllModelAI as a productivity-oriented assistant for turning rough workplace input into usable drafts, plans, and code-related guidance.',
    'Provide the source notes, the intended audience, and the action you want readers to take. Ask for concise workplace language when the result will be shared with a team.',
    'Use it for project updates, meeting follow-ups, task breakdowns, documentation, email drafts, and practical development assistance.',
    'Turn these meeting notes into decisions, unresolved questions, owners, and dated action items. Keep the update under 300 words.',
    'Review generated workplace communication before sending it. Names, dates, commitments, and confidential details must be checked by the author.'
  ),
  perplexity: guide(
    'Perplexity is a research-first choice for questions that depend on current information, discoverable sources, and concise synthesis across publications.',
    'Define the time period, region, acceptable source types, and the exact decision the research should support. Request citations beside the claims they justify.',
    'Use it for market scans, recent developments, source discovery, competitor research, and evidence-backed briefing notes.',
    'Research recent changes in this market. Prioritize primary sources, include publication dates, and separate confirmed facts from analyst interpretation.',
    'A citation only proves that a page exists, not that the claim was represented correctly. Open critical sources and check dates, scope, and wording.'
  ),
  kimi: guide(
    'Kimi is suited to long-context and multilingual work, especially when a task requires navigating lengthy reports or maintaining continuity across substantial material.',
    'Upload or paste the material in logical sections. Explain which chapters are authoritative and ask for references back to section names when producing conclusions.',
    'Choose Kimi for long reports, document comparison, multilingual synthesis, detailed requirements, and extended analytical conversations.',
    'Compare these two reports. Identify agreements, contradictions, missing evidence, and the five decisions a project lead must make.',
    'Large context does not mean every detail receives equal attention. Put the most important instructions at the beginning and repeat critical constraints near the task.'
  ),
  deepseek: guide(
    'DeepSeek is focused on efficient technical reasoning and coding. It works best when the problem can be expressed with reproducible inputs and a clear expected result.',
    'Include the failing code, runtime, error message, and expected behavior. Ask for the root cause before requesting a patch so the explanation remains auditable.',
    'Use DeepSeek for debugging, algorithms, refactoring, test design, code explanation, and stepwise technical problem solving.',
    'Find the defect in this function. Explain why it occurs, provide the smallest safe patch, and add tests that fail before the fix.',
    'Never execute generated code blindly. Review dependencies, file operations, network calls, authentication logic, and database migrations first.'
  ),
  mistral: guide(
    'Mistral offers efficient general-purpose and technical models that are useful when responsiveness, multilingual output, and practical quality must stay balanced.',
    'Keep the task narrow, specify the language, and provide a concrete format. Compact models perform particularly well when unnecessary background is removed.',
    'Choose Mistral for fast summaries, multilingual drafting, extraction, classification, technical notes, and high-volume routine assistance.',
    'Convert these technical notes into a concise bilingual release summary with sections for changes, risks, and required user actions.',
    'Efficiency-oriented models may miss subtle dependencies in very complex tasks. Break critical work into stages and inspect each intermediate result.'
  ),
  qwen: guide(
    'Qwen is a multilingual open-model family with useful capabilities in structured reasoning, coding, translation, and work that crosses languages.',
    'Name the source and target languages, intended audience, terminology rules, and whether meaning or literal wording takes priority. Use a schema for structured tasks.',
    'Use Qwen for multilingual applications, translation with context, code assistance, information extraction, and open-model experimentation.',
    'Translate this proposal for a technical audience. Preserve product terminology, explain phrases without direct equivalents, and return a terminology glossary.',
    'Language quality differs by pair and domain. Native review remains important for contracts, public communication, and culturally sensitive material.'
  ),
  cohere: guide(
    'Command is oriented toward business language, retrieval-supported answers, summarization, and enterprise workflows that need grounded, usable output.',
    'Provide the approved source material and instruct the model not to go beyond it. Ask it to reference the supporting passage for each important conclusion.',
    'Choose Command for internal knowledge assistants, meeting synthesis, business writing, support workflows, and retrieval-augmented generation.',
    'Using only the supplied policy documents, answer the employee question and cite the section supporting every instruction.',
    'Grounding depends on the quality of retrieved documents. Missing, outdated, or conflicting sources must be surfaced instead of silently resolved.'
  ),
  cloudflare: guide(
    'Cloudflare AI runs open models close to applications on Cloudflare infrastructure. In AllModelAI it is positioned as a fast option for edge-oriented inference and lightweight tasks.',
    'Use short, focused prompts and send only the context required for the request. Edge workflows benefit from predictable input sizes and simple response contracts.',
    'Choose Cloudflare AI for low-latency helpers, classification, short summaries, extraction, moderation, and features deployed near users.',
    'Classify this feedback by topic and urgency, then return a compact JSON object suitable for an edge application.',
    'The available underlying model can vary with deployment configuration. Confirm the account, model binding, limits, and fallback behavior before production use.'
  ),
};
