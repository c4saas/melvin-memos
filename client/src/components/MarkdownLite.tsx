import { Fragment, type ReactNode } from 'react';
import { cn } from '../lib/utils';

/**
 * Minimal markdown renderer — no deps.
 * Supports: headings (#, ##, ###), unordered lists (- or *), ordered lists (1.),
 * bold (**x**), italic (*x* / _x_), inline code (`x`), blockquotes (>), links ([x](y)),
 * horizontal rules (---), and paragraphs. Good enough for LLM-generated summaries.
 *
 * Intentionally strict: no images, no HTML passthrough, no tables. Keeps XSS surface small.
 */

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'blockquote'; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++; continue;
    }

    // Blank line
    if (line.trim() === '') { i++; continue; }

    // Heading
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length as 1 | 2 | 3, text: h[2].trim() });
      i++; continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const chunk: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        chunk.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', text: chunk.join(' ') });
      continue;
    }

    // Paragraph: consume until blank line or block start
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i])
    ) {
      para.push(lines[i].trimEnd());
      i++;
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') });
  }

  return blocks;
}

// Renders inline markdown (bold, italic, code, links) safely as React nodes.
function renderInline(text: string, keyPrefix = ''): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let keyIdx = 0;

  // Single regex handles all inline tokens in priority order.
  const rx = /(\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*]+?)\*|_([^_]+?)_|`([^`]+?)`|\[([^\]]+)\]\(([^)\s]+)\))/g;

  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    if (m.index > cursor) {
      nodes.push(text.slice(cursor, m.index));
    }
    const k = `${keyPrefix}-i${keyIdx++}`;
    if (m[2] !== undefined || m[3] !== undefined) {
      nodes.push(<strong key={k}>{m[2] ?? m[3]}</strong>);
    } else if (m[4] !== undefined || m[5] !== undefined) {
      nodes.push(<em key={k}>{m[4] ?? m[5]}</em>);
    } else if (m[6] !== undefined) {
      nodes.push(<code key={k}>{m[6]}</code>);
    } else if (m[7] !== undefined && m[8] !== undefined) {
      const href = m[8];
      const safe = /^(https?:|mailto:|\/)/i.test(href) ? href : '#';
      nodes.push(
        <a key={k} href={safe} target="_blank" rel="noopener noreferrer">
          {m[7]}
        </a>,
      );
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function MarkdownLite({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const blocks = parseBlocks(source ?? '');

  return (
    <div className={cn('summary-prose', className)}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const Tag = (`h${b.level}`) as 'h1' | 'h2' | 'h3';
            return <Tag key={i}>{renderInline(b.text, `h${i}`)}</Tag>;
          }
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `ul${i}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `ol${i}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'blockquote':
            return <blockquote key={i}>{renderInline(b.text, `bq${i}`)}</blockquote>;
          case 'hr':
            return <hr key={i} />;
          case 'paragraph':
            return <p key={i}>{renderInline(b.text, `p${i}`)}</p>;
          default: {
            const _never: never = b;
            return <Fragment key={i}>{''}{_never}</Fragment>;
          }
        }
      })}
    </div>
  );
}

/**
 * Convert markdown to a plain-text preview (strips all formatting).
 * Used for truncated summary text in cards where rendering full HTML would be overkill.
 */
export function markdownToText(md: string): string {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, '')         // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')            // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')   // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')// links
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')     // ATX headings
    .replace(/^\s*[-*+]\s+/gm, '• ')        // bullets
    .replace(/^\s*\d+[.)]\s+/gm, '')        // ordered list numbers
    .replace(/^\s*>\s?/gm, '')              // blockquotes
    .replace(/\*\*([^*]+)\*\*/g, '$1')      // bold
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')          // italic
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^---+\s*$/gm, '')             // hr
    .replace(/\n{3,}/g, '\n\n')             // collapse blank runs
    .trim();
}
