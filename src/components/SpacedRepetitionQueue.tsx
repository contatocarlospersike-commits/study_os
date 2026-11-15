import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Layers,
  Plus,
  Volume2,
} from 'lucide-react';
import { api } from '../api/client';
import type { Flashcard, Subject } from '../types';

interface SpacedRepetitionQueueProps {
  subjects: Subject[];
  onReviewed: () => Promise<void>;
}

const LADDER = [1, 3, 7, 15, 30];

function previewNextDays(card: Flashcard, rating: 'again' | 'hard' | 'good' | 'easy'): number {
  if (rating === 'again') return 1;
  if (rating === 'hard') {
    return card.step_index < LADDER.length
      ? LADDER[card.step_index]
      : Math.max(1, Math.round(card.interval_days * 1.2));
  }
  if (rating === 'good') {
    if (card.repetitions === 0) return 1;
    const nextIdx = card.step_index + 1;
    return nextIdx < LADDER.length ? LADDER[nextIdx] : Math.round(card.interval_days * card.ease_factor);
  }
  const nextIdx = card.step_index + 2;
  return nextIdx < LADDER.length
    ? LADDER[nextIdx]
    : Math.round(Math.max(30, card.interval_days) * card.ease_factor * 1.15);
}

export function SpacedRepetitionQueue({ subjects, onReviewed }: SpacedRepetitionQueueProps) {
  const [dueOnly, setDueOnly] = useState(true);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);

  // Quick Add Card
  const [showAdd, setShowAdd] = useState(false);
  const [newSubjectId, setNewSubjectId] = useState(subjects[0]?.id || '');
  const [newSubtopic, setNewSubtopic] = useState('');
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');

  const loadCards = async () => {
    const list = await api.getReviews(dueOnly);
    setCards(list);
    setActiveIndex(0);
    setFlipped(false);
    setShowHint(false);
  };

  useEffect(() => {
    void loadCards();
  }, [dueOnly]);

  const currentCard = cards[activeIndex] || null;

  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.02;
    window.speechSynthesis.speak(utter);
  };

  const handleRate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!currentCard || ratingBusy) return;
    setRatingBusy(true);
    try {
      await api.rateCard(currentCard.id, rating);
      await loadCards();
      await onReviewed();
    } finally {
      setRatingBusy(false);
    }
  };

  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSub = newSubjectId || subjects[0]?.id;
    if (!targetSub || !newFront.trim() || !newBack.trim()) return;
    await api.createCard({
      subject_id: targetSub,
      subtopic: newSubtopic.trim() || 'General',
      front: newFront.trim(),
      back: newBack.trim(),
    });
    setNewFront('');
    setNewBack('');
    setNewSubtopic('');
    setShowAdd(false);
    await loadCards();
    await onReviewed();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Modified SM-2 · 1 / 3 / 7 / 15 / 30d Ladder
          </p>
          <h1 className="heading-fluid font-bold text-zinc-50">Spaced Repetition Queue</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
            <button
              type="button"
              onClick={() => setDueOnly(true)}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                dueOnly ? 'bg-cyan-500 text-zinc-950' : 'text-zinc-300'
              }`}
            >
              Due Now
            </button>
            <button
              type="button"
              onClick={() => setDueOnly(false)}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold ${
                !dueOnly ? 'bg-cyan-500 text-zinc-950' : 'text-zinc-300'
              }`}
            >
              All Cards
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 text-xs font-semibold text-zinc-950 hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            Add Card
          </button>
        </div>
      </div>

      {showAdd && (
        <form
          onSubmit={handleCreateCard}
          className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-2"
        >
          <select
            aria-label="Card Subject"
            value={newSubjectId || subjects[0]?.id || ''}
            onChange={(e) => setNewSubjectId(e.target.value)}
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newSubtopic}
            onChange={(e) => setNewSubtopic(e.target.value)}
            placeholder="Sub-topic (e.g. Limits)"
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
          />
          <textarea
            required
            rows={2}
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
            placeholder="Front (Active Recall prompt)..."
            className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
          />
          <textarea
            required
            rows={2}
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
            placeholder="Back (Concise answer + intuition)..."
            className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
          />
          <button
            type="submit"
            className="min-h-[44px] rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-400 sm:col-span-2"
          >
            Save Flashcard to Queue
          </button>
        </form>
      )}

      {currentCard ? (
        <div className="mx-auto max-w-2xl space-y-4">
          {/* Active Flashcard */}
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/85 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: currentCard.subject_color || '#22d3ee' }}
                />
                <span className="text-xs font-semibold text-zinc-300">
                  {currentCard.subject_name} · {currentCard.subtopic}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-mono text-zinc-300">
                  {currentCard.interval_days}d · EF {currentCard.ease_factor.toFixed(2)}
                </span>
                <button
                  type="button"
                  aria-label="Read card aloud"
                  onClick={() =>
                    speakText(flipped ? currentCard.back : currentCard.front)
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950 text-cyan-400 hover:bg-zinc-800"
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="my-6 min-h-[140px] flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Prompt
              </p>
              <p className="mt-2 text-lg font-semibold leading-snug text-zinc-50 sm:text-xl">
                {currentCard.front}
              </p>

              {!flipped && currentCard.hint && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowHint((h) => !h)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
                  >
                    {showHint ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showHint ? 'Hide Hint' : 'Show Hint'}
                  </button>
                  {showHint && (
                    <p className="mt-1.5 text-xs text-amber-300/90">{currentCard.hint}</p>
                  )}
                </div>
              )}

              {flipped && (
                <div className="mt-6 border-t border-zinc-800 pt-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Answer & Synthesis
                  </p>
                  <p className="mt-2 whitespace-pre-line text-base leading-relaxed text-zinc-200">
                    {currentCard.back}
                  </p>
                </div>
              )}
            </div>

            {!flipped ? (
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="min-h-[52px] w-full rounded-2xl bg-cyan-500 px-6 text-sm font-bold text-zinc-950 hover:bg-cyan-400"
              >
                Reveal Answer
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(
                  [
                    { id: 'again', label: 'Again', cls: 'border-rose-500/40 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50' },
                    { id: 'hard', label: 'Hard', cls: 'border-amber-500/40 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50' },
                    { id: 'good', label: 'Good', cls: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50' },
                    { id: 'easy', label: 'Easy', cls: 'border-cyan-500/40 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/50' },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    disabled={ratingBusy}
                    onClick={() => handleRate(btn.id)}
                    className={`flex min-h-[54px] flex-col items-center justify-center rounded-2xl border px-3 py-2 text-xs font-semibold ${btn.cls}`}
                  >
                    <span>{btn.label}</span>
                    <span className="mt-0.5 text-[11px] opacity-80">
                      {previewNextDays(currentCard, btn.id)}d
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Swipeable Queue Preview Strip */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-400">
              Queue ({cards.length} cards) — swipe or tap to jump
            </p>
            <div className="swipe-deck" role="region" aria-label="Flashcard Queue">
              {cards.map((c, idx) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setActiveIndex(idx);
                    setFlipped(false);
                    setShowHint(false);
                  }}
                  className={`min-w-[180px] max-w-[220px] shrink-0 rounded-xl border p-3 text-left ${
                    idx === activeIndex
                      ? 'border-cyan-400 bg-cyan-950/30'
                      : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-[11px] font-semibold text-zinc-400">{c.subtopic}</span>
                  <p className="mt-1 line-clamp-2 text-xs font-medium text-zinc-100">{c.front}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-900/50 px-6 py-14 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          <h2 className="mt-3 text-lg font-bold text-zinc-100">Queue Clear!</h2>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            All due Spaced Repetition cards are reviewed. Switch to "All Cards" to practice ahead or add new concepts in Subject Hubs.
          </p>
          <button
            type="button"
            onClick={() => setDueOnly(false)}
            className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-semibold text-zinc-100 hover:bg-zinc-800"
          >
            <Layers className="h-4 w-4 text-cyan-400" />
            Browse All Cards
          </button>
        </div>
      )}
    </div>
  );
}
