import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { StudySession } from '../types';

export function useStudySession(onAutoQuizGenerated?: (quizId: string, title: string) => void) {
  const [activeSession, setActiveSession] = useState<StudySession | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [ending, setEnding] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeSession) {
      intervalRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } else if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [activeSession]);

  const start = async (
    subjectId: string,
    subtopic: string,
    mode: 'deep_work' | 'feynman' | 'interleaving'
  ) => {
    const session = await api.startSession({ subject_id: subjectId, subtopic, mode });
    setElapsedSec(0);
    setActiveSession(session);
    return session;
  };

  const end = async (notesSnapshot = '') => {
    if (!activeSession) return null;
    setEnding(true);
    try {
      const result = await api.endSession(activeSession.id, {
        duration_sec: Math.max(1, elapsedSec),
        notes_snapshot: notesSnapshot,
      });
      setActiveSession(null);
      setElapsedSec(0);
      if (result.autoQuiz && onAutoQuizGenerated) {
        onAutoQuizGenerated(result.autoQuiz.quizId, result.autoQuiz.title);
      }
      return result;
    } finally {
      setEnding(false);
    }
  };

  return {
    activeSession,
    elapsedSec,
    ending,
    start,
    end,
  };
}
