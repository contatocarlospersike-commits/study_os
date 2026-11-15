import { supabase } from '../lib/supabase';
import type {
  AnalyticsData,
  AutomationSettings,
  Book,
  ChatMessage,
  ChatThread,
  ChecklistItem,
  Concept,
  DailyPlanResponse,
  Flashcard,
  GraphData,
  LearningProfile,
  Material,
  NotificationLog,
  OpenCatalogItem,
  ProfessorEvaluation,
  ProfessorLesson,
  QuizAttemptResult,
  QuizDetail,
  QuizSummary,
  RecoveryPlan,
  RoutineConfig,
  StudySession,
  Subject,
  SubjectDetail,
  SuggestedBook,
  TriageResult,
  YoutubeEvaluationResult,
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
  deleteSubject: (id: string) =>
    request<{ ok: boolean }>(`/api/subjects/${id}`, { method: 'DELETE' }),
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

  // Library & Inbox ("Jogar o Grosso")
  getBooks: () => request<Book[]>('/api/library/books'),
  getOpenCatalog: () => request<OpenCatalogItem[]>('/api/library/open-catalog'),
  createBook: (body: Partial<Book> & { title: string }) =>
    request<Book>('/api/library/books', { method: 'POST', body: JSON.stringify(body) }),
  updateBook: (id: string, body: Partial<Book>) =>
    request<Book>(`/api/library/books/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteBook: (id: string) => request<{ ok: boolean }>(`/api/library/books/${id}`, { method: 'DELETE' }),
  generateSelectivePlan: (bookId: string, body: { exam_goal: string; toc_text?: string }) =>
    request<{ plan: string }>(`/api/library/books/${bookId}/selective-plan`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  triageInbox: (body: {
    title: string;
    file_type?: 'pdf' | 'text';
    content_base64?: string;
    text_content?: string;
    subject_id?: string | null;
  }) => request<TriageResult>('/api/library/inbox/triage', { method: 'POST', body: JSON.stringify(body) }),
  suggestBooksForSubject: (subjectId: string) =>
    request<{ subjectName: string; books: SuggestedBook[] }>('/api/library/suggest-books', {
      method: 'POST',
      body: JSON.stringify({ subject_id: subjectId }),
    }),

  // Cognitive: Graph, AI Links, Professor, Planner, Profile & Check-ins
  getGraph: () => request<GraphData>('/api/cognitive/graph'),
  suggestNoteLinks: (subjectId: string) =>
    request<{ suggestions: Array<{ label: string; reason: string; targetSubject: string }> }>(
      `/api/cognitive/subjects/${subjectId}/suggest-links`,
      { method: 'POST' }
    ),
  generateProfessorLesson: (body: { subject_id: string; topic: string }) =>
    request<ProfessorLesson>('/api/cognitive/professor/lesson', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  evaluateProfessorExplanation: (body: {
    subject_id: string;
    topic: string;
    user_explanation: string;
  }) =>
    request<ProfessorEvaluation>('/api/cognitive/professor/evaluate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  evaluateYoutubeLesson: (body: {
    subject_id?: string;
    topic: string;
    youtube_url?: string;
    transcript_fallback?: string;
  }) =>
    request<YoutubeEvaluationResult>('/api/cognitive/professor/evaluate-video', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  generateDailyPlan: (body: { available_minutes: number; routine?: RoutineConfig }) =>
    request<DailyPlanResponse>('/api/cognitive/planner/today', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getChecklist: () => request<ChecklistItem[]>('/api/cognitive/checklist'),
  toggleChecklistItem: (id: string) =>
    request<ChecklistItem>(`/api/cognitive/checklist/${id}/toggle`, { method: 'POST' }),
  deleteChecklistItem: (id: string) =>
    request<{ ok: boolean }>(`/api/cognitive/checklist/${id}`, { method: 'DELETE' }),
  getLearningProfile: async () => {
    const res = await request<{ profile: LearningProfile }>('/api/cognitive/profile');
    return res.profile;
  },
  updateLearningProfile: (body: Partial<LearningProfile>) =>
    request<LearningProfile>('/api/cognitive/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createCheckin: (body: {
    session_id?: string;
    block_mode?: string;
    duration_min?: number;
    energy_level: number;
    focus_level: number;
  }) =>
    request<{ ok: boolean; id: string }>('/api/cognitive/checkins', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
