import React from 'react';

type Segment = { type: 'text'; value: string } | { type: 'code'; lang: string; value: string };

const KNOWN_LANGS = [
  'javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx', 'python', 'py', 'java', 'c', 'cpp', 'csharp', 'cs',
  'go', 'rust', 'rs', 'bash', 'sh', 'shell', 'json', 'html', 'css', 'sql', 'php', 'ruby', 'rb', 'kotlin', 'swift', 'yaml',
];

const UNFENCED_LANG_RE = new RegExp(
  `(?:^|\\n\\n)(${KNOWN_LANGS.join('|')})\\n([^\\n]+(?:\\n[^\\n]+)*)(?=\\n\\n|$)`,
  'gi'
);

function splitUnfencedCode(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  UNFENCED_LANG_RE.lastIndex = 0;

  while ((m = UNFENCED_LANG_RE.exec(text)) !== null) {
    const leadingNewlines = m[0].startsWith('\n\n') ? 2 : 0;
    const blockStart = m.index + leadingNewlines;
    const lang = m[1].toLowerCase();
    const body = m[2].replace(/\n+$/, '');
    const looksLikeCode =
      /[;=(){}[\]]/.test(body) ||
      /\b(const|let|var|function|def|class|return|if|for|while|import|export|SELECT|FROM)\b/.test(body);

    if (!looksLikeCode) continue;

    if (blockStart > last) {
      out.push({ type: 'text', value: text.slice(last, blockStart) });
    }
    out.push({ type: 'code', lang, value: body });
    last = m.index + m[0].length;
  }

  if (last < text.length) {
    out.push({ type: 'text', value: text.slice(last) });
  }
  return out.length > 0 ? out : [{ type: 'text', value: text }];
}

/** Splits text into plain-text and fenced code segments (tolerates an unclosed fence while streaming). */
export function parseSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([^\n`]*)\n?([\s\S]*?)(```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(input)) !== null) {
    if (match.index > last) {
      segments.push(...splitUnfencedCode(input.slice(last, match.index)));
    }

    let lang = match[1].trim();
    let code = match[2];
    // "```js let x = 1; ...```" (language and code on the same line)
    const firstWord = lang.split(/\s+/)[0].toLowerCase();
    if (lang.includes(' ') && KNOWN_LANGS.includes(firstWord)) {
      code = `${lang.slice(firstWord.length).trimStart()}${code ? `\n${code}` : ''}`;
      lang = firstWord;
    } else if (lang && !KNOWN_LANGS.includes(lang.toLowerCase()) && /^\S+$/.test(lang) === false) {
      code = `${lang}\n${code}`;
      lang = '';
    }
    segments.push({ type: 'code', lang: lang.toLowerCase(), value: code.replace(/\n+$/, '') });
    last = match.index + match[0].length;
    if (match[0].length === 0) fence.lastIndex++;
    if (match[3] === '') break;
  }
  if (last < input.length) {
    segments.push(...splitUnfencedCode(input.slice(last)));
  }
  return segments;
}

/** Plain one-line version (code blocks replaced by a marker) — for compact previews. */
export function toPlainPreview(input: string): string {
  return parseSegments(input)
    .map((s) => (s.type === 'code' ? ' ‹código› ' : s.value.replace(/`([^`\n]+)`/g, '$1')))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

const KEYWORDS = new Set(
  (
    'let const var function return if else for while do switch case break continue class new import export from default ' +
    'async await try catch finally throw typeof instanceof in of this null true false undefined def lambda pass elif ' +
    'None True False and or not is with as yield int float double char void struct enum public private protected static ' +
    'final interface extends implements package fn mut impl use pub match go func chan defer type select where'
  ).split(' ')
);

const TOKEN_RE =
  /(\/\/.*|#.*|--.*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

function highlightLine(line: string, lang: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const hashIsComment = ['python', 'py', 'bash', 'sh', 'shell', 'ruby', 'rb', 'yaml', ''].includes(lang);
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index));
    const [tok, comment, str, num, ident] = m;
    const key = `${m.index}-${tok}`;
    if (comment !== undefined) {
      if (comment.startsWith('#') && !hashIsComment) nodes.push(tok);
      else nodes.push(<span key={key} className="text-gray-500 italic">{tok}</span>);
    } else if (str !== undefined) {
      nodes.push(<span key={key} className="text-[#a5d6ff]">{tok}</span>);
    } else if (num !== undefined) {
      nodes.push(<span key={key} className="text-[#79c0ff]">{tok}</span>);
    } else if (ident !== undefined && KEYWORDS.has(ident)) {
      nodes.push(<span key={key} className="text-[#ff7b72]">{tok}</span>);
    } else if (ident !== undefined && /^[A-Z]/.test(ident)) {
      nodes.push(<span key={key} className="text-[#ffa657]">{tok}</span>);
    } else {
      nodes.push(tok);
    }
    last = m.index + tok.length;
  }
  if (last < line.length) nodes.push(line.slice(last));
  return nodes;
}

export const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code, lang = '' }) => {
  const lines = code.split('\n');
  return (
    <div
      data-testid="code-block"
      className="my-3 overflow-x-auto rounded-xl border border-ink-800 bg-ink-950 py-3 font-mono text-[12px] leading-[1.65] text-gray-200"
    >
      {lines.map((line, i) => (
        <div key={i} className="flex min-w-max">
          <span className="w-10 shrink-0 select-none pr-4 text-right text-[11px] text-gray-600">{i + 1}</span>
          <span className="whitespace-pre pr-4">{line ? highlightLine(line, lang) : ' '}</span>
        </div>
      ))}
    </div>
  );
};

export const InlineCode: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <code
    data-testid="inline-code"
    className="mx-0.5 rounded-md border border-ink-600 bg-ink-950 px-1.5 py-0.5 font-mono text-[0.85em] text-gray-100"
  >
    {children}
  </code>
);

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(`[^`\n]+`)/g).map((part, i) =>
    part.length > 2 && part.startsWith('`') && part.endsWith('`') ? (
      <InlineCode key={`${keyPrefix}-${i}`}>{part.slice(1, -1)}</InlineCode>
    ) : (
      <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>
    )
  );
}

interface RichTextProps {
  text: string;
  className?: string;
}

/** Renders text with fenced code blocks (line numbers + highlighting) and inline `code` chips. */
export const RichText: React.FC<RichTextProps> = ({ text, className }) => {
  const segments = parseSegments(text || '');
  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'code' ? (
          <CodeBlock key={i} code={seg.value} lang={seg.lang} />
        ) : (
          <span key={i} className="whitespace-pre-wrap">
            {renderInline(seg.value.replace(/^\n+|\n+$/g, (m) => (i === 0 || i === segments.length - 1 ? '' : m)), String(i))}
          </span>
        )
      )}
    </div>
  );
};
