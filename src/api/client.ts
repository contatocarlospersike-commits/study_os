import { supabase } from '../lib/supabase';
import type {
  AnalyticsData,
  AnimatedLesson,
  AnimatedLessonModule,
  AnimatedScene,
  AutomationSettings,
  Book,
  ChatMessage,
  ChatThread,
  ChecklistItem,
  Concept,
  DailyPlanResponse,
  FeynmanLesson,
  Flashcard,
  GraphData,
  LearningProfile,
  Material,
  NoteDetail,
  NoteItem,
  NotificationLog,
  OpenCatalogItem,
  ProfessorEvaluation,
  ProfessorLesson,
  QuizAttemptResult,
  QuizDetail,
  QuizSummary,
  RecoveryPlan,
  RoutineConfig,
  StudyBlock,
  StudyPlan,
  StudySession,
  Subject,
  SubjectDetail,
  SuggestedBook,
  TriageResult,
  YoutubeEvaluationResult,
} from '../types';

const GET_CACHE = new Map<string, { data: unknown; ts: number }>();
const IN_FLIGHT = new Map<string, Promise<unknown>>();
const CACHE_TTL_MS = 60_000;
const LS_PREFIX = 'studyos_api_cache:';

function readLocalCache<T>(path: string): T | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + path);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeLocalCache(path: string, data: unknown) {
  try {
    localStorage.setItem(LS_PREFIX + path, JSON.stringify(data));
  } catch {
    // ignore storage quota errors
  }
}

function clearLocalCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function getCachedSync<T>(path: string): T | null {
  const mem = GET_CACHE.get(path);
  if (mem) return mem.data as T;
  return readLocalCache<T>(path);
}

export function invalidateApiCache() {
  GET_CACHE.clear();
  clearLocalCache();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();

  if (method === 'GET') {
    const cached = GET_CACHE.get(path);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data as T;
    }
    const existing = IN_FLIGHT.get(path);
    if (existing) {
      return existing as Promise<T>;
    }
  } else {
    GET_CACHE.clear();
    clearLocalCache();
  }

  const exec = (async () => {
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
    const json = (await res.json()) as T;
    if (method === 'GET') {
      GET_CACHE.set(path, { data: json, ts: Date.now() });
      writeLocalCache(path, json);
    }
    return json;
  })();

  if (method === 'GET') {
    IN_FLIGHT.set(path, exec);
    try {
      return await exec;
    } finally {
      IN_FLIGHT.delete(path);
    }
  }

  return exec;
}

export const api = {
  getSubjects: () => request<Subject[]>('/api/subjects'),
  getSubject: (id: string) => request<SubjectDetail>(`/api/subjects/${id}`),
  createSubject: (body: {
    name: string;
    color: string;
    description: string;
    icon?: string;
    cover_style?: string;
    kind?: 'subject' | 'project';
  }) => request<Subject>('/api/subjects', { method: 'POST', body: JSON.stringify(body) }),
  updateSubject: (
    id: string,
    body: Partial<
      Pick<Subject, 'name' | 'color' | 'description' | 'notes_markdown' | 'transcript_markdown' | 'icon' | 'cover_style' | 'kind'>
    >
  ) => request<Subject>(`/api/subjects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSubject: (id: string) =>
    request<{ ok: boolean }>(`/api/subjects/${id}`, { method: 'DELETE' }),

  getNotes: (subjectId?: string) => {
    const params = new URLSearchParams();
    if (subjectId) params.set('subjectId', subjectId);
    const qs = params.toString();
    return request<NoteItem[]>(`/api/notes${qs ? `?${qs}` : ''}`);
  },
  getNote: (id: string) => request<NoteDetail>(`/api/notes/${id}`),
  createNote: (body: {
    subject_id: string;
    parent_id?: string | null;
    title: string;
    icon?: string;
    cover_style?: string;
    page_type?: 'note' | 'folder' | 'project';
    status?: string;
    content_markdown?: string;
  }) => request<NoteItem>('/api/notes', { method: 'POST', body: JSON.stringify(body) }),
  updateNote: (
    id: string,
    body: Partial<
      Pick<NoteItem, 'title' | 'icon' | 'cover_style' | 'page_type' | 'status' | 'content_markdown' | 'parent_id'>
    >
  ) => request<NoteItem>(`/api/notes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteNote: (id: string) =>
    request<{ ok: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
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
  generateQuiz: (body: { subject_id: string; topic?: string }) =>
    request<QuizSummary>('/api/quizzes/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
    model_mode?: 'fast' | 'deep';
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

  getStudyPlan: (subjectId: string) =>
    request<{ plan: StudyPlan | null; blocks: StudyBlock[] }>(`/api/study-plans/subject/${subjectId}`),
  generateStudyPlan: (body: {
    subject_id: string;
    days: string[];
    slots: { morning: number; afternoon: number; night: number };
    exam_date?: string;
  }) =>
    request<{ plan: StudyPlan; blocks: StudyBlock[] }>('/api/study-plans/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  prepareStudyBlock: (blockId: string, force = false) =>
    request<{ block: StudyBlock; createdFlashcards: number; quizId: string | null }>(
      `/api/study-plans/blocks/${blockId}/prepare`,
      { method: 'POST', body: JSON.stringify({ force }) }
    ),
  toggleStudyBlockComplete: (blockId: string) =>
    request<StudyBlock>(`/api/study-plans/blocks/${blockId}/complete`, { method: 'POST' }),

  getFeynmanLessons: (subjectId?: string) =>
    request<FeynmanLesson[]>(
      subjectId
        ? `/api/cognitive/feynman-lessons?subjectId=${encodeURIComponent(subjectId)}`
        : '/api/cognitive/feynman-lessons'
    ),
  generateFeynmanLesson: (body: {
    subject_id?: string | null;
    pdf_base64?: string;
    pdf_filename?: string;
    transcript_text?: string;
    topic_hint?: string;
    model?: string;
    save_to_workspace?: boolean;
  }) =>
    request<FeynmanLesson>('/api/cognitive/feynman-lessons/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteFeynmanLesson: (id: string) =>
    request<{ ok: boolean }>(`/api/cognitive/feynman-lessons/${id}`, { method: 'DELETE' }),

  startMediaUpload: (body: { filename: string; mime_type: string; size_bytes: number }) =>
    request<{ uploadUrl: string }>('/api/cognitive/media/start-upload', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  checkMediaStatus: (name: string) =>
    request<{ state: string; uri: string; mimeType: string }>(
      `/api/cognitive/media/status?name=${encodeURIComponent(name)}`
    ),
  getAnimatedLessons: () => request<AnimatedLesson[]>('/api/cognitive/animated-lessons'),
  generateAnimatedLesson: (body: {
    subject_id?: string | null;
    topic_hint?: string;
    transcript_text?: string;
    pdf_base64?: string;
    file_uri?: string;
    file_mime_type?: string;
    media_files?: Array<{ uri: string; mime_type: string; name?: string }>;
    target_minutes: number;
    technique: string;
  }) =>
    request<AnimatedLesson>('/api/cognitive/animated-lessons/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  expandAnimatedLessonModule: (
    lessonId: string,
    body: {
      module_index: number;
      file_uri?: string;
      file_mime_type?: string;
      media_files?: Array<{ uri: string; mime_type: string; name?: string }>;
    }
  ) =>
    request<{ modules: AnimatedLessonModule[]; scenes: AnimatedScene[] }>(
      `/api/cognitive/animated-lessons/${lessonId}/expand-module`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
  saveAnimatedLessonToWorkspace: (lessonId: string, subjectId?: string) =>
    request<{ ok: boolean; noteId: string }>(
      `/api/cognitive/animated-lessons/${lessonId}/save-workspace`,
      { method: 'POST', body: JSON.stringify({ subject_id: subjectId }) }
    ),
  deleteAnimatedLesson: (id: string) =>
    request<{ ok: boolean }>(`/api/cognitive/animated-lessons/${id}`, { method: 'DELETE' }),
  generateTts: (body: { text: string; voice?: string }) =>
    request<{ audio_base64: string; mime_type: string }>('/api/cognitive/tts', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};
