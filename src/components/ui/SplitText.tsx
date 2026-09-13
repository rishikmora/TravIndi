import type { CSSProperties } from 'react';

/**
 * Splits display text into characters for the staggered 3D reveal while
 * exposing the intact string to assistive technology.
 */
export function SplitText({ text, className }: { text: string; className?: string }) {
  let index = 0;
  const words = text.split(' ');
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className={className} style={{ perspective: '900px' }}>
        {words.map((word, wordIndex) => (
          <span key={`${word}-${wordIndex}`} className="inline-block whitespace-nowrap">
            {Array.from(word).map((char, charIndex) => (
              <span
                key={charIndex}
                className="split-char"
                style={{ '--char-index': index++ } as CSSProperties}
              >
                {char}
              </span>
            ))}
            {wordIndex < words.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
          </span>
        ))}
      </span>
    </>
  );
}
