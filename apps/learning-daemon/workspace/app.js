    const state = {
      health: null,
      projection: { projectionVersion: "projection-0", entries: [] },
      workspaceState: null,
      dictionaries: [],
      dictionaryWords: [],
      dictionaryId: null,
      dictionary: null,
      practiceMode: "projection",
      chapterIndex: 0,
      activeIndex: 0,
      session: {
        attempts: 0,
        correct: 0,
        chapterStartedAt: Date.now(),
        chapterResults: [],
        recordedChapterKeys: [],
      },
      startedAt: Date.now(),
      eventSource: null,
      eventRefreshTimer: null,
      eventPollTimer: null,
      lastExportUrl: null,
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

    function getAccuracyPercent(value) {
      return Math.round((value ?? 0) * 100) + "%";
    }

    function getStatusLabel(status) {
      return {
        unknown: "未知",
        learning: "学习中",
        review: "复习中",
        mature: "已掌握",
        archived: "已归档",
      }[status] || status;
    }

    function getKindLabel(kind) {
      return {
        word: "单词",
        phrase: "短语",
        sentence: "句子",
        paragraph: "段落",
      }[kind] || kind;
    }

    function sortEntries(entries) {
      return [...entries].sort((a, b) => {
        const statusOrder = { learning: 0, review: 1, unknown: 2, mature: 3, archived: 4 };
        return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
          || a.normalizedText.localeCompare(b.normalizedText);
      });
    }

    function getPracticeEntries() {
      if (state.practiceMode === "deck") {
        return getDictionaryPracticeEntries();
      }
      const projectedEntries = sortEntries(state.projection.entries)
        .filter((entry) => entry.kind === "word" && entry.status !== "archived" && entry.status !== "mature");
      if (projectedEntries.length) {
        return projectedEntries.map((entry) => ({ source: "projection", entry }));
      }
      return getDictionaryPracticeEntries();
    }

    function getDictionaryPracticeEntries() {
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
        setText("health-text", "已连接");
        setText("daemon-service", state.health.service);
        setText("contract-version", state.health.contractVersion);
      }
      else {
        dot.classList.remove("ok");
        setText("health-text", "离线");
      }
    }

    function renderMetrics() {
      const stats = state.workspaceState?.stats;
      setText("metric-learning", stats?.learningCount ?? 0);
      setText("metric-review", stats?.reviewCount ?? 0);
      setText("metric-mature", stats?.matureCount ?? 0);
      setText("metric-archived", stats?.archivedCount ?? 0);
      setText("metric-captures", stats?.captureCount ?? 0);
      setText("metric-qwerty", stats?.qwertyRecordCount ?? 0);
      setText("metric-accuracy", getAccuracyPercent(stats?.averageAccuracy ?? 0));
      setText("version-pill", state.projection.projectionVersion);
    }

    function renderModeButtons() {
      $("mode-projection-button").setAttribute("aria-pressed", String(state.practiceMode !== "deck"));
      $("mode-deck-button").setAttribute("aria-pressed", String(state.practiceMode === "deck"));
    }

    function renderTypingGhost() {
      const ghost = $("typing-ghost");
      const entry = activeEntry();
      if (!entry) {
        ghost.replaceChildren();
        return;
      }
      const word = entry.entry.normalizedText;
      const input = $("typing-input").value;
      const nodes = [...word].map((char, index) => {
        const span = document.createElement("span");
        const typed = input[index];
        span.textContent = typed || char;
        if (typed === undefined) {
          span.className = index === input.length ? "pending cursor" : "pending";
        }
        else if (typed === char) {
          span.className = "ok";
        }
        else {
          span.className = "bad";
        }
        return span;
      });
      if (input.length > word.length) {
        for (const char of input.slice(word.length)) {
          const span = document.createElement("span");
          span.className = "bad";
          span.textContent = char;
          nodes.push(span);
        }
      }
      ghost.replaceChildren(...nodes);
    }

    function renderPractice() {
      const entry = activeEntry();
      const input = $("typing-input");
      if (!entry) {
        setText("stage-word", "暂无词条");
        setText("definition", "还没有掌握度词条或词库单词。");
        input.value = "";
        input.disabled = true;
        setText("session-active", "-");
      }
      else {
        setText("stage-word", entry.entry.normalizedText);
        setText("definition", entry.entry.definition || "还没有保存释义。");
        input.disabled = false;
        setText("session-active", entry.entry.normalizedText);
      }
      renderModeButtons();
      renderTypingGhost();
      setText("practice-source", entry?.source === "dictionary"
        ? `${state.dictionary?.name ?? "词库"} 章节练习`
        : "掌握度复习队列");
      setText("session-attempts", state.session.attempts);
      setText("session-correct", state.session.correct);
      const accuracy = state.session.attempts
        ? Math.round((state.session.correct / state.session.attempts) * 100)
        : 0;
      setText("session-accuracy", accuracy + "%");
      const chapterTotal = state.dictionaryWords.length;
      const chapterDone = state.session.chapterResults.length;
      setText("chapter-progress-text", `${chapterDone}/${chapterTotal}`);
      $("chapter-progress").style.width = chapterTotal ? `${Math.round((chapterDone / chapterTotal) * 100)}%` : "0%";
      renderChapterWords(entry);
    }

    function currentChapterKey() {
      return state.dictionary ? `${state.dictionary.id}:${state.chapterIndex}` : "";
    }

    function resetChapterSession() {
      state.session.chapterStartedAt = Date.now();
      state.session.chapterResults = [];
      const chapterKey = currentChapterKey();
      if (chapterKey) {
        state.session.recordedChapterKeys = state.session.recordedChapterKeys.filter((key) => key !== chapterKey);
      }
    }

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "请求失败：" + response.status);
      }
      return response.json();
    }

    async function getJson(path) {
      const response = await fetch(path, {
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "请求失败：" + response.status);
      }
      return response.json();
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
        ? `${state.dictionary.name} / 第 ${state.chapterIndex + 1} 章`
        : "未选择词库");
      setText("chapter-range", state.dictionaryWords.length
        ? `${state.dictionaryWords[0].index + 1}-${state.dictionaryWords[state.dictionaryWords.length - 1].index + 1} / ${state.dictionary?.length ?? state.dictionaryWords.length} 词`
        : "0 词");
      $("previous-chapter-button").disabled = !state.dictionary || state.chapterIndex <= 0;
      $("next-chapter-button").disabled = !state.dictionary || state.chapterIndex >= chapterCount - 1;
    }

    function renderChapterWords(active) {
      const strip = $("chapter-word-strip");
      if (!state.dictionaryWords.length) {
        strip.replaceChildren(emptyContext("本地服务载入所选章节后，单词会出现在这里。"));
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
          state.practiceMode = "deck";
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
      setText("projection-count", entries.length + " 条");
      if (!entries.length) {
        body.replaceChildren(emptyTableRow("还没有掌握度词条。"));
        return;
      }
      body.replaceChildren(...entries.map((entry) => {
        const row = document.createElement("tr");
        const confidence = Math.round(entry.confidence * 100) + "%";
        const termCell = document.createElement("td");
        termCell.textContent = entry.normalizedText;
        const kindCell = document.createElement("td");
        kindCell.textContent = getKindLabel(entry.kind);
        const statusCell = document.createElement("td");
        const statusText = document.createElement("span");
        statusText.className = "status " + entry.status;
        statusText.textContent = getStatusLabel(entry.status);
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
            state.practiceMode = "projection";
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
      const qwertyChapterRecords = state.workspaceState?.qwertyChapterRecords ?? [];
      const items = [
        ...captures.slice(0, 6).map((capture) => ({
          title: capture.text,
          detail: "划词"
            + (capture.extractedCount ? " / 提取 " + capture.extractedCount + " 项" : "")
            + (capture.sourceTitle ? " / " + capture.sourceTitle : "")
            + (capture.context ? " / " + capture.context : ""),
        })),
        ...qwertyRecords.slice(0, 6).map((record) => ({
          title: record.word,
          detail: "qwerty / " + (record.correct ? "正确" : "需复习")
            + " / " + Math.round(record.accuracy * 100) + "%"
            + " / " + Math.round(record.durationMs / 1000) + "s",
        })),
        ...qwertyChapterRecords.slice(0, 4).map((record) => ({
          title: `${record.dictName ?? record.dictId} / 第 ${record.chapterIndex + 1} 章`,
          detail: "章节"
            + " / " + record.correctCount + "/" + record.wordCount
            + " / " + Math.round(record.accuracy * 100) + "%"
            + " / " + Math.round(record.durationMs / 1000) + "s",
        })),
      ];
      setText("inbox-count", captures.length + " 条划词");
      if (!items.length) {
        list.replaceChildren(emptyContext("扩展同步划词后，会出现在这里。"));
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

    function renderErrorBook() {
      const errorList = $("error-book-list");
      const keyList = $("key-mistake-list");
      const mistakes = state.workspaceState?.qwertyMistakes ?? { words: [], keys: [] };
      setText("error-count", mistakes.words.length + " 个单词");

      if (!mistakes.words.length) {
        errorList.replaceChildren(emptyContext("还没有 qwerty 错题。"));
      }
      else {
        errorList.replaceChildren(...mistakes.words.slice(0, 5).map((entry) => {
          const item = document.createElement("div");
          item.className = "log";
          const title = document.createElement("strong");
          title.textContent = entry.word;
          const detail = document.createElement("span");
          detail.textContent = "错误 "
            + entry.count
            + " 次 / 上次输入："
            + entry.lastInput
            + " / "
            + Math.round(entry.lastAccuracy * 100)
            + "%";
          item.append(title, detail);
          return item;
        }));
      }

      keyList.replaceChildren(...mistakes.keys.slice(0, 8).map((entry) => {
        const item = document.createElement("div");
        item.className = "key-pair";
        const expected = document.createElement("strong");
        expected.textContent = entry.expected || "空格";
        const actual = document.createElement("strong");
        actual.textContent = entry.actual || "空";
        item.append(expected, " -> ", actual, " x", String(entry.count));
        return item;
      }));
    }

    function render() {
      renderHealth();
      renderMetrics();
      renderPractice();
      renderProjection();
      renderContext();
      renderErrorBook();
    }

    function setActivePage(id) {
      document.querySelectorAll(".workspace-page").forEach((page) => {
        page.classList.toggle("is-active", page.id === id);
      });
      document.querySelectorAll("[data-target]").forEach((button) => {
        button.setAttribute("aria-current", button.dataset.target === id ? "page" : "false");
        button.setAttribute("aria-selected", String(button.dataset.target === id));
      });
      document.querySelector(".main").scrollTop = 0;
      if (id === "practice") {
        $("typing-input").focus({ preventScroll: true });
      }
    }

    function downloadBlob(filename, data) {
      if (state.lastExportUrl) {
        URL.revokeObjectURL(state.lastExportUrl);
      }
      const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      state.lastExportUrl = url;
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
    }

    async function exportWorkspaceData() {
      $("data-status").classList.remove("error");
      setText("data-status", "正在导出...");
      try {
        const data = await getJson("/api/v1/export");
        downloadBlob(`read-frog-learning-${new Date().toISOString().slice(0, 10)}.json`, data);
        setText("data-status", `已导出 ${data.stats?.projectionEntryCount ?? 0} 条掌握度词条。`);
      }
      catch (error) {
        $("data-status").classList.add("error");
        setText("data-status", error instanceof Error ? error.message : String(error));
      }
    }

    async function importWorkspaceData(file) {
      if (!file) {
        return;
      }
      $("data-status").classList.remove("error");
      setText("data-status", "正在导入...");
      try {
        const payload = JSON.parse(await file.text());
        const response = await postJson("/api/v1/import", payload);
        setText("data-status", response.changed
          ? `已导入 ${response.imported.projectionEntries} 条掌握度变更。`
          : "导入完成，没有新增变更。");
        await refresh();
      }
      catch (error) {
        $("data-status").classList.add("error");
        setText("data-status", error instanceof Error ? error.message : String(error));
      }
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
        if (!state.dictionaryWords.length && state.dictionaryId) {
          await loadDictionaryChapter(state.dictionaryId, state.chapterIndex);
        }
        setText("toast", "");
        connectEvents();
      }
      catch (error) {
        state.health = null;
        $("toast").classList.add("error");
        setText("toast", error instanceof Error ? error.message : String(error));
      }
      render();
    }

    function scheduleEventRefresh() {
      if (state.eventRefreshTimer) {
        clearTimeout(state.eventRefreshTimer);
      }
      state.eventRefreshTimer = setTimeout(() => {
        state.eventRefreshTimer = null;
        void refresh();
      }, 120);
    }

    function connectEvents() {
      if (state.eventSource) {
        return;
      }
      if (!("EventSource" in window)) {
        if (!state.eventPollTimer) {
          state.eventPollTimer = setInterval(() => {
            void refresh();
          }, 5000);
        }
        return;
      }
      const source = new EventSource("/api/v1/events");
      state.eventSource = source;
      source.addEventListener("projection.updated", scheduleEventRefresh);
      source.addEventListener("qwerty.session.finished", scheduleEventRefresh);
      source.onerror = () => {
        source.close();
        state.eventSource = null;
      };
    }

    async function loadDictionaryChapter(dictId, chapterIndex) {
      const chapterResponse = await fetch("/api/v1/qwerty/dictionaries/" + encodeURIComponent(dictId) + "/chapter/" + encodeURIComponent(String(chapterIndex)));
      if (!chapterResponse.ok) {
        throw new Error("词库章节加载失败：" + chapterResponse.status);
      }
      const chapter = await chapterResponse.json();
      state.dictionaryId = chapter.dictionary.id;
      state.dictionary = chapter.dictionary;
      state.chapterIndex = chapter.chapterIndex;
      state.dictionaryWords = chapter.words || [];
      state.activeIndex = 0;
      state.practiceMode = "deck";
      state.startedAt = Date.now();
      resetChapterSession();
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
        await postJson("/api/v1/qwerty/records/word", {
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
        });
        rememberChapterResult(entry, correct);
        state.session.attempts += 1;
        if (correct) {
          state.session.correct += 1;
          state.activeIndex += 1;
        }
        $("typing-input").value = "";
        state.startedAt = Date.now();
        setText("toast", correct ? "已记录" : "已加入复习");
        $("toast").classList.remove("error");
        await maybeRecordChapterCompletion();
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

    function rememberChapterResult(entry, correct) {
      if (entry.source !== "dictionary" || !entry.word || !state.dictionary) {
        return;
      }
      const existingIndex = state.session.chapterResults.findIndex((result) => result.wordIndex === entry.word.index);
      const result = {
        wordIndex: entry.word.index,
        correct,
      };
      if (existingIndex >= 0) {
        state.session.chapterResults[existingIndex] = result;
      }
      else {
        state.session.chapterResults.push(result);
      }
    }

    async function maybeRecordChapterCompletion() {
      if (!state.dictionary || !state.dictionaryWords.length) {
        return;
      }
      const chapterKey = currentChapterKey();
      if (!chapterKey || state.session.recordedChapterKeys.includes(chapterKey)) {
        return;
      }
      const wordIndexes = new Set(state.dictionaryWords.map((word) => word.index));
      const chapterResults = state.session.chapterResults.filter((result) => wordIndexes.has(result.wordIndex));
      if (chapterResults.length < state.dictionaryWords.length) {
        return;
      }

      const correctWordIndexes = chapterResults
        .filter((result) => result.correct)
        .map((result) => result.wordIndex)
      const correctCount = correctWordIndexes.length;
      const wrongCount = Math.max(0, state.dictionaryWords.length - correctCount);
      const durationMs = Math.max(1, Date.now() - state.session.chapterStartedAt);
      await postJson("/api/v1/qwerty/records/chapter", {
        dictId: state.dictionary.id,
        dictName: state.dictionary.name,
        chapterIndex: state.chapterIndex,
        durationMs,
        wordCount: state.dictionaryWords.length,
        correctCount,
        wrongCount,
        accuracy: state.dictionaryWords.length ? correctCount / state.dictionaryWords.length : 0,
        correctWordIndexes,
        createdAt: new Date().toISOString(),
      });
      state.session.recordedChapterKeys.push(chapterKey);
      setText("toast", "章节已记录");
      await refresh();
    }

    $("refresh-button").addEventListener("click", refresh);
    $("export-button").addEventListener("click", exportWorkspaceData);
    $("download-export-button").addEventListener("click", exportWorkspaceData);
    $("import-file-input").addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      void importWorkspaceData(file);
      event.target.value = "";
    });
    document.querySelectorAll("[data-target]").forEach((button) => {
      button.addEventListener("click", () => {
        setActivePage(button.dataset.target);
      });
      button.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
          return;
        }
        event.preventDefault();
        const tablist = button.closest("[role='tablist']");
        const buttons = [...tablist.querySelectorAll("[data-target]")];
        const currentIndex = buttons.indexOf(button);
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : event.key === "ArrowUp"
              ? (currentIndex - 1 + buttons.length) % buttons.length
              : (currentIndex + 1) % buttons.length;
        const nextButton = buttons[nextIndex];
        nextButton.focus();
        setActivePage(nextButton.dataset.target);
      });
    });
    $("mode-projection-button").addEventListener("click", () => {
      state.practiceMode = "projection";
      state.activeIndex = 0;
      $("typing-input").value = "";
      renderPractice();
      $("typing-input").focus();
    });
    $("mode-deck-button").addEventListener("click", () => {
      state.practiceMode = "deck";
      state.activeIndex = 0;
      $("typing-input").value = "";
      renderPractice();
      $("typing-input").focus();
    });
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
    $("typing-input").addEventListener("input", renderTypingGhost);

    void refresh();
