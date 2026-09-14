import Prism from 'prismjs';
import { Prism as bundledPrism } from 'prism-react-renderer';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-csharp.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-markup-templating.js';
import 'prismjs/components/prism-php.js';
import 'prismjs/components/prism-ruby.js';

// Preserve all renderer grammars and add languages absent from its default bundle.
for (const [name, grammar] of Object.entries(bundledPrism.languages)) {
  if (!Prism.languages[name]) Prism.languages[name] = grammar;
}
Prism.manual = true;
export { Prism };

export const codeTheme = {
  plain: { color: '#b994ff', backgroundColor: '#212121' },
  styles: [
    { types: ['plain'], style: { color: '#b994ff' } },
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: '#929292' } },
    { types: ['keyword', 'operator', 'tag', 'important', 'atrule'], style: { color: '#ff80ab' } },
    { types: ['string', 'char', 'attr-value', 'template-string', 'regex', 'inserted'], style: { color: '#8aef98' } },
    { types: ['function', 'builtin', 'variable', 'property', 'attr-name', 'selector'], style: { color: '#b994ff' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: '#ffb86c' } },
    { types: ['class-name', 'namespace'], style: { color: '#82d9e8' } },
    { types: ['punctuation'], style: { color: '#f4f4f4' } },
    { types: ['deleted'], style: { color: '#ff8080' } },
  ],
};

export const languageAliases = {
  js: 'javascript', ts: 'typescript', py: 'python', python3: 'python',
  'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', dotnet: 'csharp',
  sh: 'bash', shell: 'bash', html: 'markup', xml: 'markup',
  yml: 'yaml', rb: 'ruby', rs: 'rust', kt: 'kotlin',
};
