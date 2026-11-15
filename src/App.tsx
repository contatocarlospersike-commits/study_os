import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  BarChart3,
  BookOpen,
  Brain,
  Download,
  LayoutDashboard,
  Layers,
  LogOut,
  Sparkles,
  Webhook,
  Zap,
} from 'lucide-react';
import { api } from './api/client';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { usePWA } from './hooks/usePWA';
import { useStudySession } from './hooks/useStudySession';
import { AuthGate } from './components/AuthGate';
import { Dashboard } from './components/Dashboard';
import { SubjectHub } from './components/SubjectHub';
import { ActiveRecallQuiz } from './components/ActiveRecallQuiz';
import { SpacedRepetitionQueue } from './components/SpacedRepetitionQueue';
import { AnalyticsView } from './components/AnalyticsView';
import { AutomationCenter } from './components/AutomationCenter';
import type { AnalyticsData, NavView, QuizSummary, RecoveryPlan, Subject } from './types';

export function App() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);

  const [view, setView] = useState<NavView>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view') as NavView | null;
    if (v && ['dashboard', 'subjects', 'quizzes', 'reviews', 'analytics', 'automation'].includes(v)) {
      return v;
    }
    return 'dashboard';
  });
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | undefined>(undefined);
  const [selectedQuizId, setSelectedQuizId] = useState<string | undefined>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('quizId') || undefined;
  });

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [recoveryPlans, setRecoveryPlans] = useState<RecoveryPlan[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [autoQuizBanner, setAutoQuizBanner] = useState<{ quizId: string; title: string } | null>(null);

  const pwa = usePWA();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthSession(data.session);
      setAuthLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuthSession(nextSession);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshAll = useCallback(async () => {
    if (isSupabaseConfigured && !authSession) return;
    const [subs, qzs, plans, stats] = await Promise.all([
      api.getSubjects(),
      api.getQuizzes(),
      api.getRecoveryPlans(),
      api.getAnalytics(),
    ]);
    setSubjects(subs);
    setQuizzes(qzs);
    setRecoveryPlans(plans);
    setAnalytics(stats);
  }, [authSession]);

  useEffect(() => {
    if (!authLoading && (!isSupabaseConfigured || authSession)) {
      void refreshAll();
    }
  }, [authLoading, authSession, refreshAll]);

  const session = useStudySession((quizId, title) => {
    setAutoQuizBanner({ quizId, title });
    void pwa.showLocalNotification(
      'Study Session Complete — 5Q Auto-Quiz Ready',
      title,
      `/?view=quizzes&quizId=${quizId}`
    );
    void refreshAll();
  });

  if (authLoading) {
    return (
      <div className="app-shell flex items-center justify-center bg-zinc-950 text-zinc-400">
        Carregando Study OS...
      </div>
    );
  }

  if (isSupabaseConfigured && !authSession) {
    return <AuthGate />;
  }

  const handleNavigate = (nextView: NavView, opts?: { subjectId?: string; quizId?: string }) => {
    if (opts?.subjectId) setSelectedSubjectId(opts.subjectId);
    if (opts?.quizId) setSelectedQuizId(opts.quizId);
    setView(nextView);
  };

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  const navItems: Array<{ id: NavView; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'subjects', label: 'Subjects', icon: BookOpen },
    { id: 'quizzes', label: 'Quizzes', icon: Zap },
    { id: 'reviews', label: 'SR Queue', icon: Layers, badge: analytics?.totals.due_cards || 0 },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'automation', label: 'Webhooks', icon: Webhook },
  ];

  return (
    <div className="app-shell flex flex-col bg-zinc-950 text-zinc-100 md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-zinc-800/80 bg-zinc-950 p-4 md:flex">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-zinc-50">Study OS</span>
              <p className="text-[11px] text-zinc-400">Cognitive Learning</p>
            </div>
          </div>

          <nav aria-label="Primary Navigation" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
                    active
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="rounded-full bg-cyan-500 px-2 py-0.5 text-[11px] font-bold text-zinc-950">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-zinc-800/80 pt-4">
          {pwa.canInstall && (
            <button
              type="button"
              onClick={pwa.promptInstall}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-3 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/40"
            >
              <Download className="h-3.5 w-3.5" />
              Install Study OS PWA
            </button>
          )}
          {authSession?.user?.email && (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">
              <span className="truncate">{authSession.user.email}</span>
              <button
                type="button"
                aria-label="Sair"
                onClick={handleSignOut}
                className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="rounded-xl bg-zinc-900/70 px-3 py-2.5 text-[11px] text-zinc-400">
            <p className="font-semibold text-zinc-300">PWA Offline Ready</p>
            <p className="mt-0.5">Active Recall · SM-2 · n8n</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-5 sm:px-6 lg:px-8 md:pb-8">
        <div className="mx-auto max-w-6xl space-y-5">
          {/* Mobile Top Bar */}
          <div className="flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-cyan-400" />
              <span className="font-bold text-zinc-50">Study OS</span>
            </div>
            <div className="flex items-center gap-2">
              {pwa.canInstall && (
                <button
                  type="button"
                  onClick={pwa.promptInstall}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-300"
                >
                  <Download className="h-3.5 w-3.5" />
                  Install
                </button>
              )}
              {authSession && (
                <button
                  type="button"
                  aria-label="Sair"
                  onClick={handleSignOut}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </button>
              )}
            </div>
          </div>

          {/* Auto-Quiz Notification Banner */}
          {autoQuizBanner && (
            <div className="flex flex-col gap-3 rounded-2xl border border-violet-500/50 bg-violet-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 shrink-0 text-violet-300" />
                <div>
                  <p className="text-sm font-semibold text-violet-100">
                    Auto-Quiz Trigger Fired!
                  </p>
                  <p className="text-xs text-violet-200/80">{autoQuizBanner.title}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const qid = autoQuizBanner.quizId;
                    setAutoQuizBanner(null);
                    handleNavigate('quizzes', { quizId: qid });
                  }}
                  className="min-h-[38px] rounded-xl bg-violet-500 px-3.5 text-xs font-semibold text-white hover:bg-violet-400"
                >
                  Launch 5Q Quiz
                </button>
                <button
                  type="button"
                  onClick={() => setAutoQuizBanner(null)}
                  className="min-h-[38px] rounded-xl border border-zinc-700 px-3 text-xs text-zinc-300"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {view === 'dashboard' && (
            <Dashboard
              subjects={subjects}
              analytics={analytics}
              recoveryPlans={recoveryPlans}
              quizzes={quizzes}
              activeSession={session.activeSession}
              elapsedSec={session.elapsedSec}
              sessionEnding={session.ending}
              onStartSession={async (subId, subtopic, mode) => {
                await session.start(subId, subtopic, mode);
              }}
              onEndSession={async () => {
                await session.end();
              }}
              onNavigate={handleNavigate}
            />
          )}

          {view === 'subjects' && (
            <SubjectHub
              subjects={subjects}
              initialSubjectId={selectedSubjectId}
              onRefreshSubjects={refreshAll}
            />
          )}

          {view === 'quizzes' && (
            <ActiveRecallQuiz
              quizzes={quizzes}
              initialQuizId={selectedQuizId}
              onQuizCompleted={refreshAll}
            />
          )}

          {view === 'reviews' && (
            <SpacedRepetitionQueue subjects={subjects} onReviewed={refreshAll} />
          )}

          {view === 'analytics' && <AnalyticsView analytics={analytics} />}

          {view === 'automation' && (
            <AutomationCenter
              notificationPermission={pwa.notificationPermission}
              onRequestNotifications={pwa.requestNotifications}
              onShowLocalNotification={pwa.showLocalNotification}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-zinc-800 bg-zinc-950/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur md:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              className={`relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[10px] font-medium ${
                active ? 'text-cyan-400' : 'text-zinc-400'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute right-2 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan-500 px-1 text-[9px] font-bold text-zinc-950">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
export default App;
