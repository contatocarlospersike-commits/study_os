export type NavView =
  | 'dashboard'
  | 'subjects'
  | 'library'
  | 'tutor'
  | 'professor'
  | 'practice'
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
  cover_style?: string;
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
  source_note_id?: string | null;
  target_label: string;
  created_at: string;
}

export interface NoteItem {
  id: string;
  subject_id: string;
  parent_id: string | null;
  title: string;
  icon: string;
  cover_style: string;
  page_type: 'note' | 'folder' | 'project';
  status: string;
  content_markdown: string;
  created_at: string;
  updated_at: string;
}

export interface NoteBacklink {
  id: string;
  source_note_id: string | null;
  source_note_title?: string | null;
  source_subject_id: string;
  source_subject_name: string;
  source_subject_color: string;
  target_label: string;
  created_at: string;
}

export interface NoteDetail extends NoteItem {
  backlinks: NoteBacklink[];
}

export interface GraphData {
  subjects: Array<{ id: string; name: string; color: string; icon?: string; kind?: string }>;
  notes?: Array<{
    id: string;
    subject_id: string;
    title: string;
    icon: string;
    page_type: string;
  }>;
  links: Array<{
    id: string;
    source_subject_id: string;
    source_note_id?: string | null;
    target_label: string;
    target_subject_id: string | null;
    target_note_id?: string | null;
  }>;
}

export interface SuggestedBook {
  title: string;
  author: string;
  reason: string;
  availability_hint: string;
  open_pdf_url: string;
  pearson_likely: boolean;
  estimated_pages: number;
}

export interface LearningProfile {
  user_id: string;
  preferred_block_min: number;
  visual_preference: number;
  frequent_questions: number;
  english_level: 'beginner' | 'intermediate' | 'advanced';
  routine_json?: string;
  updated_at: string;
}

export interface RoutineConfig {
  examGoal?: string;
  preferredTime?: string;
  focusBalance?: 'balanced' | 'catchup' | 'advance';
}

export interface ChecklistItem {
  id: string;
  title: string;
  subject_name: string;
  action_type: string;
  duration_min: number;
  reason: string;
  completed: number;
  scheduled_date: string;
  created_at: string;
}

export interface ProfessorLesson {
  title: string;
  hook30s: string;
  structureBlocks: string[];
  analogy: string;
  coreExplanation: string;
  mermaidDiagram: string;
  checkpointQuestion: string;
  audienceQuestion: string;
  englishTermTip: string;
}

export interface ProfessorEvaluation {
  score: number;
  strengths: string[];
  gaps: string[];
  correctedExplanation: string;
  nextStep: string;
}

export interface YoutubeEvaluationResult {
  technicalScore: number;
  creatorScore: number;
  strengths: string[];
  gaps: string[];
  correctedExplanation: string;
  hookFeedback: string;
  communicationFeedback: string;
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
  checklist?: ChecklistItem[];
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
  icon?: string;
  cover_style?: string;
  kind?: 'subject' | 'project';
  description: string;
  notes_markdown: string;
  transcript_markdown: string;
  created_at: string;
  updated_at: string;
  concept_count?: number;
  card_count?: number;
  due_count?: number;
  note_count?: number;
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
  notes?: NoteItem[];
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

export interface StudyPlan {
  id: string;
  subject_id: string;
  exam_date: string;
  days: string[];
  slots: { morning: number; afternoon: number; night: number };
  strategy_summary: string;
  created_at: string;
  updated_at: string;
}

export interface StudyBlock {
  id: string;
  plan_id: string;
  subject_id: string;
  week_number: number;
  day_label: string;
  shift_label: string;
  duration_min: number;
  topic: string;
  technique: string;
  objective: string;
  lesson_markdown: string;
  quiz_id: string | null;
  status: 'pending' | 'ready' | 'completed';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FeynmanLesson {
  id: string;
  subject_id: string | null;
  subject_name?: string | null;
  titulo_aula: string;
  conceito_central: string;
  analogia_mundo_real: string;
  traducao_tecnica: string;
  armadilhas_comuns: string[];
  perguntas_active_recall: string[];
  source_filename?: string;
  model_used?: string;
  workspace_note_id?: string | null;
  created_at: string;
}

export interface AnimatedVisualNode {
  label: string;
  detail: string;
  kind: 'core' | 'analogy' | 'example' | 'warning' | 'connection';
}

export interface AnimatedScene {
  id: string;
  module_index: number;
  scene_title: string;
  slide_layout?: 'hero' | 'concept_cards' | 'diagram_flow' | 'comparison' | 'example_code' | 'trap_alert' | 'recap';
  duration_sec: number;
  narration: string;
  example_or_code?: string;
  visual_nodes: AnimatedVisualNode[];
  connections: Array<{ from: string; to: string; label: string }>;
  key_takeaway: string;
  sources_hint: string;
}

export interface AnimatedLessonModule {
  index: number;
  title: string;
  goal: string;
  minutes: number;
  expanded: boolean;
}

export interface AnimatedLesson {
  id: string;
  subject_id: string | null;
  subject_name?: string | null;
  title: string;
  target_minutes: number;
  technique: string;
  source_summary: string;
  modules: AnimatedLessonModule[];
  scenes: AnimatedScene[];
  created_at: string;
  updated_at: string;
}
