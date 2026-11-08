import React from 'react';
import { normalizeLang, translate } from '../i18n';

interface State {
  failed: boolean;
  attempt: number;
}

/** Sits above the i18n provider, so it reads the saved language by itself. */
function savedLang() {
  try {
    return normalizeLang(JSON.parse(localStorage.getItem('aprenda_settings') || '{}').language);
  } catch {
    return normalizeLang('');
  }
}

/** Keeps a render error from blanking the window. Recovering opens a new session, never the one that failed. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('[ErrorBoundary]', error);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    const lang = savedLang();
    return (
      <div role="alert" className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-ink-950 p-8 text-center text-gray-200">
        <h1 className="font-serif text-lg font-semibold">{translate(lang, 'app.crash.title')}</h1>
        <p className="max-w-md text-sm text-gray-400">{translate(lang, 'app.crash.body')}</p>
        <button
          type="button"
          onClick={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}
          className="rounded bg-gray-200 px-4 py-2 text-xs font-semibold text-ink-950 transition-colors hover:bg-white"
        >
          {translate(lang, 'app.crash.action')}
        </button>
      </div>
    );
  }
}
