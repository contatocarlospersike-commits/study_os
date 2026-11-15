export type NavView =
  | 'dashboard'
  | 'subjects'
  | 'library'
  | 'tutor'
  | 'professor'
  | 'quizzes'
  | 'reviews'
  | 'analytics'
  | 'automation';

export interface Book {
  id: string;
  subject_id: string | null;
  subject_name?: string | null;
  subject_color?: string | null;
  title: string;
  author: string;
  source_type: 'pearson' | 'open_access' | 'pdf' | 'physical';
  external_url: string;
  status: 'to_read' | 'reading' | 'read';
  current_page: number;
  total_pages: number;
  summary_markdown: string;
  insights_markdown: string;
  selective_plan_markdown: string;
  created_at: string;
  updated_at: string;
}

export interface OpenCatalogItem {
  id: string;
  title: string;
  author: string;
  category: string;
  total_pages: number;
  source_type: 'open_access';
  external_url: string;
  description: string;
}

export interface BacklinkItem {
  id: string;
  source_subject_id: string;
  source_subject_name: string;
  source_subject_color: string;
  target_label: string;
  created_at: string;
}

export interface GraphData {
  subjects: Array<{ id: string; name: string; color: string }>;
  links: Array<{
    id: string;
    source_subject_id: string;
    target_label: string;
    target_subject_id: string | null;
  }>;
}

export interface LearningProfile {
  user_id: string;
  preferred_block_min: number;
  visual_preference: number;
  frequent_questions: number;
  english_level: 'beginner' | 'intermediate' | 'advanced';
  updated_at: string;
}

export interface ProfessorLesson {
  title: string;
  analogy: string;
  coreExplanation: string;
  mermaidDiagram: string;
  checkpointQuestion: string;
  englishTermTip: string;
}

export interface ProfessorEvaluation {
  score: number;
  strengths: string[];
  gaps: string[];
  correctedExplanation: string;
  nextStep: string;
}

export interface DailyPlanResponse {
  availableMinutes: number;
  recommendedBlockMin: number;
  summary: string;
  blocks: Array<{
    order: number;
    durationMin: number;
    actionType: 'review' | 'quiz' | 'feynman' | 'reading' | 'rag_chat';
    subjectName: string;
    title: string;
    reason: string;
  }>;
}

export interface TriageResult {
  classification: {
    subjectId: string | null;
    subjectName: string;
    isNewSubject: boolean;
    subtopic: string;
    concepts: Array<{ title: string; summary: string }>;
    flashcards: Array<{ front: string; back: string; hint: string }>;
    quizQuestions: Array<{
      prompt: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }>;
  };
  materialId: string | null;
  createdConcepts: number;
  createdFlashcards: number;
  createdQuizId: string | null;
}

export interface Material {
  id: string;
  subject_id: string | null;
  subject_name?: string;
  title: string;
  file_type: string;
  page_count: number;
  chunk_count: number;
  status: string;
  created_at: string;
}

export interface RagCitation {
  materialTitle: string;
  pageNumber: number;
  quote: string;
}

export interface ChatThread {
  id: string;
  subject_id: string | null;
  subject_name?: string;
  title: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: RagCitation[];
  mermaid_diagram: string;
  grounding_status: 'grounded' | 'partial' | 'not_in_materials';
  verified_by_critic: boolean;
  follow_up_questions: string[];
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  color: string;
  description: string;
  notes_markdown: string;
  transcript_markdown: string;
  created_at: string;
  updated_at: string;
  concept_count?: number;
  card_count?: number;
  due_count?: number;
}

export interface Concept {
  id: string;
  subject_id: string;
  subtopic: string;
  title: string;
  summary: string;
  feynman_explanation: string;
  created_at: string;
}

export interface SubjectDetail extends Subject {
  concepts: Concept[];
  flashcards: Flashcard[];
  backlinks?: BacklinkItem[];
}

export interface Flashcard {
  id: string;
  subject_id: string;
  concept_id: string | null;
  subtopic: string;
  front: string;
  back: string;
  hint: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  step_index: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  subject_name?: string;
  subject_color?: string;
}

export interface QuizSummary {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  title: string;
  type: 'standard' | 'recovery' | 'auto_session';
  source_session_id: string | null;
  created_at: string;
  question_count: number;
  last_score_pct: number | null;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  subtopic: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface QuizDetail extends QuizSummary {
  questions: QuizQuestion[];
}

export interface QuizAttemptResult {
  attemptId: string;
  quizId: string;
  scorePct: number;
  correctCount: number;
  totalCount: number;
  threshold: number;
  weakSubtopics: string[];
  recoveryPlan: {
    id: string;
    recoveryQuizId: string;
    weakSubtopics: string[];
    recommendation: string;
  } | null;
  breakdown: Array<{
    questionId: string;
    subtopic: string;
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }>;
}

export interface RecoveryPlan {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_color: string;
  attempt_id: string;
  weak_subtopics: string[];
  recovery_quiz_id: string | null;
  recovery_quiz_title: string | null;
  status: 'pending' | 'completed';
  recommendation: string;
  created_at: string;
}

export interface StudySession {
  id: string;
  subject_id: string;
  subject_name?: string;
  subject_color?: string;
  subtopic: string;
  mode: 'deep_work' | 'feynman' | 'interleaving';
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  auto_quiz_id: string | null;
}

export interface AutomationSettings {
  id: number;
  n8n_webhook_url: string;
  webhook_secret: string;
  whatsapp_enabled: number;
  whatsapp_phone_number_id: string;
  whatsapp_recipient_phone: string;
  push_enabled: number;
  auto_quiz_on_session_end: number;
  recovery_threshold_pct: number;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  event_type: string;
  channel: string;
  title: string;
  message: string;
  payload_json: string;
  status: 'dispatched' | 'queued_local' | 'failed';
  response_code: number | null;
  created_at: string;
}

export interface AnalyticsData {
  totals: {
    total_subjects: number;
    total_cards: number;
    due_cards: number;
    total_attempts: number;
    avg_score_pct: number | null;
    pending_recoveries: number;
    total_study_sec: number;
  };
  bySubject: Array<{
    id: string;
    name: string;
    color: string;
    card_count: number;
    due_count: number;
    avg_interval_days: number | null;
    avg_quiz_score: number | null;
  }>;
  recentAttempts: Array<{
    id: string;
    quiz_id: string;
    quiz_title: string;
    subject_name: string;
    subject_color: string;
    score_pct: number;
    correct_count: number;
    total_count: number;
    completed_at: string;
  }>;
  intervalBuckets: {
    d1: number;
    d3: number;
    d7: number;
    d15: number;
    d30_plus: number;
  };
}
