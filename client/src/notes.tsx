import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { ClueView, PlayerView } from '../../shared/src/protocol.js';
import { IconClose, IconDown, IconSearch } from './icons.js';
import { T } from './strings.js';

const SEEN_KEY = 'bezgomin.seen';
const OPEN_KEY = 'bezgomin.open';
/** How long a just-read clue keeps its "new" highlight. */
const GLOW_MS = 60_000;

function loadList(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
}
function storeList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage unavailable: the state lasts until reload */
  }
}

/**
 * Clues this device has already shown. On the first run everything known so far counts as read,
 * so an update does not flood the notes with "new" marks.
 */
export function useSeenClues(ids: string[]): [Set<string>, (fresh: string[]) => void] {
  const [seen, setSeen] = useState<Set<string>>(() => {
    const stored = loadList(SEEN_KEY);
    if (stored) return new Set(stored);
    storeList(SEEN_KEY, ids);
    return new Set(ids);
  });
  const mark = (fresh: string[]) =>
    setSeen((old) => {
      const next = new Set(old);
      for (const id of fresh) next.add(id);
      storeList(SEEN_KEY, [...next]);
      return next;
    });
  return [seen, mark];
}

function plural(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return T.rec1;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return T.rec2;
  return T.rec5;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[ʼ’`]/g, "'").replace(/ё/g, 'е');
}

/** Wraps the matches of `needle` in <mark>. */
function hl(text: string, needle: string): string | JSX.Element[] {
  if (!needle) return text;
  const low = norm(text);
  const out: JSX.Element[] = [];
  let i = 0;
  let k = 0;
  while (true) {
    const j = low.indexOf(needle, i);
    if (j < 0) break;
    if (j > i) out.push(<span key={k++}>{text.slice(i, j)}</span>);
    out.push(<mark key={k++}>{text.slice(j, j + needle.length)}</mark>);
    i = j + needle.length;
  }
  if (!out.length) return text;
  out.push(<span key={k++}>{text.slice(i)}</span>);
  return out;
}

type Filter = 'all' | 'mine' | 'new';

interface Topic {
  id: string;
  title: string;
  level?: number;
  levelText?: string;
  clues: ClueView[];
}

export function Notes({
  v,
  seen,
  markSeen,
  active,
}: {
  v: PlayerView;
  seen: Set<string>;
  markSeen: (ids: string[]) => void;
  /** The notes are on screen right now (open tab on a phone, side column on a computer). */
  active: boolean;
}) {
  const j = v.journal;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set(loadList(OPEN_KEY) ?? []));
  const [glow, setGlow] = useState<Set<string>>(new Set());

  const needle = norm(query.trim());
  const isNew = (c: ClueView) => !seen.has(c.id) || glow.has(c.id);

  const qIds = new Set(j.questions.map((q) => q.id));
  const topics: Topic[] = j.questions.map((q) => ({
    id: q.id,
    title: q.question,
    level: q.level,
    levelText: q.levelText,
    clues: j.clues.filter((c) => c.mystery === q.id),
  }));
  const other = j.clues.filter((c) => !c.mystery || !qIds.has(c.mystery));
  if (other.length) topics.push({ id: '_other', title: T.otherClues, clues: other });

  const filtering = !!needle || filter !== 'all';
  const shown = topics
    .map((t) => {
      const titleHit = !!needle && norm(t.title).includes(needle);
      const clues = t.clues.filter(
        (c) =>
          (filter !== 'mine' || c.personal) &&
          (filter !== 'new' || isNew(c)) &&
          (!needle || titleHit || norm(`${c.title} ${c.text}`).includes(needle)),
      );
      return { ...t, shown: clues, titleHit };
    })
    .filter((t) => !filtering || t.shown.length > 0 || (t.titleHit && filter === 'all'));
  const people =
    filter === 'all' ? j.people.filter((p) => !needle || norm(`${p.name} ${p.desc}`).includes(needle)) : [];
  const isOpen = (id: string) => filtering || open.has(id);

  // Whatever is actually on screen counts as read; it keeps a highlight for a while.
  useEffect(() => {
    if (!active) return;
    const fresh: string[] = [];
    for (const t of shown) if (isOpen(t.id)) for (const c of t.shown) if (!seen.has(c.id)) fresh.push(c.id);
    if (!fresh.length) return;
    setGlow((g) => new Set([...g, ...fresh]));
    markSeen(fresh);
    window.setTimeout(
      () =>
        setGlow((g) => {
          const next = new Set(g);
          for (const id of fresh) next.delete(id);
          return next;
        }),
      GLOW_MS,
    );
  });
  useEffect(() => {
    if (!active) setGlow(new Set());
  }, [active]);

  const toggle = (id: string) =>
    setOpen((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      storeList(OPEN_KEY, [...next]);
      return next;
    });

  if (!j.clues.length && !j.questions.length && !j.people.length) return <p class="empty">{T.emptyNotes}</p>;

  const newCount = j.clues.filter(isNew).length;
  const mineCount = j.clues.filter((c) => c.personal).length;
  const chips: Array<{ id: Filter; label: string; n: number }> = [
    { id: 'all', label: T.filterAll, n: j.clues.length },
    { id: 'mine', label: T.filterMine, n: mineCount },
    ...(newCount > 0 || filter === 'new' ? [{ id: 'new' as Filter, label: T.filterNew, n: newCount }] : []),
  ];

  return (
    <div class="notes">
      <div class="notes-tools">
        <label class="search">
          <IconSearch />
          <input
            type="search"
            value={query}
            placeholder={T.notesSearch}
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
          {query && (
            <button type="button" class="search-clear" aria-label={T.notesClear} onClick={() => setQuery('')}>
              <IconClose />
            </button>
          )}
        </label>
        <div class="filters" role="tablist">
          {chips.map((c) => (
            <button
              type="button"
              role="tab"
              aria-selected={filter === c.id}
              class={`filter ${filter === c.id ? 'on' : ''} ${c.id === 'new' ? 'new' : ''}`}
              onClick={() => setFilter(c.id)}
            >
              {c.label}
              <span class="filter-n">{c.n}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 && people.length === 0 && <p class="empty">{T.nothingFound}</p>}

      <div class="topics">
        {shown.map((t) => {
          const opened = isOpen(t.id) && t.shown.length > 0;
          const fresh = t.clues.filter(isNew).length;
          const count = filtering ? t.shown.length : t.clues.length;
          return (
            <section key={t.id} class={`topic ${opened ? 'open' : ''}`}>
              <button
                type="button"
                class="topic-head"
                aria-expanded={opened}
                disabled={filtering || t.clues.length === 0}
                onClick={() => toggle(t.id)}
              >
                <span class="topic-main">
                  <span class="topic-q">{hl(t.title, needle)}</span>
                  <span class="topic-sub">
                    {t.levelText && <span class={`level l${t.level}`}>{t.levelText}</span>}
                    <span>{t.clues.length ? `${count} ${plural(count)}` : T.noCluesYet}</span>
                    {fresh > 0 && !opened && (
                      <span class="pill new">
                        +{fresh} {T.newShort}
                      </span>
                    )}
                  </span>
                </span>
                {!filtering && t.clues.length > 0 && <IconDown class="topic-chev" />}
              </button>
              {opened && (
                <div class="topic-body">
                  {t.shown.map((c) => (
                    <article key={c.id} class={`clue ${c.personal ? 'personal' : ''} ${isNew(c) ? 'glow' : ''}`}>
                      <div class="clue-head">
                        <b>{hl(c.title, needle)}</b>
                        {c.personal && (
                          <span class="pill mine">
                            <span class="pilcrow" aria-hidden="true">
                              ¶
                            </span>
                            {T.personalShort}
                          </span>
                        )}
                        {isNew(c) && <span class="pill new">{T.newShort}</span>}
                      </div>
                      <p>{hl(c.text, needle)}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {people.length > 0 && (
          <section class={`topic people-topic ${isOpen('_people') ? 'open' : ''}`}>
            <button
              type="button"
              class="topic-head"
              aria-expanded={isOpen('_people')}
              disabled={filtering}
              onClick={() => toggle('_people')}
            >
              <span class="topic-main">
                <span class="topic-q">{T.people}</span>
                <span class="topic-sub">
                  <span>{people.length}</span>
                </span>
              </span>
              {!filtering && <IconDown class="topic-chev" />}
            </button>
            {isOpen('_people') && (
              <div class="topic-body people">
                {people.map((p) => (
                  <div class="person">
                    <span class="avatar small">{p.name.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <b>{hl(p.name, needle)}</b>
                      <p>{hl(p.desc, needle)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
