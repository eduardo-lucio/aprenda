import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';

const typeDelay = () => 40 + Math.random() * 45;
const SUBTITLE_DELAY = 16;
const ERASE_DELAY = 26;
const BEFORE_SUBTITLE = 350;
const AFTER_SUBTITLE = 2200;
const HOLD_PHRASE = 2800;
const BEFORE_NEXT_PHRASE = 350;

/** Terminal-style headline of a blank session. `active` stops it once the student has sent the prompt. */
export const HeroHeadline: React.FC<{ active: boolean }> = ({ active }) => {
  const { t, lang } = useI18n();
  const phrases = useMemo(
    () => [t('session.empty.title'), t('session.empty.alt1'), t('session.empty.alt2'), t('session.empty.alt3')],
    [lang]
  );
  const subtitleText = t('session.empty.subtitle');
  const [reduced] = useState(() => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const [title, setTitle] = useState(reduced ? phrases[0] : '');
  const [subtitle, setSubtitle] = useState(reduced ? subtitleText : '');
  const [cursorOn, setCursorOn] = useState<'title' | 'subtitle'>('title');

  useEffect(() => {
    if (reduced) {
      setTitle(phrases[0]);
      setSubtitle(subtitleText);
      return;
    }
    if (!active) return;

    let timer: ReturnType<typeof setTimeout>;
    // Cleanup clears the timer, so a cancelled run simply never continues
    const wait = (ms: number) => new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); });
    const typeOut = async (text: string, write: (v: string) => void, delay: () => number) => {
      for (let i = 1; i <= text.length; i++) {
        write(text.slice(0, i));
        await wait(delay());
      }
    };
    const erase = async (text: string) => {
      for (let i = text.length - 1; i >= 0; i--) {
        setTitle(text.slice(0, i));
        await wait(ERASE_DELAY);
      }
    };

    void (async () => {
      setTitle('');
      setSubtitle('');
      setCursorOn('title');
      await typeOut(phrases[0], setTitle, typeDelay);
      await wait(BEFORE_SUBTITLE);
      setCursorOn('subtitle');
      await typeOut(subtitleText, setSubtitle, () => SUBTITLE_DELAY);
      await wait(AFTER_SUBTITLE);
      setCursorOn('title');

      for (let index = 0; ; index = (index + 1) % phrases.length) {
        await wait(HOLD_PHRASE);
        await erase(phrases[index]);
        await wait(BEFORE_NEXT_PHRASE);
        await typeOut(phrases[(index + 1) % phrases.length], setTitle, typeDelay);
      }
    })();

    return () => clearTimeout(timer);
  }, [active, phrases, subtitleText, reduced]);

  const longestPhrase = phrases.reduce((a, b) => (b.length > a.length ? b : a));
  const cursor = !reduced && <span aria-hidden className="hero-cursor" />;

  return (
    <div className="space-y-2.5 font-mono">
      {/* The transparent copy reserves the final size, so typing never moves the field below */}
      <h2
        aria-label={phrases[0]}
        className="relative text-2xl font-semibold leading-tight text-gray-100 md:text-3xl xl:text-4xl"
      >
        <span className="text-transparent">&gt; {longestPhrase}</span>
        <span data-testid="hero-title" className="absolute inset-0">
          <span className="text-gray-500">&gt; </span>
          {title}
          {cursorOn === 'title' && cursor}
        </span>
      </h2>
      <p className="relative text-sm leading-relaxed text-gray-400">
        <span className="text-transparent">{subtitleText}</span>
        <span data-testid="hero-subtitle" aria-hidden className="absolute inset-0">
          {subtitle}
          {cursorOn === 'subtitle' && cursor}
        </span>
      </p>
    </div>
  );
};
