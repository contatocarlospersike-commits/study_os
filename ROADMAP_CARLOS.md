# Study OS — Roadmap & Arquitetura Personalizada (Carlos)

> Documento de referência para evolução contínua do **Study OS** adaptado ao perfil do Carlos (Ciência da Computação).

## 1. Perfil de Aprendizagem & Objetivos
- **Curso**: Ciência da Computação (ex.: *Formação Cidadã*, *Educação a Distância*, *Introdução à Computação*, *Matemática Elementar*, *Pré-Cálculo*, *Lógica e Algoritmos*).
- **Idioma**: Interface principal em **Português (PT-BR)**, com modo progressivo/opcional de **treino de inglês técnico** (leitura/explicação sem travar o aprendizado da matéria).
- **Estilo Cognitivo**: Perfil **visual + perguntas frequentes**. Precisa de calibração empírica nas primeiras semanas (micro-blocos com 2–3 perguntas imediatas vs. blocos Pomodoro/2h) cruzando energia percebida com retenção após 3+ dias.
- **Modo "Carlos Professor"**: Transformar assuntos técnicos em **roteiros de mini-aula** (gancho real → analogia/diagrama visual → exemplo prático → pegadinha de prova) para ensinar em voz alta, gravar conteúdo e aplicar a Técnica Feynman.

## 2. Stack de Infraestrutura & Automação
- **Frontend / Backend**: React + Vite + Express + TypeScript (PWA dark-mode-first, responsivo desktop/mobile) hospedado na **Vercel**.
- **Banco de Dados**: **Supabase (Postgres)** via `DATABASE_URL` (Transaction Pooler, porta `6543`).
- **Orquestração & WhatsApp**:
  - **n8n** recebendo webhooks assinados (`X-StudyOS-Signature` HMAC-SHA256).
  - **WhatsApp dedicado do Study OS** via **Evolution API** (ou WAHA) conectada por QR Code a um chip secundário — preservando a **WhatsApp Cloud API oficial** exclusivamente para o projeto comercial do Carlos.
- **Inteligência Artificial (Baixo Custo)**:
  - **Gemini API (`gemini-2.5-flash` / `gemini-2.5-flash-lite`)** usando **Structured Outputs (`responseSchema`)** para garantir JSON organizado e validado, além de leitura multimodal nativa de PDFs/slides.
  - Processamento único na ingestão (salva o conhecimento extraído no Supabase para não reenviar arquivos e manter o custo bem abaixo de R$ 20–30/mês).

## 3. Próximas Evoluções Planejadas
1. **Localização PT-BR + Modo Inglês Técnico**: Traduzir toda a UI para português e adicionar botão bilíngue nos cards/conceitos.
2. **Caixa de Entrada de Materiais ("Jogar o Grosso")**:
   - Upload livre de PDFs, slides, transcrições de aula e livros desorganizados.
   - Gemini classifica automaticamente (`Matéria → Subtópico → Tipo`), gera diagramas visuais (Mermaid), conceitos Feynman, flashcards e quizzes.
   - **Leitura Seletiva de Livros**: Cruza o sumário do livro com o Plano de Ensino da faculdade e indica apenas os capítulos/páginas essenciais da semana (ou sugere livros abertos equivalentes).
3. **Planejador Diário de Estudo**: Distribui revisões curtas (celular/áudio) e blocos profundos (PC/Modo Professor) conforme o tempo livre informado no dia.
4. **Calibração Adaptativa**: Experimento automático comparando formatos de bloco com taxa real de retenção no Spaced Repetition.

## 4. Pilares Científicos Embarcados
1. **Active Recall / Testing Effect** (Recuperação ativa antes de reler).
2. **Spaced Repetition** (Escala `1, 3, 7, 15, 30` dias + SM-2).
3. **Interleaving** (Prática intercalada de problemas diferentes).
4. **Dual Coding** (Texto + diagramas/fluxogramas visuais).
5. **Feynman / Protégé Effect** (Explicar simples para expor lacunas).
6. **Pre-testing** (2–3 perguntas antes de consumir o material novo).
