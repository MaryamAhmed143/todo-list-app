/* =========================================================
   Ledger — Task Manager
   Vanilla JS application logic
   ========================================================= */

(() => {
  'use strict';

  /* ---------------- State ---------------- */

  const STORAGE_KEY = 'ledger.tasks.v1';
  const CATEGORY_KEY = 'ledger.categories.v1';

  const DEFAULT_CATEGORIES = [
    { id: 'general', label: 'General', color: '#2C6FB0' },
    { id: 'work',    label: 'Work',    color: '#7FB0DE' },
    { id: 'personal',label: 'Personal',color: '#3FA66B' },
  ];

  let tasks = loadTasks();
  let categories = loadCategories();

  let state = {
    statusFilter: 'all',      // all | active | completed | overdue
    priorityFilter: null,     // null | high | medium | low
    categoryFilter: null,     // null | category id
    search: '',
    sort: 'manual',
    compact: false,
    editingId: null,
    expandedIds: new Set(),   // tasks with subtask panel open
  };

  let lastDeleted = null;     // { task } for undo
  let undoTimer = null;

  /* ---------------- Persistence ---------------- */

  function loadTasks(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return seedTasks();
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed) || parsed.length === 0) return seedTasks();
      return parsed.map(normalizeTask);
    }catch(e){
      return seedTasks();
    }
  }

  function seedTasks(){
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0,10);
    const inDays = (n) => { const d = new Date(today); d.setDate(d.getDate()+n); return fmt(d); };
    return [
      {
        id: uid(), title: 'Review quarterly SEO report', notes: 'Check keyword rankings and traffic trends before the client call.',
        priority: 'high', category: 'work', due: inDays(0), completed: false, createdAt: Date.now()-500000, order: 0,
        pinned: true, repeat: 'none', subtasks: [
          { id: uid(), title: 'Pull ranking data', completed: true },
          { id: uid(), title: 'Summarize traffic trends', completed: false },
          { id: uid(), title: 'Prepare talking points', completed: false },
        ]
      },
      {
        id: uid(), title: 'Fix broken links on client site', notes: '',
        priority: 'medium', category: 'work', due: inDays(2), completed: false, createdAt: Date.now()-400000, order: 1,
        pinned: false, repeat: 'none', subtasks: []
      },
      {
        id: uid(), title: 'Pay electricity bill', notes: '',
        priority: 'low', category: 'personal', due: inDays(-1), completed: false, createdAt: Date.now()-300000, order: 2,
        pinned: false, repeat: 'monthly', subtasks: []
      },
      {
        id: uid(), title: 'Draft new portfolio homepage copy', notes: 'Focus on agency tone, keep it concise.',
        priority: 'medium', category: 'general', due: inDays(5), completed: false, createdAt: Date.now()-200000, order: 3,
        pinned: false, repeat: 'none', subtasks: []
      },
      {
        id: uid(), title: 'Reply to potential client email', notes: '',
        priority: 'high', category: 'work', due: null, completed: true, createdAt: Date.now()-100000, order: 4,
        pinned: false, repeat: 'none', subtasks: []
      },
      {
        id: uid(), title: 'Daily stand-up notes', notes: '',
        priority: 'low', category: 'work', due: inDays(0), completed: false, createdAt: Date.now()-50000, order: 5,
        pinned: false, repeat: 'daily', subtasks: []
      },
    ];
  }

  // Normalize any task loaded from storage so new fields always exist
  function normalizeTask(t){
    return {
      pinned: false,
      repeat: 'none',
      subtasks: [],
      ...t,
    };
  }

  function loadCategories(){
    try{
      const raw = localStorage.getItem(CATEGORY_KEY);
      if(!raw) return [...DEFAULT_CATEGORIES];
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_CATEGORIES];
      return parsed;
    }catch(e){
      return [...DEFAULT_CATEGORIES];
    }
  }

  function saveTasks(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
  function saveCategories(){
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories));
  }

  function uid(){
    return 't_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  /* ---------------- DOM refs ---------------- */

  const el = {
    taskList: document.getElementById('taskList'),
    emptyState: document.getElementById('emptyState'),
    emptyTitle: document.getElementById('emptyTitle'),
    emptySub: document.getElementById('emptySub'),
    listTitle: document.getElementById('listTitle'),
    listSub: document.getElementById('listSub'),

    taskForm: document.getElementById('taskForm'),
    taskInput: document.getElementById('taskInput'),
    priorityInput: document.getElementById('priorityInput'),
    categoryInput: document.getElementById('categoryInput'),
    dueInput: document.getElementById('dueInput'),
    repeatInput: document.getElementById('repeatInput'),

    searchInput: document.getElementById('searchInput'),
    sortSelect: document.getElementById('sortSelect'),
    viewToggleBtn: document.getElementById('viewToggleBtn'),

    ringFill: document.getElementById('ringFill'),
    ringPercent: document.getElementById('ringPercent'),
    statTotal: document.getElementById('statTotal'),
    statActive: document.getElementById('statActive'),
    statOverdue: document.getElementById('statOverdue'),

    countAll: document.getElementById('countAll'),
    countActive: document.getElementById('countActive'),
    countCompleted: document.getElementById('countCompleted'),
    countOverdue: document.getElementById('countOverdue'),

    categoryList: document.getElementById('categoryList'),
    addCategoryBtn: document.getElementById('addCategoryBtn'),
    clearCompletedBtn: document.getElementById('clearCompletedBtn'),

    modalOverlay: document.getElementById('modalOverlay'),
    editForm: document.getElementById('editForm'),
    editTitle: document.getElementById('editTitle'),
    editNotes: document.getElementById('editNotes'),
    editPriority: document.getElementById('editPriority'),
    editCategory: document.getElementById('editCategory'),
    editDue: document.getElementById('editDue'),
    editRepeat: document.getElementById('editRepeat'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),

    subtaskProgress: document.getElementById('subtaskProgress'),
    subtaskList: document.getElementById('subtaskList'),
    subtaskInput: document.getElementById('subtaskInput'),
    subtaskAddBtn: document.getElementById('subtaskAddBtn'),

    shortcutsBtn: document.getElementById('shortcutsBtn'),
    shortcutsOverlay: document.getElementById('shortcutsOverlay'),
    shortcutsCloseBtn: document.getElementById('shortcutsCloseBtn'),

    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toastMsg'),
    toastAction: document.getElementById('toastAction'),

    filterBtns: document.querySelectorAll('.filter-btn'),
  };

  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  /* ---------------- Date helpers ---------------- */

  function todayStr(){
    return new Date().toISOString().slice(0,10);
  }

  function dueStatus(due){
    if(!due) return null;
    const today = todayStr();
    if(due < today) return 'overdue';
    if(due === today) return 'today';
    return 'upcoming';
  }

  function formatDue(due){
    if(!due) return '';
    const d = new Date(due + 'T00:00:00');
    const today = new Date(todayStr() + 'T00:00:00');
    const diffDays = Math.round((d - today) / 86400000);
    if(diffDays === 0) return 'Today';
    if(diffDays === 1) return 'Tomorrow';
    if(diffDays === -1) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ---------------- Category helpers ---------------- */

  function getCategory(id){
    return categories.find(c => c.id === id) || categories[0];
  }

  function categoryOptionsHTML(selectedId){
    return categories.map(c =>
      `<option value="${escapeAttr(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${escapeHTML(c.label)}</option>`
    ).join('');
  }

  function refreshCategorySelects(){
    const cur1 = el.categoryInput.value || 'general';
    const cur2 = el.editCategory.value;
    el.categoryInput.innerHTML = categoryOptionsHTML(cur1);
    el.editCategory.innerHTML = categoryOptionsHTML(cur2);
    if(categories.some(c => c.id === cur1)) el.categoryInput.value = cur1;
  }

  function renderCategoryFilters(){
    el.categoryList.innerHTML = categories.map(c => {
      const count = tasks.filter(t => t.category === c.id && !t.completed).length;
      const active = state.categoryFilter === c.id ? 'active' : '';
      return `
        <div class="category-chip ${active}" data-category="${escapeAttr(c.id)}" role="button" tabindex="0">
          <span class="swatch" style="background:${c.color}"></span>
          <span class="label">${escapeHTML(c.label)}</span>
          <span class="count">${count}</span>
        </div>`;
    }).join('');
  }

  /* ---------------- Escaping ---------------- */

  function escapeHTML(str){
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }
  function escapeAttr(str){
    return String(str ?? '').replace(/"/g, '&quot;');
  }

  /* ---------------- Filtering / sorting ---------------- */

  function getVisibleTasks(){
    let list = [...tasks];

    // status
    if(state.statusFilter === 'active') list = list.filter(t => !t.completed);
    else if(state.statusFilter === 'completed') list = list.filter(t => t.completed);
    else if(state.statusFilter === 'overdue') list = list.filter(t => !t.completed && dueStatus(t.due) === 'overdue');

    // priority
    if(state.priorityFilter) list = list.filter(t => t.priority === state.priorityFilter);

    // category
    if(state.categoryFilter) list = list.filter(t => t.category === state.categoryFilter);

    // search
    if(state.search.trim()){
      const q = state.search.trim().toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q))
      );
    }

    // sort
    const priorityRank = { high: 0, medium: 1, low: 2 };
    switch(state.sort){
      case 'due':
        list.sort((a,b) => (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99'));
        break;
      case 'priority':
        list.sort((a,b) => priorityRank[a.priority] - priorityRank[b.priority]);
        break;
      case 'created':
        list.sort((a,b) => b.createdAt - a.createdAt);
        break;
      case 'alpha':
        list.sort((a,b) => a.title.localeCompare(b.title));
        break;
      default:
        list.sort((a,b) => a.order - b.order);
    }

    // pinned tasks always float to the top of their status group
    list.sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return list;
  }

  /* ---------------- Rendering ---------------- */

  function render(){
    renderList();
    renderStats();
    renderCategoryFilters();
    renderFilterCounts();
    refreshCategorySelects();
    updateListHeader();
  }

  function updateListHeader(){
    const titles = { all: 'All Tasks', active: 'Active Tasks', completed: 'Completed Tasks', overdue: 'Overdue Tasks' };
    let title = titles[state.statusFilter] || 'All Tasks';
    if(state.categoryFilter) title = getCategory(state.categoryFilter).label;
    if(state.priorityFilter) title += ` · ${state.priorityFilter[0].toUpperCase()}${state.priorityFilter.slice(1)} priority`;
    el.listTitle.textContent = title;
    el.listSub.textContent = state.sort === 'manual' ? 'Drag the handle to reorder' : `Sorted by ${sortLabel(state.sort)}`;
  }

  function sortLabel(sort){
    return { due: 'due date', priority: 'priority', created: 'date created', alpha: 'title' }[sort] || sort;
  }

  function renderList(){
    const list = getVisibleTasks();
    el.taskList.classList.toggle('compact', state.compact);

    if(list.length === 0){
      el.taskList.innerHTML = '';
      el.emptyState.classList.add('visible');
      if(state.search.trim()){
        el.emptyTitle.textContent = 'No matching tasks';
        el.emptySub.textContent = `Nothing found for "${state.search}"`;
      } else if(state.statusFilter === 'completed'){
        el.emptyTitle.textContent = 'No completed tasks';
        el.emptySub.textContent = 'Finished tasks will show up here.';
      } else if(state.statusFilter === 'overdue'){
        el.emptyTitle.textContent = "You're all caught up";
        el.emptySub.textContent = 'No overdue tasks — nice work.';
      } else {
        el.emptyTitle.textContent = 'Nothing here yet';
        el.emptySub.textContent = 'Add your first task above to get started.';
      }
      return;
    }

    el.emptyState.classList.remove('visible');

    el.taskList.innerHTML = list.map(t => taskItemHTML(t)).join('');
  }

  function taskItemHTML(t){
    const cat = getCategory(t.category);
    const ds = t.completed ? null : dueStatus(t.due);
    const dueBadge = t.due ? `
      <span class="meta-badge ${ds ? 'due-' + ds : ''}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        ${formatDue(t.due)}
      </span>` : '';

    const repeatBadge = t.repeat && t.repeat !== 'none' ? `
      <span class="meta-badge repeat-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${t.repeat[0].toUpperCase()}${t.repeat.slice(1)}
      </span>` : '';

    const subtasks = t.subtasks || [];
    const doneCount = subtasks.filter(s => s.completed).length;
    const pct = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : 0;
    const expanded = state.expandedIds.has(t.id);

    const subtaskToggle = subtasks.length ? `
      <button class="subtask-toggle" data-action="toggle-subtasks" type="button" aria-expanded="${expanded}">
        <span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span>
        ${doneCount}/${subtasks.length}
      </button>` : `
      <button class="subtask-toggle" data-action="toggle-subtasks" type="button" aria-expanded="${expanded}">+ subtask</button>`;

    const subtaskPanel = expanded ? `
      <div class="subtask-panel">
        ${subtasks.map(s => `
          <div class="subtask-row ${s.completed ? 'done' : ''}" data-subtask-id="${s.id}">
            <button class="subtask-check" data-action="toggle-subtask" aria-label="Toggle subtask">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="subtask-row-title">${escapeHTML(s.title)}</span>
            <button class="subtask-row-delete" data-action="delete-subtask" aria-label="Delete subtask">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            </button>
          </div>`).join('')}
        <div class="subtask-quick-add">
          <input type="text" data-role="quick-subtask-input" placeholder="Add a subtask…" autocomplete="off">
          <button type="button" data-action="quick-add-subtask">Add</button>
        </div>
      </div>` : '';

    return `
      <li class="task-item ${t.completed ? 'completed' : ''} ${t.pinned ? 'pinned' : ''}" data-id="${t.id}" draggable="true">
        <span class="drag-handle" title="Drag to reorder" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="6" r="1.6" fill="currentColor"/><circle cx="8" cy="12" r="1.6" fill="currentColor"/><circle cx="8" cy="18" r="1.6" fill="currentColor"/><circle cx="16" cy="6" r="1.6" fill="currentColor"/><circle cx="16" cy="12" r="1.6" fill="currentColor"/><circle cx="16" cy="18" r="1.6" fill="currentColor"/></svg>
        </span>

        <button class="check" data-action="toggle" aria-label="Mark task complete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>

        <div class="task-main">
          <div class="task-title-row">
            <span class="priority-flag dot-${t.priority}" title="${t.priority} priority"></span>
            ${t.pinned ? `<span class="pin-flag" title="Pinned"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.5 5.5L19 9l-4.5 3 1 6-3.5-3-3.5 3 1-6L5 9l5.5-1.5L12 2z"/></svg></span>` : ''}
            <span class="task-title">${escapeHTML(t.title)}</span>
          </div>
          ${t.notes ? `<div class="task-notes">${escapeHTML(t.notes)}</div>` : ''}
          <div class="task-meta">
            <span class="meta-badge" style="color:${cat.color}; border-color:${cat.color}33; background:${cat.color}14;">${escapeHTML(cat.label)}</span>
            ${dueBadge}
            ${repeatBadge}
            ${subtaskToggle}
          </div>
          ${subtaskPanel}
        </div>

        <div class="task-actions">
          <button data-action="pin" class="pin-btn ${t.pinned ? 'pinned' : ''}" title="${t.pinned ? 'Unpin task' : 'Pin task'}" aria-label="Pin task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${t.pinned ? 'currentColor' : 'none'}"><path d="M12 2l1.5 5.5L19 9l-4.5 3 1 6-3.5-3-3.5 3 1-6L5 9l5.5-1.5L12 2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
          </button>
          <button data-action="edit" title="Edit task" aria-label="Edit task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </button>
          <button data-action="delete" class="delete-btn" title="Delete task" aria-label="Delete task">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </li>`;
  }

  function renderStats(){
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const active = total - completed;
    const overdue = tasks.filter(t => !t.completed && dueStatus(t.due) === 'overdue').length;
    const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

    el.statTotal.textContent = total;
    el.statActive.textContent = active;
    el.statOverdue.textContent = overdue;
    el.ringPercent.textContent = pct + '%';

    const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
    el.ringFill.style.strokeDashoffset = offset;
    el.ringFill.style.stroke = pct === 100 && total > 0 ? 'var(--success)' : 'var(--primary)';
  }

  function renderFilterCounts(){
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const active = total - completed;
    const overdue = tasks.filter(t => !t.completed && dueStatus(t.due) === 'overdue').length;
    el.countAll.textContent = total;
    el.countActive.textContent = active;
    el.countCompleted.textContent = completed;
    el.countOverdue.textContent = overdue;
  }

  /* ---------------- Toast ---------------- */

  let toastTimer = null;
  function showToast(msg, opts){
    el.toastMsg.textContent = msg;
    clearTimeout(toastTimer);

    if(opts && opts.label && opts.onAction){
      el.toastAction.textContent = opts.label;
      el.toastAction.hidden = false;
      el.toastAction.onclick = () => {
        opts.onAction();
        el.toast.classList.remove('visible');
      };
      // Longer window when there's an undo action to click
      toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 5000);
    } else {
      el.toastAction.hidden = true;
      el.toastAction.onclick = null;
      toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 2400);
    }

    el.toast.classList.add('visible');
  }

  /* ---------------- CRUD ---------------- */

  function addTask(title, priority, category, due, repeat){
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order ?? 0), -1);
    tasks.push({
      id: uid(),
      title: title.trim(),
      notes: '',
      priority,
      category,
      due: due || null,
      completed: false,
      createdAt: Date.now(),
      order: maxOrder + 1,
      pinned: false,
      repeat: repeat || 'none',
      subtasks: [],
    });
    saveTasks();
    render();
    showToast('Task added');
  }

  function nextDueDate(dueStr, repeat){
    const d = new Date(dueStr + 'T00:00:00');
    if(repeat === 'daily') d.setDate(d.getDate() + 1);
    else if(repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if(repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0,10);
  }

  function toggleTask(id){
    const t = tasks.find(t => t.id === id);
    if(!t) return;
    const wasCompleted = t.completed;
    t.completed = !t.completed;

    // Spawn the next occurrence when a recurring task is completed
    if(!wasCompleted && t.completed && t.repeat && t.repeat !== 'none'){
      const maxOrder = tasks.reduce((m, x) => Math.max(m, x.order ?? 0), -1);
      tasks.push({
        id: uid(),
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        category: t.category,
        due: t.due ? nextDueDate(t.due, t.repeat) : null,
        completed: false,
        createdAt: Date.now(),
        order: maxOrder + 1,
        pinned: false,
        repeat: t.repeat,
        subtasks: (t.subtasks || []).map(s => ({ id: uid(), title: s.title, completed: false })),
      });
      showToast('Task completed — next occurrence scheduled');
    }

    saveTasks();
    render();
  }

  function togglePin(id){
    const t = tasks.find(t => t.id === id);
    if(!t) return;
    t.pinned = !t.pinned;
    saveTasks();
    render();
    showToast(t.pinned ? 'Task pinned' : 'Task unpinned');
  }

  function deleteTask(id){
    const idx = tasks.findIndex(t => t.id === id);
    if(idx === -1) return;
    lastDeleted = { task: tasks[idx] };
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
    showToast('Task deleted', { label: 'Undo', onAction: undoDelete });
  }

  function undoDelete(){
    if(!lastDeleted) return;
    tasks.push(lastDeleted.task);
    lastDeleted = null;
    saveTasks();
    render();
    showToast('Task restored');
  }

  function updateTask(id, updates){
    const t = tasks.find(t => t.id === id);
    if(!t) return;
    Object.assign(t, updates);
    saveTasks();
    render();
    showToast('Task updated');
  }

  function addSubtask(taskId, title){
    const t = tasks.find(t => t.id === taskId);
    if(!t || !title.trim()) return;
    t.subtasks = t.subtasks || [];
    t.subtasks.push({ id: uid(), title: title.trim(), completed: false });
    saveTasks();
  }

  function toggleSubtask(taskId, subtaskId){
    const t = tasks.find(t => t.id === taskId);
    if(!t) return;
    const s = (t.subtasks || []).find(s => s.id === subtaskId);
    if(!s) return;
    s.completed = !s.completed;
    saveTasks();
  }

  function deleteSubtask(taskId, subtaskId){
    const t = tasks.find(t => t.id === taskId);
    if(!t) return;
    t.subtasks = (t.subtasks || []).filter(s => s.id !== subtaskId);
    saveTasks();
  }

  function clearCompleted(){
    const count = tasks.filter(t => t.completed).length;
    if(count === 0){ showToast('No completed tasks to clear'); return; }
    tasks = tasks.filter(t => !t.completed);
    saveTasks();
    render();
    showToast(`Cleared ${count} completed task${count > 1 ? 's' : ''}`);
  }

  /* ---------------- Modal ---------------- */

  function openEditModal(id){
    const t = tasks.find(t => t.id === id);
    if(!t) return;
    state.editingId = id;
    el.editTitle.value = t.title;
    el.editNotes.value = t.notes || '';
    el.editPriority.value = t.priority;
    refreshCategorySelects();
    el.editCategory.value = t.category;
    el.editDue.value = t.due || '';
    el.editRepeat.value = t.repeat || 'none';
    renderEditSubtasks();
    el.modalOverlay.classList.add('visible');
    setTimeout(() => el.editTitle.focus(), 50);
  }

  function renderEditSubtasks(){
    const t = tasks.find(t => t.id === state.editingId);
    if(!t){ el.subtaskList.innerHTML = ''; el.subtaskProgress.textContent = ''; return; }
    const subtasks = t.subtasks || [];
    const doneCount = subtasks.filter(s => s.completed).length;
    el.subtaskProgress.textContent = subtasks.length ? `${doneCount}/${subtasks.length} done` : '';

    if(subtasks.length === 0){
      el.subtaskList.innerHTML = `<li class="subtask-empty-hint">No subtasks yet — break this task down below.</li>`;
      return;
    }

    el.subtaskList.innerHTML = subtasks.map(s => `
      <li class="subtask-row ${s.completed ? 'done' : ''}" data-subtask-id="${s.id}">
        <button type="button" class="subtask-check" data-action="edit-toggle-subtask" aria-label="Toggle subtask">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="subtask-row-title">${escapeHTML(s.title)}</span>
        <button type="button" class="subtask-row-delete" data-action="edit-delete-subtask" aria-label="Delete subtask">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </li>`).join('');
  }

  function closeEditModal(){
    el.modalOverlay.classList.remove('visible');
    state.editingId = null;
  }

  /* ---------------- Drag & drop reorder ---------------- */

  let dragId = null;

  function handleDragStart(e){
    const li = e.target.closest('.task-item');
    if(!li) return;
    dragId = li.dataset.id;
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(e){
    const li = e.target.closest('.task-item');
    if(li) li.classList.remove('dragging');
    document.querySelectorAll('.task-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    dragId = null;
  }

  function handleDragOver(e){
    e.preventDefault();
    const li = e.target.closest('.task-item');
    if(!li || li.dataset.id === dragId) return;
    document.querySelectorAll('.task-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    li.classList.add('drag-over');
  }

  function handleDrop(e){
    e.preventDefault();
    const li = e.target.closest('.task-item');
    if(!li || !dragId || li.dataset.id === dragId) return;
    const targetId = li.dataset.id;

    const dragTask = tasks.find(t => t.id === dragId);
    const targetTask = tasks.find(t => t.id === targetId);
    if(!dragTask || !targetTask) return;

    // Reassign order based on visible list order
    const visible = getVisibleTasks();
    const dragIdx = visible.findIndex(t => t.id === dragId);
    const targetIdx = visible.findIndex(t => t.id === targetId);
    if(dragIdx === -1 || targetIdx === -1) return;

    visible.splice(dragIdx, 1);
    visible.splice(targetIdx, 0, dragTask);

    visible.forEach((t, i) => { t.order = i; });

    state.sort = 'manual';
    el.sortSelect.value = 'manual';
    saveTasks();
    render();
  }

  /* ---------------- Event wiring ---------------- */

  el.taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = el.taskInput.value.trim();
    if(!title) return;
    addTask(title, el.priorityInput.value, el.categoryInput.value, el.dueInput.value, el.repeatInput.value);
    el.taskInput.value = '';
    el.dueInput.value = '';
    el.priorityInput.value = 'medium';
    el.repeatInput.value = 'none';
    el.taskInput.focus();
  });

  el.taskList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const li = e.target.closest('.task-item');
    const id = li?.dataset.id;
    if(!id) return;

    const action = btn.dataset.action;

    if(action === 'toggle') toggleTask(id);
    else if(action === 'delete') deleteTask(id);
    else if(action === 'edit') openEditModal(id);
    else if(action === 'pin') togglePin(id);
    else if(action === 'toggle-subtasks'){
      if(state.expandedIds.has(id)) state.expandedIds.delete(id);
      else state.expandedIds.add(id);
      renderList();
    }
    else if(action === 'toggle-subtask'){
      const subId = e.target.closest('[data-subtask-id]')?.dataset.subtaskId;
      if(subId){ toggleSubtask(id, subId); renderList(); renderStats(); renderFilterCounts(); }
    }
    else if(action === 'delete-subtask'){
      const subId = e.target.closest('[data-subtask-id]')?.dataset.subtaskId;
      if(subId){ deleteSubtask(id, subId); renderList(); }
    }
    else if(action === 'quick-add-subtask'){
      const input = li.querySelector('[data-role="quick-subtask-input"]');
      if(input && input.value.trim()){
        addSubtask(id, input.value);
        renderList();
        refocusSubtaskInput(id);
      }
    }
  });

  el.taskList.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter') return;
    const input = e.target.closest('[data-role="quick-subtask-input"]');
    if(!input) return;
    e.preventDefault();
    const li = e.target.closest('.task-item');
    const id = li?.dataset.id;
    if(id && input.value.trim()){
      addSubtask(id, input.value);
      renderList();
      refocusSubtaskInput(id);
    }
  });

  function refocusSubtaskInput(taskId){
    requestAnimationFrame(() => {
      const li = el.taskList.querySelector(`.task-item[data-id="${taskId}"]`);
      const input = li?.querySelector('[data-role="quick-subtask-input"]');
      if(input) input.focus();
    });
  }

  el.taskList.addEventListener('dragstart', handleDragStart);
  el.taskList.addEventListener('dragend', handleDragEnd);
  el.taskList.addEventListener('dragover', handleDragOver);
  el.taskList.addEventListener('drop', handleDrop);

  el.searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderList();
    updateListHeader();
  });

  el.sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderList();
    updateListHeader();
  });

  el.viewToggleBtn.addEventListener('click', () => {
    state.compact = !state.compact;
    el.viewToggleBtn.classList.toggle('is-active', state.compact);
    renderList();
  });

  el.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filterType;
      const val = btn.dataset.filter;

      if(type === 'status'){
        state.statusFilter = val;
        document.querySelectorAll('[data-filter-type="status"]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      } else if(type === 'priority'){
        const isActive = state.priorityFilter === val;
        state.priorityFilter = isActive ? null : val;
        document.querySelectorAll('[data-filter-type="priority"]').forEach(b => b.classList.remove('active'));
        if(!isActive) btn.classList.add('active');
      }
      render();
    });
  });

  el.categoryList.addEventListener('click', (e) => {
    const chip = e.target.closest('.category-chip');
    if(!chip) return;
    const id = chip.dataset.category;
    state.categoryFilter = state.categoryFilter === id ? null : id;
    render();
  });

  el.categoryList.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const chip = e.target.closest('.category-chip');
    if(!chip) return;
    e.preventDefault();
    chip.click();
  });

  el.addCategoryBtn.addEventListener('click', () => {
    const label = prompt('New category name:');
    if(!label || !label.trim()) return;
    const palette = ['#2C6FB0', '#7FB0DE', '#3FA66B', '#D79439', '#D9584F', '#8A97A8', '#5B8FC0'];
    const color = palette[categories.length % palette.length];
    const id = 'cat_' + Math.random().toString(36).slice(2, 8);
    categories.push({ id, label: label.trim(), color });
    saveCategories();
    render();
    showToast('Category added');
  });

  el.clearCompletedBtn.addEventListener('click', clearCompleted);

  el.modalCancelBtn.addEventListener('click', closeEditModal);
  el.modalOverlay.addEventListener('click', (e) => {
    if(e.target === el.modalOverlay) closeEditModal();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key !== 'Escape') return;
    if(el.modalOverlay.classList.contains('visible')) closeEditModal();
    if(el.shortcutsOverlay.classList.contains('visible')) el.shortcutsOverlay.classList.remove('visible');
  });

  el.editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if(!state.editingId) return;
    updateTask(state.editingId, {
      title: el.editTitle.value.trim(),
      notes: el.editNotes.value.trim(),
      priority: el.editPriority.value,
      category: el.editCategory.value,
      due: el.editDue.value || null,
      repeat: el.editRepeat.value,
    });
    closeEditModal();
  });

  function submitModalSubtask(){
    const title = el.subtaskInput.value.trim();
    if(!title || !state.editingId) return;
    addSubtask(state.editingId, title);
    el.subtaskInput.value = '';
    renderEditSubtasks();
    el.subtaskInput.focus();
  }

  el.subtaskAddBtn.addEventListener('click', submitModalSubtask);
  el.subtaskInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){ e.preventDefault(); submitModalSubtask(); }
  });

  el.subtaskList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if(!btn || !state.editingId) return;
    const row = e.target.closest('[data-subtask-id]');
    const subId = row?.dataset.subtaskId;
    if(!subId) return;

    if(btn.dataset.action === 'edit-toggle-subtask'){
      toggleSubtask(state.editingId, subId);
      renderEditSubtasks();
    } else if(btn.dataset.action === 'edit-delete-subtask'){
      deleteSubtask(state.editingId, subId);
      renderEditSubtasks();
    }
  });

  /* ---------------- Shortcuts modal ---------------- */

  el.shortcutsBtn.addEventListener('click', () => el.shortcutsOverlay.classList.add('visible'));
  el.shortcutsCloseBtn.addEventListener('click', () => el.shortcutsOverlay.classList.remove('visible'));
  el.shortcutsOverlay.addEventListener('click', (e) => {
    if(e.target === el.shortcutsOverlay) el.shortcutsOverlay.classList.remove('visible');
  });

  /* ---------------- Global keyboard shortcuts ---------------- */

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    // Undo delete: Ctrl/Cmd+Z, works even while typing elsewhere
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'){
      if(lastDeleted){
        e.preventDefault();
        undoDelete();
      }
      return;
    }

    if(isTyping) return;

    if(e.key === '/'){
      e.preventDefault();
      el.searchInput.focus();
    } else if(e.key.toLowerCase() === 'n'){
      e.preventDefault();
      el.taskInput.focus();
    } else if(e.key === '?'){
      e.preventDefault();
      el.shortcutsOverlay.classList.add('visible');
    }
  });

  /* ---------------- Init ---------------- */

  function init(){
    refreshCategorySelects();
    render();
    // Refresh due-date statuses at midnight-ish intervals
    setInterval(() => { renderList(); renderStats(); renderFilterCounts(); }, 60 * 1000);
  }

  init();
})();
