import React from 'react';
import katex from 'katex';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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

/** A line that can only be code: a definition, a control statement, a statement ending in ; or a brace. */
const STRONG_CODE_LINE = [
  /^\s*(def|class)\s+\w+.*:\s*(#.*)?$/,
  /^\s*(if|elif|while|with)\s+.+:\s*(#.*)?$/,
  /^\s*for\s+.+\s+in\s+.+:\s*(#.*)?$/,
  /^\s*(else|try|finally)\s*:\s*(#.*)?$/,
  /^\s*except\b.*:\s*(#.*)?$/,
  /^\s*return\b.*$/,
  /^\s*(import\s+[\w.]+|from\s+[\w.]+\s+import\s+.+)\s*$/,
  /^\s*(const|let|var)\s+[\w$]+\s*=.*$/,
  /^\s*(async\s+)?function\s*[\w$]*\s*\(.*$/,
  /^\s*(public|private|static)\s.*[;{]\s*$/,
  /^\s*[}\])]+[;,)]*\s*$/,
  /^[^\s].*[;{]\s*$/,
];
/** A line that reads as code once a strong line is around: an assignment or a bare call. */
const WEAK_CODE_LINE = [
  /^\s*[A-Za-z_][\w.]*(\[[^\]]*\])?\s*([+\-*/%]|\/\/)?=\s*[^=\s].*$/,
  /^\s*[A-Za-z_][\w.]*\(.*\)\s*;?\s*(#.*)?$/,
  /^\s*#\s.*$/,
];
const isStrong = (line: string) => STRONG_CODE_LINE.some((re) => re.test(line));
const isWeak = (line: string) => WEAK_CODE_LINE.some((re) => re.test(line));

function guessLang(code: string): string {
  if (/^\s*(def|class|elif|import|from)\b|:\s*$|\bprint\(|\b(None|True|False)\b/m.test(code)) return 'python';
  if (/;\s*$|\b(const|let|var|function)\b|=>/m.test(code)) return 'javascript';
  return '';
}

/**
 * Code a model wrote without a fence: two or more lines in a row that read as code, at least one of
 * them unmistakably. Prose never matches: a sentence with "x = 5" is one line and has no strong sign.
 * Markdown would join those lines into one paragraph and lose the indentation that carries meaning.
 */
export function splitLooseCode(text: string): Segment[] {
  const lines = text.split('\n');
  const out: Segment[] = [];
  let prose: string[] = [];
  const flushProse = () => {
    if (prose.length) out.push({ type: 'text', value: prose.join('\n') });
    prose = [];
  };
  let i = 0;
  while (i < lines.length) {
    const start = i;
    let strong = 0;
    // A code line, or an indented line right after one (the body of a block)
    while (
      i < lines.length &&
      !lines[i].includes('`') &&
      (isStrong(lines[i]) || isWeak(lines[i]) || (i > start && /^(\s{2,}|\t)\S/.test(lines[i])))
    ) {
      if (isStrong(lines[i])) strong++;
      i++;
    }
    if (i - start >= 2 && strong >= 1) {
      flushProse();
      const code = lines.slice(start, i).join('\n');
      out.push({ type: 'code', lang: guessLang(code), value: code });
    } else {
      prose.push(...lines.slice(start, Math.max(i, start + 1)));
      i = Math.max(i, start + 1);
    }
  }
  flushProse();
  return out.length > 0 ? out : [{ type: 'text', value: text }];
}

const splitAllUnfenced = (text: string): Segment[] =>
  splitUnfencedCode(text).flatMap((seg) => (seg.type === 'text' ? splitLooseCode(seg.value) : [seg]));

/** Splits text into plain-text and fenced code segments (tolerates an unclosed fence while streaming). */
export function parseSegments(input: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([^\n`]*)\n?([\s\S]*?)(```|$)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(input)) !== null) {
    if (match.index > last) {
      segments.push(...splitAllUnfenced(input.slice(last, match.index)));
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
    segments.push(...splitAllUnfenced(input.slice(last)));
  }
  return segments;
}

const KEYWORDS = new Set(
  (
    'let const var function return if else for while do switch case break continue class new import export from default ' +
    'async await try catch finally throw typeof instanceof in of this null true false undefined def lambda pass elif ' +
    'None True False and or not is with as yield int float double char void struct enum public private protected static ' +
    'final interface extends implements package fn mut impl use pub match go func chan defer type select where'
  ).split(' ')
);

const HASH_COMMENT = ['python', 'py', 'bash', 'sh', 'shell', 'ruby', 'rb', 'yaml'];
const SLASH_COMMENT = ['javascript', 'js', 'typescript', 'ts', 'tsx', 'jsx', 'java', 'c', 'cpp', 'csharp', 'cs', 'go', 'rust', 'rs', 'kotlin', 'swift'];

/** What starts a comment depends on the language; with none declared, the two common forms apply. */
function commentPattern(lang: string): string {
  if (lang === 'sql') return '--.*';
  if (lang === 'php') return '\\/\\/.*|#.*';
  if (lang === '') return '\\/\\/.*|#.*';
  if (HASH_COMMENT.includes(lang)) return '#.*';
  if (SLASH_COMMENT.includes(lang)) return '\\/\\/.*';
  return '(?!)';
}

const TOKEN_RES = new Map<string, RegExp>();
function tokenRe(lang: string): RegExp {
  let re = TOKEN_RES.get(lang);
  if (!re) {
    re = new RegExp(
      `(${commentPattern(lang)})|("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*'|\`(?:\\\\.|[^\`\\\\])*\`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)`,
      'g'
    );
    TOKEN_RES.set(lang, re);
  }
  return re;
}

function highlightLine(line: string, lang: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = tokenRe(lang);
  re.lastIndex = 0;

  while ((m = re.exec(line)) !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index));
    const [tok, comment, str, num, ident] = m;
    const key = `${m.index}-${tok}`;
    if (comment !== undefined) {
      nodes.push(<span key={key} className="text-gray-500 italic">{tok}</span>);
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

/**
 * Math delimiters: $$…$$ and \[…\] (display), \(…\) and $…$ (inline).
 * Inline `$…$` follows the Pandoc rule so prices like "R$ 5 e R$ 10" stay plain text:
 * no space right after the opening `$`, none right before the closing one, and no digit or letter after it
 * (which also keeps shell variables like `$HOME/$USER` as text).
 */
const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?![\s$])((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?!\w)/g;

export type MathPart = { type: 'text'; value: string } | { type: 'math'; value: string; display: boolean };

/** Splits plain text into text and math parts (exported for tests). */
export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let last = 0;
  MATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    const display = m[1] !== undefined || m[2] !== undefined;
    parts.push({ type: 'math', value: (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim(), display });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

export const MathFormula: React.FC<{ tex: string; display?: boolean }> = ({ tex, display = false }) => {
  const html = React.useMemo(() => {
    try {
      // trust:false (default) keeps \href, \url, \htmlClass etc. disabled, so model output cannot inject markup
      return katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' });
    } catch {
      return null;
    }
  }, [tex, display]);
  if (html === null) return <>{display ? `$$${tex}$$` : `$${tex}$`}</>;
  return display ? (
    <span data-testid="math-display" className="my-2 block overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span data-testid="math-inline" dangerouslySetInnerHTML={{ __html: html }} />
  );
};

// Private-use characters mark where a formula goes, so `_` and `*` inside LaTeX never reach the Markdown parser
const MATH_MARK = /\uE000(\d+)\uE001/g;

/** Swaps formulas (outside inline code) for marks and returns them by index. */
function protectMath(text: string): { text: string; formulas: Array<{ value: string; display: boolean }> } {
  const formulas: Array<{ value: string; display: boolean }> = [];
  const protectedText = text
    .split(/(`[^`\n]+`)/g)
    .map((part) =>
      part.startsWith('`')
        ? part
        : splitMath(part)
            .map((p) => {
              if (p.type === 'text') return p.value;
              formulas.push({ value: p.value, display: p.display });
              return `\uE000${formulas.length - 1}\uE001`;
            })
            .join('')
    )
    .join('');
  return { text: protectedText, formulas };
}

const CALLOUT = /^\[!(IMPORTANT|NOTE|TIP|WARNING|CAUTION)\]\s*/i;

/** Remark transform: formula marks become elements, and GitHub-style callouts get flagged. */
function remarkAprenda() {
  const visit = (node: any): void => {
    if (node.type === 'blockquote') {
      const first = node.children?.[0]?.children?.[0];
      if (first?.type === 'text' && CALLOUT.test(first.value)) {
        first.value = first.value.replace(CALLOUT, '');
        node.data = { hProperties: { 'data-callout': 'true' } };
      }
    }
    if (!Array.isArray(node.children)) return;
    node.children = node.children.flatMap((child: any) => {
      if (child.type !== 'text' || !child.value.includes('\uE000')) return [child];
      const out: any[] = [];
      let last = 0;
      for (const m of child.value.matchAll(MATH_MARK) as Iterable<RegExpMatchArray>) {
        if (m.index! > last) out.push({ type: 'text', value: child.value.slice(last, m.index) });
        out.push({ type: 'mathMark', data: { hName: 'span', hProperties: { 'data-math': m[1] } } });
        last = m.index! + m[0].length;
      }
      if (last < child.value.length) out.push({ type: 'text', value: child.value.slice(last) });
      return out;
    });
    node.children.forEach(visit);
  };
  return visit;
}

const textOf = (node: React.ReactNode): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
    ? node.map(textOf).join('')
    : React.isValidElement(node)
    ? textOf((node.props as { children?: React.ReactNode }).children)
    : '';

const STATIC_COMPONENTS: Components = {
  h1: ({ children }) => <h3 className="mb-2 mt-4 font-serif text-base font-semibold text-gray-100 first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-4 font-serif text-base font-semibold text-gray-100 first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-3 font-semibold text-gray-100 first:mt-0">{children}</h4>,
  h4: ({ children }) => <h5 className="mb-1 mt-3 font-semibold text-gray-200 first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-2 whitespace-pre-line first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-gray-100">{children}</strong>,
  hr: () => <hr className="my-3 border-ink-600" />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-ink-600 bg-ink-800 px-2.5 py-1.5 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-ink-600 px-2.5 py-1.5 align-top">{children}</td>,
  blockquote: ({ children, ...props }) =>
    (props as Record<string, unknown>)['data-callout'] ? (
      <div data-testid="callout" className="my-3 rounded-lg border border-gray-400 p-3 first:mt-0 last:mb-0">
        {children}
      </div>
    ) : (
      <blockquote className="my-2 border-l-2 border-ink-500 pl-3 text-gray-300 first:mt-0 last:mb-0">{children}</blockquote>
    ),
  code: ({ children }) => <InlineCode>{children}</InlineCode>,
  pre: ({ children }) => <CodeBlock code={textOf(children).replace(/\n+$/, '')} />,
};

const REMARK_PLUGINS = [remarkGfm, remarkAprenda];

const MarkdownText: React.FC<{ text: string }> = ({ text }) => {
  const { text: source, formulas } = React.useMemo(() => protectMath(text), [text]);
  const components = React.useMemo<Components>(
    () => ({
      ...STATIC_COMPONENTS,
      span: ({ children, ...props }) => {
        const index = (props as Record<string, unknown>)['data-math'];
        const formula = index === undefined ? undefined : formulas[Number(index)];
        return formula ? <MathFormula tex={formula.value} display={formula.display} /> : <span>{children}</span>;
      },
    }),
    [formulas]
  );
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components} disallowedElements={['img']}>
      {source}
    </ReactMarkdown>
  );
};

interface RichTextProps {
  text: string;
  className?: string;
}

/** Renders Markdown with fenced code blocks (line numbers + highlighting), inline `code` chips and LaTeX math (KaTeX). */
export const RichText: React.FC<RichTextProps> = React.memo(({ text, className }) => {
  const segments = React.useMemo(() => parseSegments(text || ''), [text]);
  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'code' ? (
          <CodeBlock key={i} code={seg.value} lang={seg.lang} />
        ) : (
          <MarkdownText key={i} text={seg.value} />
        )
      )}
    </div>
  );
});
