    const state = {
      health: null,
      projection: { projectionVersion: "projection-0", entries: [] },
      workspaceState: null,
      dictionaries: [],
      dictionaryWords: [],
      dictionaryId: null,
      dictionary: null,
      chapterIndex: 0,
      activeIndex: 0,
      session: { attempts: 0, correct: 0 },
      startedAt: Date.now(),
    };

    const $ = (id) => document.getElementById(id);

    function setText(id, value) {
      $(id).textContent = String(value);
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function emptyTableRow(message) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = message;
      row.append(cell);
      return row;
    }

    function emptyContext(message) {
      const item = document.createElement("div");
      item.className = "empty";
      item.textContent = message;
      return item;
    }

    function sortEntries(entries) {
      return [...entries].sort((a, b) => {
        const statusOrder = { learning: 0, review: 1, unknown: 2, mature: 3, archived: 4 };
        return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
          || a.normalizedText.localeCompare(b.normalizedText);
      });
    }

    function getPracticeEntries() {
      const projectedEntries = sortEntries(state.projection.entries)
        .filter((entry) => entry.kind === "word" && entry.status !== "archived" && entry.status !== "mature");
      if (projectedEntries.length) {
        return projectedEntries.map((entry) => ({ source: "projection", entry }));
      }
      return state.dictionaryWords.map((word) => ({
        source: "dictionary",
        word,
        entry: {
          normalizedText: word.name,
          kind: "word",
          status: "learning",
          confidence: 0.2,
          definition: Array.isArray(word.trans) ? word.trans.join("; ") : "",
          updatedAt: new Date().toISOString(),
        },
      }));
    }

    function activeEntry() {
      const practiceEntries = getPracticeEntries();
      if (!practiceEntries.length) {
        return null;
      }
      return practiceEntries[state.activeIndex % practiceEntries.length];
    }

    function renderHealth() {
      const dot = $("health-dot");
      if (state.health?.ok) {
        dot.classList.add("ok");
        setText("health-text", "Connected");
        setText("daemon-service", state.health.service);
        setText("contract-version", state.health.contractVersion);
      }
      else {
        dot.classList.remove("ok");
        setText("health-text", "Offline");
      }
    }

    function renderMetrics() {
      const stats = state.workspaceState?.stats;
      setText("metric-learning", stats?.learningCount ?? 0);
      setText("metric-review", stats?.reviewCount ?? 0);
      setText("metric-mature", stats?.matureCount ?? 0);
      setText("metric-archived", stats?.archivedCount ?? 0);
      setText("version-pill", state.projection.projectionVersion);
    }

    function renderPractice() {
      const entry = activeEntry();
      const input = $("typing-input");
      const practiceEntries = getPracticeEntries();
      if (!entry) {
        setText("stage-word", "No terms yet");
        setText("definition", "No projection terms or dictionary words are available.");
        input.value = "";
        input.disabled = true;
        setText("session-active", "-");
      }
      else {
        setText("stage-word", entry.entry.normalizedText);
        setText("definition", entry.entry.definition || "No definition saved yet.");
        input.disabled = false;
        setText("session-active", entry.entry.normalizedText);
      }
      setText("practice-source", entry?.source === "dictionary"
        ? `${state.dictionary?.name ?? "Deck"} chapter practice`
        : "Projection review queue");
      setText("chapter-chip", state.dictionary
        ? `Chapter ${state.chapterIndex + 1}/${state.dictionary.chapterCount}`
        : "No deck");
      setText("session-attempts", state.session.attempts);
      setText("session-correct", state.session.correct);
      const accuracy = state.session.attempts
        ? Math.round((state.session.correct / state.session.attempts) * 100)
        : 0;
      setText("session-accuracy", accuracy + "%");
      renderChapterWords(entry);
    }

    function renderDeckControls() {
      const select = $("dictionary-select");
      const currentValue = select.value;
      select.replaceChildren(...state.dictionaries.map((dictionary) => {
        const option = document.createElement("option");
        option.value = dictionary.id;
        option.textContent = `${dictionary.name} (${dictionary.length})`;
        return option;
      }));
      select.value = state.dictionaryId ?? currentValue ?? "";

      const chapterCount = state.dictionary?.chapterCount ?? 0;
      setText("chapter-title", state.dictionary
        ? `${state.dictionary.name} · Chapter ${state.chapterIndex + 1}`
        : "No deck selected");
      setText("chapter-range", state.dictionaryWords.length
        ? `${state.dictionaryWords[0].index + 1}-${state.dictionaryWords[state.dictionaryWords.length - 1].index + 1} of ${state.dictionary?.length ?? state.dictionaryWords.length}`
        : "0 words");
      $("previous-chapter-button").disabled = !state.dictionary || state.chapterIndex <= 0;
      $("next-chapter-button").disabled = !state.dictionary || state.chapterIndex >= chapterCount - 1;
    }

    function renderChapterWords(active) {
      const strip = $("chapter-word-strip");
      if (!state.dictionaryWords.length) {
        strip.replaceChildren(emptyContext("Deck words load after the daemon serves the selected qwerty chapter."));
        renderDeckControls();
        return;
      }

      strip.replaceChildren(...state.dictionaryWords.map((word, index) => {
        const token = document.createElement("button");
        token.type = "button";
        token.className = "word-token";
        if (active?.source === "dictionary" && active.entry.normalizedText === word.name) {
          token.classList.add("active");
        }
        token.textContent = `${index + 1}. ${word.name}`;
        token.addEventListener("click", () => {
          state.activeIndex = index;
          $("typing-input").value = "";
          state.startedAt = Date.now();
          renderPractice();
          $("typing-input").focus();
        });
        return token;
      }));
      renderDeckControls();
    }

    function renderProjection() {
      const body = $("projection-body");
      const entries = sortEntries(state.projection.entries);
      if (!entries.length) {
        body.replaceChildren(emptyTableRow("No projection terms yet."));
        return;
      }
      body.replaceChildren(...entries.map((entry) => {
        const row = document.createElement("tr");
        const confidence = Math.round(entry.confidence * 100) + "%";
        const termCell = document.createElement("td");
        termCell.textContent = entry.normalizedText;
        const kindCell = document.createElement("td");
        kindCell.textContent = entry.kind;
        const statusCell = document.createElement("td");
        const statusText = document.createElement("span");
        statusText.className = "status " + entry.status;
        statusText.textContent = entry.status;
        statusCell.append(statusText);
        const confidenceCell = document.createElement("td");
        confidenceCell.textContent = confidence;
        const definitionCell = document.createElement("td");
        definitionCell.textContent = entry.definition || "";
        row.append(termCell, kindCell, statusCell, confidenceCell, definitionCell);
        row.addEventListener("click", () => {
          const practiceEntries = getPracticeEntries();
          const index = practiceEntries.findIndex((candidate) =>
            candidate.entry.normalizedText === entry.normalizedText && candidate.entry.kind === entry.kind
          );
          if (index >= 0) {
            state.activeIndex = index;
            $("typing-input").value = "";
            renderPractice();
            $("typing-input").focus();
          }
        });
        return row;
      }));
    }

    function renderContext() {
      const list = $("context-list");
      const captures = state.workspaceState?.captures ?? [];
      const qwertyRecords = state.workspaceState?.qwertyWordRecords ?? [];
      const items = [
        ...captures.slice(0, 6).map((capture) => ({
          title: capture.text,
          detail: "capture"
            + (capture.extractedCount ? " / " + capture.extractedCount + " extracted" : "")
            + (capture.sourceTitle ? " / " + capture.sourceTitle : "")
            + (capture.context ? " / " + capture.context : ""),
        })),
        ...qwertyRecords.slice(0, 6).map((record) => ({
          title: record.word,
          detail: "qwerty / " + (record.correct ? "correct" : "review")
            + " / " + Math.round(record.accuracy * 100) + "%"
            + " / " + Math.round(record.durationMs / 1000) + "s",
        })),
      ];
      setText("inbox-count", captures.length + " captures");
      if (!items.length) {
        list.replaceChildren(emptyContext("Selection captures will appear here after the extension syncs."));
        return;
      }
      list.replaceChildren(...items.map((entry) => {
        const item = document.createElement("div");
        item.className = "log";
        const title = document.createElement("strong");
        title.textContent = entry.title;
        const detail = document.createElement("span");
        detail.textContent = entry.detail;
        item.append(title, detail);
        return item;
      }));
    }

    function render() {
      renderHealth();
      renderMetrics();
      renderPractice();
      renderProjection();
      renderContext();
    }

    async function refresh() {
      try {
        const [healthResponse, projectionResponse, workspaceResponse, dictionariesResponse] = await Promise.all([
          fetch("/api/v1/health"),
          fetch("/api/v1/projection"),
          fetch("/api/v1/workspace/state"),
          fetch("/api/v1/qwerty/dictionaries"),
        ]);
        state.health = await healthResponse.json();
        state.projection = await projectionResponse.json();
        state.workspaceState = await workspaceResponse.json();
        const dictionaries = await dictionariesResponse.json();
        state.dictionaries = dictionaries.dictionaries || [];
        if (!state.dictionaryId && state.dictionaries.length) {
          state.dictionaryId = state.dictionaries[0].id;
        }
        if (!getPracticeEntries().length && state.dictionaryId) {
          await loadDictionaryChapter(state.dictionaryId, state.chapterIndex);
        }
        setText("toast", "");
      }
      catch (error) {
        state.health = null;
        $("toast").classList.add("error");
        setText("toast", error instanceof Error ? error.message : String(error));
      }
      render();
    }

    async function loadDictionaryChapter(dictId, chapterIndex) {
      const chapterResponse = await fetch("/api/v1/qwerty/dictionaries/" + encodeURIComponent(dictId) + "/chapter/" + encodeURIComponent(String(chapterIndex)));
      if (!chapterResponse.ok) {
        throw new Error("Dictionary chapter failed to load: " + chapterResponse.status);
      }
      const chapter = await chapterResponse.json();
      state.dictionaryId = chapter.dictionary.id;
      state.dictionary = chapter.dictionary;
      state.chapterIndex = chapter.chapterIndex;
      state.dictionaryWords = chapter.words || [];
      state.activeIndex = 0;
      state.startedAt = Date.now();
    }

    function mistakesFor(word, input) {
      const length = Math.max(word.length, input.length);
      const mistakes = [];
      for (let index = 0; index < length; index += 1) {
        const expected = word[index] || "";
        const actual = input[index] || "";
        if (expected !== actual) {
          mistakes.push({ expected, actual, index });
        }
      }
      return mistakes;
    }

    async function submitPractice() {
      const entry = activeEntry();
      if (!entry) {
        return;
      }
      const input = $("typing-input").value.trim();
      const word = entry.entry.normalizedText;
      const mistakes = mistakesFor(word, input);
      const correct = input === word;
      const accuracy = word.length
        ? Math.max(0, (word.length - mistakes.length) / word.length)
        : 0;
      const durationMs = Math.max(1, Date.now() - state.startedAt);

      $("submit-button").disabled = true;
      try {
        await fetch("/api/v1/qwerty/records/word", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            word,
            input,
            correct,
            accuracy,
            durationMs,
            definition: entry.entry.definition,
            dictId: entry.source === "dictionary" ? state.dictionaryId : undefined,
            chapterIndex: entry.source === "dictionary" ? state.chapterIndex : undefined,
            wordIndex: entry.source === "dictionary" ? entry.word.index : undefined,
            mistakes,
            createdAt: new Date().toISOString(),
          }),
        });
        state.session.attempts += 1;
        if (correct) {
          state.session.correct += 1;
          state.activeIndex += 1;
        }
        $("typing-input").value = "";
        state.startedAt = Date.now();
        setText("toast", correct ? "Recorded" : "Recorded for review");
        $("toast").classList.remove("error");
        await refresh();
      }
      catch (error) {
        $("toast").classList.add("error");
        setText("toast", error instanceof Error ? error.message : String(error));
      }
      finally {
        $("submit-button").disabled = false;
        $("typing-input").focus();
      }
    }

    $("refresh-button").addEventListener("click", refresh);
    $("submit-button").addEventListener("click", submitPractice);
    $("dictionary-select").addEventListener("change", (event) => {
      const nextDictionaryId = event.target.value;
      if (!nextDictionaryId) {
        return;
      }
      void loadDictionaryChapter(nextDictionaryId, 0)
        .then(() => {
          render();
          $("typing-input").focus();
        })
        .catch((error) => {
          $("toast").classList.add("error");
          setText("toast", error instanceof Error ? error.message : String(error));
        });
    });
    $("previous-chapter-button").addEventListener("click", () => {
      if (!state.dictionaryId) {
        return;
      }
      const nextChapter = clamp(state.chapterIndex - 1, 0, state.dictionary?.chapterCount ?? 1);
      void loadDictionaryChapter(state.dictionaryId, nextChapter)
        .then(() => {
          render();
          $("typing-input").focus();
        });
    });
    $("next-chapter-button").addEventListener("click", () => {
      if (!state.dictionaryId) {
        return;
      }
      const nextChapter = clamp(state.chapterIndex + 1, 0, (state.dictionary?.chapterCount ?? 1) - 1);
      void loadDictionaryChapter(state.dictionaryId, nextChapter)
        .then(() => {
          render();
          $("typing-input").focus();
        });
    });
    $("skip-button").addEventListener("click", () => {
      state.activeIndex += 1;
      $("typing-input").value = "";
      state.startedAt = Date.now();
      renderPractice();
      $("typing-input").focus();
    });
    $("typing-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submitPractice();
      }
    });

    void refresh();
