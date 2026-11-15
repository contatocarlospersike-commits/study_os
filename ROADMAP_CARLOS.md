# Study OS — Plano Mestre de Implementação (Carlos)

> **Contrato de Escopo:** Este documento trava exatamente o que foi planejado para o Study OS, garantindo que cada fase seja construída em ordem, testada em produção (Vercel + Supabase) e sem desvio de escopo.

---

## Princípios Inegociáveis do Sistema
1. **Zero Trabalho Robótico:** o usuário joga o material bruto; a IA organiza, conecta e agenda.
2. **Zero Alucinação (RAG Rigoroso):** toda resposta técnica no chat exige citação exata (`arquivo + página/seção`) e passa por verificação (*Critic Pass*). Se não estiver nos materiais enviados, o sistema declara explicitamente.
3. **Visual + Perguntas:** diagramas (Mermaid), fórmulas claras (KaTeX) e checagens ativas constantes.
4. **Estética Minimalista Dark-Mode:** recursos estilo Obsidian (wikilinks `[[...]]`, backlinks, grafo) e Biblioteca sem poluir a tela.
5. **Segurança Multi-Usuário:** isolamento total por `user_id` (Supabase Auth Google/Email); cada usuário configura seus próprios webhooks/WhatsApp.

---

## Fase 1 — Base PT-BR + `pgvector` + Chat Tutor RAG Anti-Alucinação
**Objetivo:** Traduzir o app para Português, ativar busca vetorial/textual no Supabase e lançar o Chat Tutor confiável.

- **Banco de Dados (Supabase):**
  - Ativar extensão `pgvector` (`CREATE EXTENSION IF NOT EXISTS vector;`).
  - Criar bucket privado `study-materials` no Supabase Storage.
  - Novas tabelas (com `user_id`):
    - `materials` (`id`, `user_id`, `subject_id`, `title`, `type`, `storage_path`, `status`, `created_at`)
    - `document_chunks` (`id`, `user_id`, `material_id`, `subject_id`, `page_number`, `section_title`, `content`, `tsv tsvector`, `embedding vector(768)`)
    - `chat_threads` & `chat_messages` (`citations_json`, `grounding_status`, `verified_by_critic`)
- **Backend (Gemini API `gemini-2.5-flash` + `gemini-embedding-001`):**
  - `POST /api/materials/upload` — extrai texto por página, cria chunks e gera embeddings (processamento único).
  - `POST /api/chat` — Pipeline em 3 passos:
    1. **Busca Híbrida** (`pgvector` cosseno + `tsvector` FTS) nos chunks do usuário.
    2. **Geração Ancorada (`responseSchema`)** obrigando `answer`, `citations[]`, `grounding_status` e `follow_up_questions[]`.
    3. **Critic Pass (Self-Check)** verificando contradições matemáticas/lógicas contra os chunks originais antes de responder.
- **Frontend:**
  - Tradução completa da interface para **Português (PT-BR)** + toggle opcional **"Treinar Inglês Técnico"**.
  - Nova aba **Tutor IA (RAG)** com renderização **Mermaid** + **KaTeX**, selo de confiabilidade e badges clicáveis de citação.

---

## Fase 2 — Biblioteca Pessoal (Pearson Tracker + Livros Abertos) & Notas estilo Obsidian
**Objetivo:** Gerenciar leituras (inclusive livros fechados da Pearson) e conectar conhecimentos visualmente sem deixar a UI pesada.

- **Módulo Biblioteca (`books`):**
  - Tabela `books` (`id`, `user_id`, `subject_id`, `title`, `author`, `source_type` `'pearson' | 'open_pdf' | 'physical'`, `external_url`, `status` `'to_read' | 'reading' | 'read'`, `current_page`, `total_pages`, `summary_markdown`, `insights_markdown`, `linked_material_id`).
  - Catálogo sugerido de **PDFs Open-Access** (OpenStax, MIT OCW, Green Tea Press, SciELO Livros, eduCAPES) para importação direta no RAG.
- **Módulo Notas Conectadas (Obsidian Minimalista):**
  - Tabela `note_links` (`source_note_id`, `target_concept_or_subject`, `user_id`).
  - Autocomplete ao digitar `[[` no editor Markdown de `SubjectHub`.
  - Painel discreto de **Backlinks** no rodapé da nota.
  - Modal/aba limpa **Mapa de Conexões** (grafo SVG/Canvas interativo colorido por matéria).
  - Sugestão automática de pontes entre matérias pela IA.

---

## Fase 3 — Inbox "Jogar o Grosso" & Leitura Seletiva por Ementa
**Objetivo:** Eliminar a organização manual de PDFs, slides e transcrições soltas.

- **Nova aba Inbox de Materiais:**
  - Upload múltiplo (PDFs, slides, transcrições de áudio, anotações soltas).
  - Triagem automática via Gemini: classifica Matéria + Subtópico, cria Conceitos Feynman, Flashcards SM-2 e Perguntas de Active Recall com citação da página.
  - Processamento em lotes para livros grandes (evitando timeout na Vercel).
- **Leitura Seletiva de Livros:**
  - Cruza o **Plano de Ensino** da matéria com o sumário do livro e gera a lista exata de capítulos/páginas prioritárias da semana.

---

## Fase 4 — Modo Carlos Professor + Planejador Diário + Calibração + WhatsApp Dedicado
**Objetivo:** Fechar o ciclo cognitivo completo e automatizar a rotina diária no celular.

- **Modo "Carlos Professor" (Feynman → Roteiro de Aula):**
  - Gera roteiro de mini-aula (`Gancho Real → Analogia/Diagrama Visual → Exemplo Prático → Pegadinha de Prova`) e avalia a explicação escrita/falada do Carlos apontando lacunas.
- **Planejador Diário de Estudo:**
  - Input de tempo livre no dia → distribui **Spaced Repetition (celular/áudio)** nos blocos curtos e **Teoria + Interleaving + Modo Professor** nos blocos longos.
- **Calibração do Perfil Cognitivo:**
  - Tabela `learning_profile` + check-in pós-bloco (energia/foco 1–5) cruzado com a taxa de acerto 3+ dias depois para descobrir o ritmo ideal do Carlos.
- **WhatsApp Dedicado (sem API Oficial):**
  - Atualizar template n8n (`n8n/study-os-workflow.json`) para suportar **Evolution API** (chip secundário conectado via QR Code), preservando a WhatsApp Cloud API oficial para o negócio comercial.

---

## Checklist para Iniciar a Fase 1
1. Validar o deploy atual na Vercel (`/api/health` retornando `"ok": true`).
2. Gerar `GEMINI_API_KEY` no Google AI Studio e cadastrar na Vercel.
3. Ativar `pgvector` no SQL Editor do Supabase (`CREATE EXTENSION IF NOT EXISTS vector;`).
