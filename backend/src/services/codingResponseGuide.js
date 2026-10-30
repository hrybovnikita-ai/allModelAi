const CODE_ONLY_RE = /code only|only(?: the)? code|just(?: the)? code|no explanation|without explanation|без пояснен|только код|лише код|тільки код/i;

function wantsCodeOnly(prompt) {
  return CODE_ONLY_RE.test(String(prompt || ''));
}

/**
 * Extra system-prompt guidance for coding requests.
 * Does not claim the code was executed.
 */
function buildCodingResponseInstruction(prompt) {
  if (wantsCodeOnly(prompt)) {
    return ' The user asked for code only. Return one complete fenced Markdown code block with the correct language tag and no surrounding explanation.';
  }
  return [
    ' The user asked for a program or code change.',
    ' Respond in the user\'s language.',
    ' Use this structure unless they asked for a shorter format:',
    ' 1) A short introduction of what you created.',
    ' 2) The complete source in one or more fenced Markdown code blocks with the correct language tag (python, javascript, cpp, java, csharp, html, css, and so on). Close every fence.',
    ' 3) A "How it works" section covering the main functions or classes.',
    ' 4) A "How to run" section with real install and run commands for the language. Do not invent test results or claim the code was executed.',
    ' 5) Three practical improvements specific to this project, not generic advice.',
    ' 6) One concrete next step you can implement if they ask.',
    ' Do not stop after the code block.',
  ].join('');
}

module.exports = {
  wantsCodeOnly,
  buildCodingResponseInstruction,
};
