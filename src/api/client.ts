import { supabase } from '../lib/supabase';
import type {
  AnalyticsData,
  AutomationSettings,
  ChatMessage,
  ChatThread,
  Concept,
  Flashcard,
  Material,
  NotificationLog,
  QuizAttemptResult,
  QuizDetail,
  QuizSummary,
  RecoveryPlan,
  StudySession,
  Subject,
  SubjectDetail,
} from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders: Record<string, string> = {};
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      authHeaders.Authorization = `Bearer ${data.session.access_token}`;
    }
  }

  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getSubjects: () => request<Subject[]>('/api/subjects'),
  getSubject: (id: string) => request<SubjectDetail>(`/api/subjects/${id}`),
  createSubject: (body: { name: string; color: string; description: string }) =>
    request<Subject>('/api/subjects', { method: 'POST', body: JSON.stringify(body) }),
  updateSubject: (
    id: string,
    body: Partial<Pick<Subject, 'name' | 'color' | 'description' | 'notes_markdown' | 'transcript_markdown'>>
  ) => request<Subject>(`/api/subjects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createConcept: (
    subjectId: string,
    body: { subtopic: string; title: string; summary: string; feynman_explanation: string }
  ) => request<Concept>(`/api/subjects/${subjectId}/concepts`, { method: 'POST', body: JSON.stringify(body) }),

  getReviews: (dueOnly = false, subjectId?: string) => {
    const params = new URLSearchParams();
    if (dueOnly) params.set('due', 'true');
    if (subjectId) params.set('subjectId', subjectId);
    return request<Flashcard[]>(`/api/reviews?${params.toString()}`);
  },
  createCard: (body: { subject_id: string; subtopic: string; front: string; back: string; hint?: string }) =>
    request<Flashcard>('/api/reviews', { method: 'POST', body: JSON.stringify(body) }),
  rateCard: (cardId: string, rating: 'again' | 'hard' | 'good' | 'easy') =>
    request<Flashcard>(`/api/reviews/${cardId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    }),

  getQuizzes: () => request<QuizSummary[]>('/api/quizzes'),
  getQuiz: (id: string) => request<QuizDetail>(`/api/quizzes/${id}`),
  submitQuiz: (id: string, answers: Record<string, number>) =>
    request<QuizAttemptResult>(`/api/quizzes/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),
  getRecoveryPlans: () => request<RecoveryPlan[]>('/api/quizzes/recovery-plans'),

  getSessions: () => request<StudySession[]>('/api/sessions'),
  startSession: (body: { subject_id: string; subtopic: string; mode: 'deep_work' | 'feynman' | 'interleaving' }) =>
    request<StudySession>('/api/sessions/start', { method: 'POST', body: JSON.stringify(body) }),
  endSession: (id: string, body: { duration_sec: number; notes_snapshot?: string }) =>
    request<{
      sessionId: string;
      durationSec: number;
      autoQuiz: { quizId: string; title: string; questionCount: number } | null;
    }>(`/api/sessions/${id}/end`, { method: 'POST', body: JSON.stringify(body) }),

  getAnalytics: () => request<AnalyticsData>('/api/analytics'),
  getAutomationSettings: () => request<AutomationSettings>('/api/automation/settings'),
  updateAutomationSettings: (body: Record<string, unknown>) =>
    request<AutomationSettings>('/api/automation/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  getNotificationLogs: () => request<NotificationLog[]>('/api/automation/logs'),
  testDispatch: (body?: { title?: string; message?: string }) =>
    request<{ logId: string; dispatchedChannels: string[]; status: string }>('/api/automation/test-dispatch', {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  runSchedulerNow: () => request<{ triggered: number }>('/api/automation/run-scheduler', { method: 'POST' }),

  getMaterials: (subjectId?: string) =>
    request<Material[]>(subjectId ? `/api/materials?subjectId=${subjectId}` : '/api/materials'),
  ingestMaterial: (body: {
    title: string;
    subject_id: string | null;
    file_type: 'pdf' | 'text';
    content_base64?: string;
    text_content?: string;
  }) => request<Material>('/api/materials/ingest', { method: 'POST', body: JSON.stringify(body) }),
  deleteMaterial: (id: string) => request<{ ok: boolean }>(`/api/materials/${id}`, { method: 'DELETE' }),

  getChatThreads: () => request<ChatThread[]>('/api/chat/threads'),
  getChatMessages: (threadId: string) => request<ChatMessage[]>(`/api/chat/threads/${threadId}/messages`),
  sendChatMessage: (body: {
    thread_id?: string;
    subject_id?: string | null;
    message: string;
    english_practice_mode?: boolean;
  }) => request<{ threadId: string; message: ChatMessage }>('/api/chat', { method: 'POST', body: JSON.stringify(body) }),
};
