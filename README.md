# Study OS — Evidence-Based Cognitive Learning PWA

Study OS is a full-stack, mobile-first Progressive Web App (PWA) built for high-efficiency learning using **Active Recall**, **Spaced Repetition (modified SM-2 + 1/3/7/15/30d ladder)**, **Interleaving**, and the **Feynman Technique**, complete with an **Automated Recovery Plan Generator** and **n8n / WhatsApp Cloud API / Web Push** automation webhooks.

## Features
- **Multi-Device PWA**: Dark-mode-first high-contrast UI, `100dvh` mobile-safe layout, desktop sidebar + mobile bottom navigation, native `scroll-snap` swipeable card decks, and offline-capable Service Worker (`public/sw.js`).
- **Subject Hubs**: Organize subjects (seeded with *Pre-Calculus*, *Programming & Systems*, *Cognitive Science*), edit Markdown notes & lecture transcripts, and capture Feynman analogies that auto-generate Spaced Repetition flashcards.
- **Active Recall & Automated Recovery Plans**: Interactive quizzes with immediate conceptual feedback. Scoring below the threshold (default `70%`) automatically flags weak sub-topics and synthesizes a **Remediation & Recovery Quiz** for your next block.
- **Spaced Repetition Queue**: Modified SM-2 scheduler with an explicit `1 → 3 → 7 → 15 → 30` day interval ladder, audio-first Web Speech API playback, and instant rating buttons.
- **Automation & Auto-Quiz Trigger**: Ending a study session automatically generates a 5-question Active Recall quiz and dispatches an HMAC-SHA256 signed webhook (`X-StudyOS-Signature`) to n8n, WhatsApp Cloud API, and/or Browser Push.

## Local Setup

### Prerequisites
- **Node.js 22+** (built with Node 24's native `node:sqlite` — zero native C++ build tools required)

### 1. Install & Run in Development
```bash
cd study-os
cp .env.example .env
npm install
npm run dev
```
- Frontend (Vite): `http://localhost:5173`
- Backend API (Express + SQLite): `http://localhost:3001`

### 2. Production Build
```bash
npm run build
npm start
```

## Integrating with n8n & WhatsApp Cloud API

1. Import `n8n/study-os-workflow.json` into your n8n instance.
2. Copy the **Webhook URL** from the `Study OS Outbound Webhook` node (e.g., `https://your-n8n.example.com/webhook/study-os`).
3. Open **Study OS → Webhooks**, paste the URL into **n8n Webhook URL**, set your **HMAC Webhook Secret**, and click **Save Automation Settings**.
4. Click **Test Dispatch** or finish a **Study Block** on the Dashboard to verify live delivery in the **Outbound Webhook & Notification Logs** panel.
5. *(Optional)* To dispatch directly to WhatsApp Cloud API without n8n, set `WHATSAPP_TOKEN` in `.env` and fill in your Phone Number ID & Recipient E.164 number in the **Webhooks** tab.
