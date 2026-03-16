/* ================================================================
   COMMAND BAR — Search, Ask, Act
   ================================================================ */

(function () {
  'use strict';

  // ---- Build search index from map data ----
  // We read from the global DOM since the data is already rendered
  function buildIndex() {
    const items = [];

    // Tasks
    document.querySelectorAll('.node--task').forEach(el => {
      const taskId = el.getAttribute('data-task');
      const status = el.getAttribute('data-status');
      const wsId = el.getAttribute('data-workstream');
      const title = el.querySelector('.node-title')?.textContent?.trim() || '';
      const assignee = el.querySelector('.node-assignee')?.textContent?.trim() || '';
      const origin = el.querySelector('.node-origin')?.textContent?.trim() || '';

      items.push({
        type: 'task',
        id: taskId,
        title,
        assignee,
        status,
        workstream: wsId,
        origin,
        el,
        searchText: `${title} ${assignee} ${origin} ${status}`.toLowerCase()
      });
    });

    // Workstreams
    document.querySelectorAll('.node--workstream').forEach(el => {
      const wsId = el.getAttribute('data-workstream');
      const title = el.querySelector('.node-title')?.textContent?.trim() || '';
      const emoji = el.querySelector('.node-emoji')?.textContent?.trim() || '';

      items.push({
        type: 'workstream',
        id: wsId,
        title,
        emoji,
        el,
        searchText: `${title} ${emoji}`.toLowerCase()
      });
    });

    return items;
  }

  // ---- Status keyword mapping ----
  const STATUS_KEYWORDS = {
    'blocked': 'red', 'red': 'red', 'blocker': 'red', 'stuck': 'red',
    'attention': 'amber', 'amber': 'amber', 'warning': 'amber', 'at risk': 'amber', 'risk': 'amber',
    'on track': 'green', 'green': 'green', 'good': 'green', 'ok': 'green',
    'completed': 'blue', 'done': 'blue', 'finished': 'blue', 'blue': 'blue',
    'overdue': 'overdue'
  };

  // ---- Slash commands ----
  const SLASH_COMMANDS = [
    { cmd: '/status',    emoji: '📊', label: 'Project status summary', description: 'Overview of all workstreams and task health' },
    { cmd: '/deadlines', emoji: '📅', label: 'Upcoming deadlines', description: 'Tasks sorted by due date' },
    { cmd: '/risks',     emoji: '🚨', label: 'Risks & blockers', description: 'All amber and red tasks with suggested actions' },
    { cmd: '/blocked',   emoji: '🔴', label: 'Blocked tasks', description: 'Tasks that need immediate attention' },
    { cmd: '/people',    emoji: '👥', label: 'Team overview', description: 'Tasks grouped by assignee' },
    { cmd: '/draft',     emoji: '✏️', label: 'Draft a message', description: 'Draft an email or message about a task' },
    { cmd: '/sync',      emoji: '🔄', label: 'Sync check', description: 'Check ClickUp/Drive sync status' },
    { cmd: '/deps',      emoji: '🔗', label: 'Dependency chain', description: 'Show task dependencies and blockers' },
  ];

  // ---- Recent queries (in-memory) ----
  let recentQueries = [];

  function addRecent(query) {
    if (!query || query.length < 2) return;
    recentQueries = [query, ...recentQueries.filter(q => q !== query)].slice(0, 8);
    // Stored in-memory for the session
  }

  // ---- Create DOM ----
  const overlay = document.createElement('div');
  overlay.className = 'cmd-overlay';

  const bar = document.createElement('div');
  bar.className = 'cmd-bar';
  bar.innerHTML = `
    <div class="cmd-input-row">
      <svg class="cmd-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
        <path d="M12 12L16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <input class="cmd-input" type="text" placeholder="Search tasks, people, or type / for commands..." autocomplete="off" spellcheck="false" />
      <div class="cmd-shortcut">
        <kbd>⌘K</kbd>
      </div>
    </div>
    <div class="cmd-results"></div>
    <div class="cmd-footer">
      <span class="cmd-footer-hint"><kbd>↑↓</kbd> navigate</span>
      <span class="cmd-footer-hint"><kbd>↵</kbd> select</span>
      <span class="cmd-footer-hint"><kbd>esc</kbd> close</span>
      <span class="cmd-footer-hint"><kbd>/</kbd> commands</span>
    </div>
  `;

  overlay.appendChild(bar);
  document.body.appendChild(overlay);

  // AI Answer panel
  const answerPanel = document.createElement('div');
  answerPanel.className = 'cmd-answer-panel';
  answerPanel.innerHTML = `
    <button class="cmd-answer-close">&times;</button>
    <div class="cmd-answer-content"></div>
    <div class="cmd-answer-sources"></div>
  `;
  document.body.appendChild(answerPanel);

  const input = bar.querySelector('.cmd-input');
  const results = bar.querySelector('.cmd-results');
  const answerContent = answerPanel.querySelector('.cmd-answer-content');
  const answerSources = answerPanel.querySelector('.cmd-answer-sources');
  const answerClose = answerPanel.querySelector('.cmd-answer-close');

  let isOpen = false;
  let selectedIndex = -1;
  let currentResults = [];
  let searchIndex = [];
  let contextNode = null; // The currently selected map node for contextual suggestions

  // ---- Open / Close ----
  function open() {
    if (isOpen) return;
    isOpen = true;
    // Build fresh index
    searchIndex = buildIndex();
    overlay.classList.add('active');
    input.value = '';
    selectedIndex = -1;
    showInitialState();
    requestAnimationFrame(() => input.focus());
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('active');
    input.blur();
    results.innerHTML = '';
    currentResults = [];
    // Clear any search-driven highlights
    clearSearchHighlights();
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  // ---- Show initial state (contextual suggestions + recents) ----
  function showInitialState() {
    let html = '';

    // Contextual suggestions based on selected node
    const selectedTask = document.querySelector('.node--task.keyboard-focus, .node--task:hover');
    if (selectedTask || contextNode) {
      const node = selectedTask || contextNode;
      const taskId = node.getAttribute('data-task');
      const title = node.querySelector('.node-title')?.textContent?.trim();
      const status = node.getAttribute('data-status');

      html += '<div class="cmd-section-label">Suggestions</div>';
      const suggestions = [];
      if (status === 'red') {
        suggestions.push({ emoji: '🔍', text: `What's blocking ${title}?`, query: `What's blocking ${title}?` });
        suggestions.push({ emoji: '✏️', text: `Draft follow-up about ${title}`, query: `!draft follow-up about ${title}` });
        suggestions.push({ emoji: '🔗', text: `Show dependency chain`, query: `Show dependencies for ${title}` });
      } else if (status === 'amber') {
        suggestions.push({ emoji: '⚠️', text: `What needs attention on ${title}?`, query: `What needs attention on ${title}?` });
        suggestions.push({ emoji: '✏️', text: `Draft status update`, query: `!draft status update for ${title}` });
      } else {
        suggestions.push({ emoji: '📋', text: `Show details for ${title}`, query: title });
        suggestions.push({ emoji: '📧', text: `Related communications`, query: `Show emails about ${title}` });
      }
      suggestions.push({ emoji: '📄', text: `Related documents`, query: `Show documents for ${title}` });

      suggestions.forEach((s, i) => {
        html += `<div class="cmd-result cmd-result--suggestion" data-index="${i}" data-query="${escapeHtml(s.query)}">
          <span class="cmd-result-emoji">${s.emoji}</span>
          <span class="cmd-result-text">${s.text}</span>
        </div>`;
      });
      currentResults = suggestions.map(s => ({ type: 'suggestion', query: s.query }));
    }

    // Recent queries
    if (recentQueries.length > 0) {
      html += '<div class="cmd-section-label">Recent</div>';
      const startIdx = currentResults.length;
      recentQueries.slice(0, 5).forEach((q, i) => {
        html += `<div class="cmd-result cmd-result--recent" data-index="${startIdx + i}" data-query="${escapeHtml(q)}">
          <span class="cmd-result-emoji">🕐</span>
          <span class="cmd-result-text">${escapeHtml(q)}</span>
        </div>`;
        currentResults.push({ type: 'recent', query: q });
      });
    }

    // Quick actions
    html += '<div class="cmd-section-label">Quick Actions</div>';
    const quickIdx = currentResults.length;
    const quickActions = [
      { emoji: '📊', text: 'Project status summary', query: '/status' },
      { emoji: '🚨', text: 'Show risks & blockers', query: '/risks' },
      { emoji: '📅', text: 'Upcoming deadlines', query: '/deadlines' },
    ];
    quickActions.forEach((a, i) => {
      html += `<div class="cmd-result cmd-result--quick" data-index="${quickIdx + i}" data-query="${escapeHtml(a.query)}">
        <span class="cmd-result-emoji">${a.emoji}</span>
        <span class="cmd-result-text">${a.text}</span>
        <span class="cmd-result-badge">command</span>
      </div>`;
      currentResults.push({ type: 'command', query: a.query });
    });

    results.innerHTML = html;
    selectedIndex = -1;
    bindResultClicks();
  }

  // ---- Search logic ----
  function handleInput() {
    const raw = input.value;
    const q = raw.trim().toLowerCase();

    if (!q) {
      showInitialState();
      clearSearchHighlights();
      return;
    }

    // Slash commands
    if (raw.startsWith('/')) {
      showSlashCommands(raw);
      return;
    }

    // Question mode (starts with ? or is a natural language question)
    if (raw.startsWith('?') || isQuestion(raw)) {
      showAIResults(raw.replace(/^\?/, '').trim());
      return;
    }

    // Action mode
    if (raw.startsWith('!')) {
      showActionResults(raw.substring(1).trim());
      return;
    }

    // Live search
    performSearch(q);
  }

  function isQuestion(text) {
    const t = text.toLowerCase().trim();
    return t.startsWith('what') || t.startsWith('who') || t.startsWith('when') ||
           t.startsWith('where') || t.startsWith('why') || t.startsWith('how') ||
           t.startsWith('show me') || t.startsWith('tell me') || t.startsWith('is there') ||
           t.endsWith('?');
  }

  function performSearch(q) {
    currentResults = [];
    let html = '';

    // Check for status keywords
    const statusMatch = STATUS_KEYWORDS[q];

    // Search the index
    const matches = searchIndex.filter(item => {
      if (statusMatch) {
        if (statusMatch === 'overdue') {
          // TODO: check due date
          return item.type === 'task' && (item.status === 'red' || item.status === 'amber');
        }
        return item.type === 'task' && item.status === statusMatch;
      }
      return item.searchText.includes(q);
    });

    // Highlight matching nodes on the map in real-time
    highlightSearchResults(matches);

    if (matches.length === 0) {
      html += `<div class="cmd-result cmd-result--empty">
        <span class="cmd-result-emoji">🔍</span>
        <span class="cmd-result-text">No matches for "${escapeHtml(q)}"</span>
      </div>`;
      html += `<div class="cmd-result cmd-result--ask" data-index="0" data-query="?${escapeHtml(q)}">
        <span class="cmd-result-emoji">🤖</span>
        <span class="cmd-result-text">Ask AI: "${escapeHtml(q)}"</span>
        <span class="cmd-result-badge">ask</span>
      </div>`;
      currentResults.push({ type: 'ask', query: `?${q}` });
    } else {
      html += `<div class="cmd-section-label">${matches.length} result${matches.length !== 1 ? 's' : ''}</div>`;
      matches.forEach((m, i) => {
        const statusLabel = { green: 'On Track', amber: 'Attention', red: 'Blocked', blue: 'Done' };
        if (m.type === 'task') {
          html += `<div class="cmd-result cmd-result--task" data-index="${i}" data-task-id="${m.id}">
            <span class="cmd-result-dot cmd-result-dot--${m.status}"></span>
            <span class="cmd-result-text">${highlightMatch(m.title, q)}</span>
            <span class="cmd-result-meta">${m.assignee}</span>
            <span class="cmd-result-badge cmd-result-badge--${m.status}">${statusLabel[m.status] || m.status}</span>
          </div>`;
        } else if (m.type === 'workstream') {
          html += `<div class="cmd-result cmd-result--ws" data-index="${i}" data-ws-id="${m.id}">
            <span class="cmd-result-emoji">${m.emoji}</span>
            <span class="cmd-result-text">${highlightMatch(m.title, q)}</span>
            <span class="cmd-result-badge">workstream</span>
          </div>`;
        }
        currentResults.push(m);
      });

      // Also offer AI ask
      const askIdx = matches.length;
      html += `<div class="cmd-section-label">AI</div>`;
      html += `<div class="cmd-result cmd-result--ask" data-index="${askIdx}" data-query="?${escapeHtml(q)}">
        <span class="cmd-result-emoji">🤖</span>
        <span class="cmd-result-text">Ask about "${escapeHtml(q)}"</span>
        <span class="cmd-result-badge">ask</span>
      </div>`;
      currentResults.push({ type: 'ask', query: `?${q}` });
    }

    results.innerHTML = html;
    selectedIndex = -1;
    bindResultClicks();
  }

  // ---- Slash commands display ----
  function showSlashCommands(raw) {
    const q = raw.substring(1).toLowerCase().trim();
    const filtered = SLASH_COMMANDS.filter(c =>
      c.cmd.includes(q) || c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );

    currentResults = [];
    let html = '<div class="cmd-section-label">Commands</div>';

    filtered.forEach((c, i) => {
      html += `<div class="cmd-result cmd-result--command" data-index="${i}" data-cmd="${c.cmd}">
        <span class="cmd-result-emoji">${c.emoji}</span>
        <div class="cmd-result-col">
          <span class="cmd-result-text">${c.cmd} <span class="cmd-result-cmd-label">${c.label}</span></span>
          <span class="cmd-result-desc">${c.description}</span>
        </div>
      </div>`;
      currentResults.push({ type: 'slash', cmd: c.cmd });
    });

    if (filtered.length === 0) {
      html += `<div class="cmd-result cmd-result--empty">
        <span class="cmd-result-emoji">🤷</span>
        <span class="cmd-result-text">No matching commands</span>
      </div>`;
    }

    results.innerHTML = html;
    selectedIndex = -1;
    bindResultClicks();
  }

  // ---- AI results (question mode) ----
  function showAIResults(q) {
    currentResults = [];
    let html = '<div class="cmd-section-label">AI will analyze</div>';
    html += `<div class="cmd-result cmd-result--ask-preview" data-index="0" data-query="?${escapeHtml(q)}">
      <span class="cmd-result-emoji">🤖</span>
      <div class="cmd-result-col">
        <span class="cmd-result-text">${escapeHtml(q)}</span>
        <span class="cmd-result-desc">Press Enter to get an answer from the map data</span>
      </div>
      <span class="cmd-result-badge">ask</span>
    </div>`;
    currentResults.push({ type: 'ask', query: q });
    results.innerHTML = html;
    selectedIndex = 0;
    results.querySelector('[data-index="0"]')?.classList.add('selected');
    bindResultClicks();
  }

  // ---- Action mode ----
  function showActionResults(q) {
    currentResults = [];
    let html = '<div class="cmd-section-label">Action</div>';
    const actions = [
      { emoji: '✏️', text: `Draft: "${q}"`, desc: 'Create an email or message draft' },
      { emoji: '➕', text: `Create task: "${q}"`, desc: 'Add as a new task in ClickUp' },
      { emoji: '📅', text: `Schedule: "${q}"`, desc: 'Find a time slot and schedule' },
    ];
    actions.forEach((a, i) => {
      html += `<div class="cmd-result cmd-result--action" data-index="${i}">
        <span class="cmd-result-emoji">${a.emoji}</span>
        <div class="cmd-result-col">
          <span class="cmd-result-text">${a.text}</span>
          <span class="cmd-result-desc">${a.desc}</span>
        </div>
        <span class="cmd-result-badge">action</span>
      </div>`;
      currentResults.push({ type: 'action', text: a.text });
    });
    results.innerHTML = html;
    selectedIndex = -1;
    bindResultClicks();
  }

  // ---- Execute a result ----
  function executeResult(result) {
    if (!result) return;

    if (result.type === 'task') {
      // Click the task node to open detail panel
      addRecent(result.title);
      close();
      result.el.click();
    } else if (result.type === 'workstream') {
      addRecent(result.title);
      close();
      result.el.click();
    } else if (result.type === 'suggestion' || result.type === 'recent') {
      input.value = result.query;
      handleInput();
    } else if (result.type === 'command') {
      input.value = result.query;
      handleInput();
    } else if (result.type === 'slash') {
      addRecent(result.cmd);
      executeSlashCommand(result.cmd);
    } else if (result.type === 'ask') {
      const q = result.query.replace(/^\?/, '').trim();
      addRecent(q);
      close();
      showAIAnswer(q);
    } else if (result.type === 'action') {
      addRecent(result.text);
      close();
      showAIAnswer(`Action requested: ${result.text}`);
    }
  }

  // ---- Execute slash commands ----
  function executeSlashCommand(cmd) {
    close();
    switch (cmd) {
      case '/status':
        showAIAnswer('Give me the project status summary');
        break;
      case '/deadlines':
        showAIAnswer('Show upcoming deadlines');
        break;
      case '/risks':
        showAIAnswer('Show all risks and blockers');
        break;
      case '/blocked':
        showAIAnswer('Show all blocked tasks');
        break;
      case '/people':
        showAIAnswer('Show team overview');
        break;
      case '/draft':
        open();
        input.value = '!draft ';
        input.focus();
        handleInput();
        break;
      case '/sync':
        showAIAnswer('Check sync status');
        break;
      case '/deps':
        showAIAnswer('Show dependency chain');
        break;
    }
  }

  // ---- AI Answer Engine (local intelligence from map data) ----
  function showAIAnswer(query) {
    const q = query.toLowerCase();
    let answer = '';
    let sources = [];
    let highlightIds = [];

    // Gather all task data from DOM
    const tasks = [];
    document.querySelectorAll('.node--task').forEach(el => {
      const id = el.getAttribute('data-task');
      const status = el.getAttribute('data-status');
      const wsId = el.getAttribute('data-workstream');
      const title = el.querySelector('.node-title')?.textContent?.trim();
      const assignee = el.querySelector('.node-assignee')?.textContent?.trim();
      tasks.push({ id, status, wsId, title, assignee, el });
    });

    const statusLabels = { green: 'On Track', amber: 'Attention Needed', red: 'Blocked', blue: 'Completed' };
    const statusEmoji = { green: '🟢', amber: '🟡', red: '🔴', blue: '🔵' };

    // ---- Answer generation based on query type ----

    if (q.includes('status') && (q.includes('summary') || q.includes('project') || q.includes('overview'))) {
      // Project status summary
      const counts = { green: 0, amber: 0, red: 0, blue: 0 };
      tasks.forEach(t => counts[t.status]++);
      const total = tasks.length;
      const pct = Math.round((counts.blue / total) * 100);

      answer = `
        <div class="ai-title">📊 Project Status — Denmark OI</div>
        <div class="ai-progress">
          <div class="ai-progress-bar"><div class="ai-progress-fill" style="width:${pct}%"></div></div>
          <span class="ai-progress-label">${pct}% complete (${counts.blue}/${total} tasks)</span>
        </div>
        <div class="ai-grid">
          <div class="ai-stat ai-stat--green"><span class="ai-stat-num">${counts.green}</span><span class="ai-stat-label">On Track</span></div>
          <div class="ai-stat ai-stat--amber"><span class="ai-stat-num">${counts.amber}</span><span class="ai-stat-label">Attention</span></div>
          <div class="ai-stat ai-stat--red"><span class="ai-stat-num">${counts.red}</span><span class="ai-stat-label">Blocked</span></div>
          <div class="ai-stat ai-stat--blue"><span class="ai-stat-num">${counts.blue}</span><span class="ai-stat-label">Done</span></div>
        </div>
        ${counts.red > 0 ? `<div class="ai-alert"><span class="ai-alert-icon">🚨</span>${counts.red} blocked task${counts.red > 1 ? 's' : ''} requiring immediate attention</div>` : ''}
        ${counts.amber > 0 ? `<div class="ai-warn"><span class="ai-alert-icon">⚠️</span>${counts.amber} task${counts.amber > 1 ? 's' : ''} need${counts.amber === 1 ? 's' : ''} attention</div>` : ''}
      `;
      sources = ['📋 Map Data', '✅ ClickUp', '📁 Google Drive'];
    }

    else if (q.includes('deadline') || q.includes('due')) {
      // Deadlines — parse from detail panel data
      answer = `<div class="ai-title">📅 Upcoming Deadlines</div><div class="ai-list">`;
      // Sort tasks by risk (red first, then amber, then upcoming green)
      const sorted = [...tasks].sort((a, b) => {
        const order = { red: 0, amber: 1, green: 2, blue: 3 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      }).filter(t => t.status !== 'blue');

      sorted.forEach(t => {
        highlightIds.push(t.id);
        answer += `<div class="ai-list-item ai-list-item--clickable" data-task-id="${t.id}">
          <span class="ai-list-dot ai-list-dot--${t.status}"></span>
          <span class="ai-list-text">${t.title}</span>
          <span class="ai-list-meta">${t.assignee}</span>
          <span class="ai-list-badge ai-list-badge--${t.status}">${statusLabels[t.status]}</span>
        </div>`;
      });
      answer += '</div>';
      sources = ['📋 Map Data', '✅ ClickUp'];
    }

    else if (q.includes('risk') || q.includes('blocker') || q.includes('blocked')) {
      // Risks and blockers
      const riskyTasks = tasks.filter(t => t.status === 'red' || t.status === 'amber');
      answer = `<div class="ai-title">🚨 Risks & Blockers</div>`;

      if (riskyTasks.length === 0) {
        answer += '<div class="ai-text">No blocked or at-risk tasks. Everything is on track.</div>';
      } else {
        answer += '<div class="ai-list">';
        riskyTasks.forEach(t => {
          highlightIds.push(t.id);
          const isBlocked = t.status === 'red';
          answer += `<div class="ai-list-item ai-list-item--clickable ${isBlocked ? 'ai-list-item--danger' : 'ai-list-item--warn'}" data-task-id="${t.id}">
            <span class="ai-list-dot ai-list-dot--${t.status}"></span>
            <div class="ai-list-col">
              <span class="ai-list-text">${t.title}</span>
              <span class="ai-list-sub">${t.assignee} · ${isBlocked ? 'Blocked — needs escalation' : 'Needs attention'}</span>
            </div>
            <span class="ai-list-badge ai-list-badge--${t.status}">${statusLabels[t.status]}</span>
          </div>`;
        });
        answer += '</div>';

        // Suggested actions
        const blocked = riskyTasks.filter(t => t.status === 'red');
        if (blocked.length > 0) {
          answer += '<div class="ai-section-label">Suggested Actions</div><div class="ai-actions">';
          blocked.forEach(t => {
            answer += `<div class="ai-action" data-task-id="${t.id}">
              <span class="ai-action-icon">✏️</span>
              Draft follow-up for ${t.title}
            </div>`;
          });
          answer += '</div>';
        }
      }
      sources = ['📋 Map Data', '✅ ClickUp', '📧 Gmail'];
    }

    else if (q.includes('team') || q.includes('people') || q.includes('who')) {
      // Team overview
      const byPerson = {};
      tasks.forEach(t => {
        if (!byPerson[t.assignee]) byPerson[t.assignee] = [];
        byPerson[t.assignee].push(t);
      });

      answer = `<div class="ai-title">👥 Team Overview</div><div class="ai-list">`;
      Object.entries(byPerson).forEach(([person, personTasks]) => {
        const statuses = personTasks.map(t => statusEmoji[t.status]).join(' ');
        answer += `<div class="ai-list-item">
          <span class="ai-list-avatar">${person.charAt(0)}</span>
          <div class="ai-list-col">
            <span class="ai-list-text">${person}</span>
            <span class="ai-list-sub">${personTasks.map(t => `<span class="ai-inline-task ai-list-item--clickable" data-task-id="${t.id}">${statusEmoji[t.status]} ${t.title}</span>`).join(', ')}</span>
          </div>
        </div>`;
        personTasks.forEach(t => highlightIds.push(t.id));
      });
      answer += '</div>';
      sources = ['📋 Map Data', '✅ ClickUp'];
    }

    else if (q.includes('blocking') || q.includes("what's blocking")) {
      // What's blocking X?
      const blocked = tasks.filter(t => t.status === 'red');
      answer = `<div class="ai-title">🔗 Blocker Analysis</div>`;

      if (blocked.length === 0) {
        answer += '<div class="ai-text">No blocked tasks found.</div>';
      } else {
        answer += '<div class="ai-list">';
        blocked.forEach(t => {
          highlightIds.push(t.id);
          answer += `<div class="ai-list-item ai-list-item--clickable ai-list-item--danger" data-task-id="${t.id}">
            <span class="ai-list-dot ai-list-dot--red"></span>
            <div class="ai-list-col">
              <span class="ai-list-text">${t.title}</span>
              <span class="ai-list-sub">${t.assignee}</span>
            </div>
          </div>`;
        });
        answer += '</div>';

        // Check for downstream effects
        const commsBlocked = tasks.find(t => t.title?.includes('Client Update'));
        const apiBlocked = tasks.find(t => t.title?.includes('API'));
        if (commsBlocked && apiBlocked) {
          answer += `<div class="ai-chain">
            <div class="ai-chain-title">Dependency Chain</div>
            <div class="ai-chain-flow">
              <span class="ai-chain-node ai-chain-node--red">🔴 ${apiBlocked.title}</span>
              <span class="ai-chain-arrow">→</span>
              <span class="ai-chain-node ai-chain-node--red">🔴 ${commsBlocked.title}</span>
            </div>
            <div class="ai-chain-desc">Client Update Email is blocked because API Integration is stuck. Resolving the OAuth protocol mismatch will unblock both tasks.</div>
          </div>`;
        }
      }
      sources = ['📋 Map Data', '✅ ClickUp', '📧 Gmail', '💬 Chat'];
    }

    else if (q.includes('sync')) {
      answer = `<div class="ai-title">🔄 Sync Status</div>
        <div class="ai-sync-grid">
          <div class="ai-sync-item ai-sync-ok"><span class="ai-sync-icon">✅</span>ClickUp<span class="ai-sync-time">Synced 2 min ago</span></div>
          <div class="ai-sync-item ai-sync-ok"><span class="ai-sync-icon">✅</span>Google Drive<span class="ai-sync-time">Synced 5 min ago</span></div>
          <div class="ai-sync-item ai-sync-ok"><span class="ai-sync-icon">✅</span>Gmail<span class="ai-sync-time">Synced 1 min ago</span></div>
          <div class="ai-sync-item ai-sync-ok"><span class="ai-sync-icon">✅</span>Google Chat<span class="ai-sync-time">Synced 3 min ago</span></div>
        </div>
        <div class="ai-text" style="margin-top:12px">All sources are in sync. No discrepancies detected.</div>`;
      sources = ['✅ ClickUp', '📁 Drive', '📧 Gmail', '💬 Chat'];
    }

    else if (q.includes('dep') || q.includes('chain')) {
      // Dependency chain
      answer = `<div class="ai-title">🔗 Dependency Chain</div>`;
      const apiTask = tasks.find(t => t.title?.includes('API'));
      const clientTask = tasks.find(t => t.title?.includes('Client Update'));
      if (apiTask && clientTask) {
        highlightIds.push(apiTask.id, clientTask.id);
        answer += `<div class="ai-chain">
          <div class="ai-chain-flow">
            <span class="ai-chain-node ai-chain-node--red">🔴 API Integration</span>
            <span class="ai-chain-arrow">blocks</span>
            <span class="ai-chain-node ai-chain-node--red">🔴 Client Update Email</span>
          </div>
          <div class="ai-chain-desc">OAuth 1.0a → 2.0 migration needed. Client IT has been contacted. Once resolved, both tasks unblock.</div>
        </div>`;
      }
      // GDPR → Vendor Onboarding
      const gdprTask = tasks.find(t => t.title?.includes('GDPR'));
      const vendorTask = tasks.find(t => t.title?.includes('Vendor'));
      if (gdprTask && vendorTask) {
        highlightIds.push(gdprTask.id, vendorTask.id);
        answer += `<div class="ai-chain">
          <div class="ai-chain-flow">
            <span class="ai-chain-node ai-chain-node--amber">🟡 GDPR Compliance Audit</span>
            <span class="ai-chain-arrow">affects</span>
            <span class="ai-chain-node ai-chain-node--green">🟢 Vendor Onboarding Pack</span>
          </div>
          <div class="ai-chain-desc">Vendor onboarding has 2 remaining items pending legal review from the GDPR audit.</div>
        </div>`;
      }
      sources = ['📋 Map Data', '✅ ClickUp'];
    }

    else {
      // Generic answer — try to find matching tasks
      const matching = tasks.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.assignee?.toLowerCase().includes(q) ||
        t.wsId?.includes(q)
      );

      if (matching.length > 0) {
        answer = `<div class="ai-title">🤖 Results for "${escapeHtml(query)}"</div><div class="ai-list">`;
        matching.forEach(t => {
          highlightIds.push(t.id);
          answer += `<div class="ai-list-item ai-list-item--clickable" data-task-id="${t.id}">
            <span class="ai-list-dot ai-list-dot--${t.status}"></span>
            <div class="ai-list-col">
              <span class="ai-list-text">${t.title}</span>
              <span class="ai-list-sub">${t.assignee} · ${statusLabels[t.status]}</span>
            </div>
          </div>`;
        });
        answer += '</div>';
      } else {
        answer = `<div class="ai-title">🤖 "${escapeHtml(query)}"</div>
          <div class="ai-text">I don't have enough context to answer this from the current map data. When connected to your live sources (ClickUp, Gmail, Google Chat, Drive), I'll be able to search across all your project data to answer this.</div>
          <div class="ai-text" style="margin-top:8px;color:var(--color-accent)">Try asking about: status, deadlines, risks, blockers, team, or specific task names.</div>`;
      }
      sources = ['📋 Map Data'];
    }

    // Show the answer panel
    answerContent.innerHTML = answer;
    answerSources.innerHTML = sources.map(s => `<span class="cmd-source-badge">${s}</span>`).join('');
    answerPanel.classList.add('active');

    // Highlight referenced tasks on the map
    if (highlightIds.length > 0) {
      highlightTasksOnMap(highlightIds);
    }

    // Bind action buttons inside answer
    answerPanel.querySelectorAll('.ai-action[data-task-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.getAttribute('data-task-id');
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          closeAnswerPanel();
          setTimeout(() => {
            open();
            input.value = `!draft follow-up for ${task.title}`;
            handleInput();
          }, 400);
        }
      });
    });

    // Bind clickable task items in the answer panel → open detail panel alongside
    answerPanel.querySelectorAll('.ai-list-item--clickable[data-task-id]').forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't intercept if clicking a nested action button
        if (e.target.closest('.ai-action')) return;
        const taskId = item.getAttribute('data-task-id');
        if (taskId && window.openPanel) {
          // Remove active highlight from previously clicked items
          answerPanel.querySelectorAll('.ai-list-item--active').forEach(el => el.classList.remove('ai-list-item--active'));
          item.classList.add('ai-list-item--active');
          // Shift answer panel left to make room
          answerPanel.classList.add('answer-with-detail');
          // Open detail panel alongside the answer panel (no overlay)
          window.openPanel(taskId, { fromAnswer: true });
        }
      });
    });
  }

  function closeAnswerPanel() {
    answerPanel.classList.remove('active');
    answerPanel.classList.remove('answer-with-detail');
    answerPanel.querySelectorAll('.ai-list-item--active').forEach(el => el.classList.remove('ai-list-item--active'));
    clearSearchHighlights();
    // Also close the detail panel if it was opened from this answer
    const detailPanelEl = document.getElementById('detailPanel');
    if (detailPanelEl && detailPanelEl.classList.contains('active')) {
      // Let the app.js closePanel handle it
      const closeBtn = document.getElementById('detailClose');
      if (closeBtn) closeBtn.click();
    }
  }

  answerClose.addEventListener('click', closeAnswerPanel);

  // ---- Live map editing from search ----
  // Store original positions when first entering search so we can restore them
  let searchOriginalPositions = new Map();
  let isSearchFiltering = false;

  function storeSearchPositions() {
    if (searchOriginalPositions.size > 0) return; // already stored
    document.querySelectorAll('.node').forEach(el => {
      searchOriginalPositions.set(el, {
        left: el.style.left,
        top: el.style.top,
        transform: el.style.transform || ''
      });
    });
  }

  function restoreSearchPositions() {
    searchOriginalPositions.forEach((pos, el) => {
      el.style.left = pos.left;
      el.style.top = pos.top;
      el.style.transform = pos.transform;
    });
    searchOriginalPositions.clear();
    isSearchFiltering = false;
  }

  function highlightSearchResults(matches) {
    // Remove previous search highlights
    document.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
    document.querySelectorAll('.search-dim').forEach(el => el.classList.remove('search-dim'));

    if (matches.length === 0) {
      // Restore original positions if we were filtering
      if (isSearchFiltering) {
        restoreSearchPositions();
      }
      return;
    }

    // Store positions before we start moving things
    storeSearchPositions();
    isSearchFiltering = true;

    const matchEls = new Set(matches.map(m => m.el));

    // Get the map container dimensions
    const container = document.getElementById('mapContainer');
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Arrange matching items in a column near center
    const taskMatches = matches.filter(m => m.type === 'task');
    const wsMatches = matches.filter(m => m.type === 'workstream');
    const rowH = 52;
    const allMatching = [...wsMatches, ...taskMatches];
    const totalHeight = allMatching.length * rowH;
    const startY = centerY - totalHeight / 2 + 10;

    allMatching.forEach((m, i) => {
      m.el.classList.add('search-highlight');
      m.el.classList.remove('search-dim');
      // Move matched items toward center
      m.el.style.left = centerX + 'px';
      m.el.style.top = (startY + i * rowH) + 'px';
    });

    // Dim and push back everything else
    document.querySelectorAll('.node').forEach(n => {
      if (!matchEls.has(n)) {
        n.classList.add('search-dim');
        n.classList.remove('search-highlight');
      }
    });
  }

  function highlightTasksOnMap(taskIds) {
    clearSearchHighlights();
    const idSet = new Set(taskIds);

    document.querySelectorAll('.node--task').forEach(el => {
      const id = el.getAttribute('data-task');
      if (idSet.has(id)) {
        el.classList.add('search-highlight');
      }
    });
  }

  function clearSearchHighlights() {
    document.querySelectorAll('.search-highlight').forEach(el => el.classList.remove('search-highlight'));
    document.querySelectorAll('.search-dim').forEach(el => el.classList.remove('search-dim'));
    // Restore original positions if search was filtering the map
    if (isSearchFiltering) {
      restoreSearchPositions();
    }
  }

  // ---- Utilities ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="cmd-match">$1</mark>');
  }

  function bindResultClicks() {
    results.querySelectorAll('.cmd-result[data-index]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'));
        const result = currentResults[idx];

        // If it has a data-query, use that
        const queryAttr = el.getAttribute('data-query');
        if (queryAttr && !result?.el) {
          if (result?.type === 'ask' || queryAttr.startsWith('?')) {
            const q = queryAttr.replace(/^\?/, '').trim();
            addRecent(q);
            close();
            showAIAnswer(q);
            return;
          }
          input.value = queryAttr;
          handleInput();
          return;
        }

        // If it has a task id
        const taskId = el.getAttribute('data-task-id');
        if (taskId) {
          addRecent(el.querySelector('.cmd-result-text')?.textContent || '');
          close();
          document.querySelector(`.node--task[data-task="${taskId}"]`)?.click();
          return;
        }

        // If it has a ws id
        const wsId = el.getAttribute('data-ws-id');
        if (wsId) {
          addRecent(el.querySelector('.cmd-result-text')?.textContent || '');
          close();
          document.querySelector(`.node--workstream[data-workstream="${wsId}"]`)?.click();
          return;
        }

        // If it has a command
        const cmd = el.getAttribute('data-cmd');
        if (cmd) {
          addRecent(cmd);
          executeSlashCommand(cmd);
          return;
        }

        // Generic
        if (result) executeResult(result);
      });
    });
  }

  // ---- Keyboard handling ----
  input.addEventListener('input', handleInput);

  input.addEventListener('keydown', (e) => {
    const visibleResults = results.querySelectorAll('.cmd-result[data-index]');
    const count = visibleResults.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (count === 0) return;
      visibleResults[selectedIndex]?.classList.remove('selected');
      selectedIndex = (selectedIndex + 1) % count;
      visibleResults[selectedIndex]?.classList.add('selected');
      visibleResults[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (count === 0) return;
      visibleResults[selectedIndex]?.classList.remove('selected');
      selectedIndex = (selectedIndex - 1 + count) % count;
      visibleResults[selectedIndex]?.classList.add('selected');
      visibleResults[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && visibleResults[selectedIndex]) {
        visibleResults[selectedIndex].click();
      } else if (input.value.trim()) {
        // Direct ask
        const q = input.value.trim();
        addRecent(q);
        close();
        showAIAnswer(q);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  // ---- Global keyboard shortcut ----
  document.addEventListener('keydown', (e) => {
    // ⌘K or Ctrl+K
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      toggle();
      return;
    }

    // / key (when not in input)
    if (e.key === '/' && !e.target.matches('input, textarea') && !isOpen) {
      e.preventDefault();
      open();
      // Pre-fill with /
      requestAnimationFrame(() => {
        input.value = '/';
        handleInput();
      });
      return;
    }
  });

  // Click overlay to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Custom event from Commands button
  document.addEventListener('open-command-bar', (e) => {
    open();
    if (e.detail?.prefill) {
      requestAnimationFrame(() => {
        input.value = e.detail.prefill;
        handleInput();
      });
    }
  });

  // ---- Track selected node for contextual suggestions ----
  document.addEventListener('click', (e) => {
    const taskNode = e.target.closest('.node--task');
    if (taskNode) {
      contextNode = taskNode;
    }
  });

  // ---- Add search trigger button in header ----
  const searchBtn = document.createElement('button');
  searchBtn.className = 'header-search-btn';
  searchBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M12 12L16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <span>Search</span>
    <kbd>⌘K</kbd>
  `;
  searchBtn.addEventListener('click', open);

  // Insert into header
  const headerRight = document.querySelector('.header-right');
  if (headerRight) {
    headerRight.insertBefore(searchBtn, headerRight.firstChild);
  }

})();
