export const LEARNING_WORKSPACE_HTML = `<!doctype html>
<html lang="en" data-readfrog-learning-workspace>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Read Frog Learning Workspace</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #eef1ef;
      --ink: #181713;
      --muted: #67645d;
      --line: #cbd2cd;
      --panel: #fbfcfa;
      --panel-2: #e3e8e4;
      --accent: #2f6f5e;
      --attention: #aa6a16;
      --danger: #a23d31;
      --shadow: 0 18px 48px rgba(40, 36, 24, 0.12);
      font-family: "Aptos", "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-width: 320px;
      min-height: 100vh;
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-size: 14px;
    }

    button,
    input {
      font: inherit;
    }

    button {
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      cursor: pointer;
    }

    button:hover {
      border-color: var(--accent);
    }

    .shell {
      display: grid;
      grid-template-rows: 56px 1fr;
      min-height: 100vh;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 18px;
      border-bottom: 1px solid var(--line);
      background: rgba(251, 252, 250, 0.9);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 2;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .mark {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      border: 1px solid var(--ink);
      background: var(--ink);
      color: var(--panel);
      font-weight: 700;
    }

    h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0;
      white-space: nowrap;
    }

    .status-strip {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--muted);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 9px;
      border: 1px solid var(--line);
      background: var(--panel);
      white-space: nowrap;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--attention);
    }

    .dot.ok {
      background: var(--accent);
    }

    .workspace {
      display: grid;
      grid-template-columns: 176px minmax(0, 1fr) 292px;
      gap: 0;
      min-height: calc(100vh - 56px);
    }

    .rail,
    .context {
      background: var(--panel-2);
      border-right: 1px solid var(--line);
      padding: 14px;
    }

    .context {
      border-right: 0;
      border-left: 1px solid var(--line);
      overflow: auto;
    }

    .nav {
      display: grid;
      gap: 6px;
    }

    .nav button {
      width: 100%;
      height: 34px;
      padding: 0 10px;
      text-align: left;
      background: transparent;
      border-color: transparent;
    }

    .nav button[aria-current="page"] {
      border-color: var(--ink);
      background: var(--panel);
      font-weight: 700;
    }

    .meta-block {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 10px;
      color: var(--muted);
      font-size: 12px;
    }

    .main {
      display: grid;
      grid-template-rows: auto auto 1fr;
      gap: 14px;
      padding: 14px;
      overflow: hidden;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      border: 1px solid var(--line);
      background: var(--panel);
      box-shadow: var(--shadow);
    }

    .metric {
      min-width: 0;
      padding: 12px;
      border-right: 1px solid var(--line);
    }

    .metric:last-child {
      border-right: 0;
    }

    .label {
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .value {
      margin-top: 6px;
      font-size: 26px;
      line-height: 1;
      font-weight: 760;
      font-variant-numeric: tabular-nums;
    }

    .surface {
      border: 1px solid var(--line);
      background: var(--panel);
    }

    .practice {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 180px;
      min-height: 248px;
    }

    .stage {
      padding: 18px;
      border-right: 1px solid var(--line);
      display: grid;
      grid-template-rows: auto auto auto 1fr;
      gap: 12px;
    }

    .stage-word {
      min-height: 46px;
      font-size: 38px;
      line-height: 1;
      font-weight: 780;
      overflow-wrap: anywhere;
    }

    .stage-input {
      width: 100%;
      height: 44px;
      padding: 0 12px;
      border: 1px solid var(--ink);
      background: #fff;
      color: var(--ink);
      outline: none;
    }

    .stage-input:focus {
      box-shadow: 0 0 0 3px rgba(47, 111, 94, 0.18);
    }

    .definition {
      min-height: 20px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    .actions {
      display: flex;
      align-items: end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .primary {
      height: 36px;
      padding: 0 14px;
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
      font-weight: 700;
    }

    .secondary {
      height: 36px;
      padding: 0 12px;
    }

    .session {
      padding: 14px;
      display: grid;
      align-content: start;
      gap: 10px;
      background: #f2f4ef;
    }

    .session-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-variant-numeric: tabular-nums;
    }

    .table-wrap {
      min-height: 0;
      overflow: auto;
      border: 1px solid var(--line);
      background: var(--panel);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    th,
    td {
      padding: 9px 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    th {
      position: sticky;
      top: 0;
      background: var(--panel);
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0;
      z-index: 1;
    }

    td:nth-child(1),
    th:nth-child(1) {
      width: 28%;
    }

    td:nth-child(2),
    th:nth-child(2) {
      width: 15%;
    }

    td:nth-child(3),
    th:nth-child(3) {
      width: 14%;
    }

    td:nth-child(4),
    th:nth-child(4) {
      width: 15%;
    }

    .status {
      font-weight: 700;
    }

    .status.mature {
      color: var(--accent);
    }

    .status.review {
      color: var(--attention);
    }

    .status.archived {
      color: var(--muted);
    }

    .panel-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    h2 {
      margin: 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .context-list {
      display: grid;
      gap: 10px;
    }

    .log {
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 10px;
      min-height: 70px;
    }

    .log strong {
      display: block;
      overflow-wrap: anywhere;
    }

    .log span {
      display: block;
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .empty {
      color: var(--muted);
      padding: 12px;
      border: 1px dashed var(--line);
      background: rgba(251, 252, 250, 0.62);
    }

    .toast {
      min-height: 18px;
      color: var(--muted);
      font-size: 12px;
    }

    .toast.error {
      color: var(--danger);
    }

    @media (max-width: 1080px) {
      .workspace {
        grid-template-columns: 146px minmax(0, 1fr);
      }

      .context {
        display: none;
      }
    }

    @media (max-width: 760px) {
      .topbar {
        align-items: start;
        height: auto;
        min-height: 56px;
        flex-direction: column;
        padding: 10px 12px;
      }

      .workspace {
        grid-template-columns: 1fr;
      }

      .rail {
        display: none;
      }

      .main {
        padding: 10px;
      }

      .metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .metric:nth-child(2) {
        border-right: 0;
      }

      .metric:nth-child(-n+2) {
        border-bottom: 1px solid var(--line);
      }

      .practice {
        grid-template-columns: 1fr;
      }

      .stage {
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }

      .table-wrap {
        max-height: 45vh;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="mark" aria-hidden="true">R</div>
        <h1>Learning Workspace</h1>
      </div>
      <div class="status-strip">
        <span class="pill"><span id="health-dot" class="dot"></span><span id="health-text">Connecting</span></span>
        <span class="pill" id="version-pill">projection-0</span>
        <button class="secondary" id="refresh-button" type="button">Refresh</button>
      </div>
    </header>

    <div class="workspace">
      <aside class="rail" aria-label="Workspace navigation">
        <nav class="nav">
          <button type="button" aria-current="page">Today</button>
          <button type="button">Practice</button>
          <button type="button">Reading Inbox</button>
          <button type="button">Decks</button>
          <button type="button">Error Book</button>
          <button type="button">Analytics</button>
        </nav>
        <div class="meta-block">
          <div>Daemon: <strong id="daemon-service">unknown</strong></div>
          <div>Contract: <strong id="contract-version">unknown</strong></div>
          <div>Source: captures + qwerty records</div>
        </div>
      </aside>

      <main class="main">
        <section class="metrics" aria-label="Mastery distribution">
          <div class="metric">
            <div class="label">Learning</div>
            <div class="value" id="metric-learning">0</div>
          </div>
          <div class="metric">
            <div class="label">Review</div>
            <div class="value" id="metric-review">0</div>
          </div>
          <div class="metric">
            <div class="label">Mature</div>
            <div class="value" id="metric-mature">0</div>
          </div>
          <div class="metric">
            <div class="label">Archived</div>
            <div class="value" id="metric-archived">0</div>
          </div>
        </section>

        <section class="surface practice" aria-label="Qwerty practice">
          <div class="stage">
            <div class="label">Qwerty practice</div>
            <div id="stage-word" class="stage-word">No terms yet</div>
            <input id="typing-input" class="stage-input" autocomplete="off" spellcheck="false" aria-label="Type current word">
            <div id="definition" class="definition">Capture a selection from the extension or seed a record to begin.</div>
            <div class="actions">
              <button id="submit-button" class="primary" type="button">Submit</button>
              <button id="skip-button" class="secondary" type="button">Next</button>
              <span id="toast" class="toast"></span>
            </div>
          </div>
          <div class="session" aria-label="Practice session">
            <div class="session-row"><span>Attempts</span><strong id="session-attempts">0</strong></div>
            <div class="session-row"><span>Correct</span><strong id="session-correct">0</strong></div>
            <div class="session-row"><span>Accuracy</span><strong id="session-accuracy">0%</strong></div>
            <div class="session-row"><span>Active term</span><strong id="session-active">-</strong></div>
          </div>
        </section>

        <section class="table-wrap" aria-label="Projection terms">
          <table>
            <thead>
              <tr>
                <th>Term</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Confidence</th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody id="projection-body">
              <tr><td colspan="5">Loading projection...</td></tr>
            </tbody>
          </table>
        </section>
      </main>

      <aside class="context" aria-label="Learning context">
        <div class="panel-title">
          <h2>Reading Inbox</h2>
          <span class="label" id="inbox-count">0 items</span>
        </div>
        <div id="context-list" class="context-list">
          <div class="empty">No daemon data loaded yet.</div>
        </div>
      </aside>
    </div>
  </div>

  <script>
    const state = {
      health: null,
      projection: { projectionVersion: "projection-0", entries: [] },
      dictionaries: [],
      dictionaryWords: [],
      dictionaryId: null,
      chapterIndex: 0,
      activeIndex: 0,
      session: { attempts: 0, correct: 0 },
      startedAt: Date.now(),
    };

    const $ = (id) => document.getElementById(id);

    function setText(id, value) {
      $(id).textContent = String(value);
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
      const counts = state.projection.entries.reduce((result, entry) => {
        result[entry.status] = (result[entry.status] ?? 0) + 1;
        return result;
      }, {});
      setText("metric-learning", counts.learning ?? 0);
      setText("metric-review", counts.review ?? 0);
      setText("metric-mature", counts.mature ?? 0);
      setText("metric-archived", counts.archived ?? 0);
      setText("version-pill", state.projection.projectionVersion);
    }

    function renderPractice() {
      const entry = activeEntry();
      const input = $("typing-input");
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
      setText("session-attempts", state.session.attempts);
      setText("session-correct", state.session.correct);
      const accuracy = state.session.attempts
        ? Math.round((state.session.correct / state.session.attempts) * 100)
        : 0;
      setText("session-accuracy", accuracy + "%");
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
      const entries = sortEntries(state.projection.entries).slice(0, 8);
      setText("inbox-count", entries.length + " items");
      if (!entries.length) {
        list.replaceChildren(emptyContext("Selection captures will appear here after the extension syncs."));
        return;
      }
      list.replaceChildren(...entries.map((entry) => {
        const item = document.createElement("div");
        item.className = "log";
        const title = document.createElement("strong");
        title.textContent = entry.normalizedText;
        const detail = document.createElement("span");
        detail.textContent = entry.status + ' / ' + Math.round(entry.confidence * 100) + '%'
          + (entry.definition ? ' / ' + entry.definition : '');
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
        const [healthResponse, projectionResponse, dictionariesResponse] = await Promise.all([
          fetch("/api/v1/health"),
          fetch("/api/v1/projection"),
          fetch("/api/v1/qwerty/dictionaries"),
        ]);
        state.health = await healthResponse.json();
        state.projection = await projectionResponse.json();
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
      state.chapterIndex = chapter.chapterIndex;
      state.dictionaryWords = chapter.words || [];
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
  </script>
</body>
</html>`
