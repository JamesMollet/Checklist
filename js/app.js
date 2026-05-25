const STORAGE_KEY = "checklist-data";

const state = loadState();

function loadState() {
  const today = dateKey(new Date());
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      return {
        currentDay: data.currentDay || today,
        viewYear: data.viewYear ?? new Date(data.currentDay || today).getFullYear(),
        viewMonth: data.viewMonth ?? new Date(data.currentDay || today).getMonth(),
        everyday: data.everyday || [],
        dayTasks: data.dayTasks || {},
        done: data.done || {}
      };
    }
  } catch (_) { /* ignore */ }
  const now = new Date();
  return {
    currentDay: today,
    viewYear: now.getFullYear(),
    viewMonth: now.getMonth(),
    everyday: [],
    dayTasks: {},
    done: {}
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    currentDay: state.currentDay,
    viewYear: state.viewYear,
    viewMonth: state.viewMonth,
    everyday: state.everyday,
    dayTasks: state.dayTasks,
    done: state.done
  }));
}

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayKey() {
  return dateKey(new Date());
}

/** Negative = past, 0 = today, positive = future */
function dayOffset(key) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = parseKey(key);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function uid() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function tasksForDay(key) {
  const daily = (state.dayTasks[key] || []).map(t => ({ ...t, scope: "day" }));
  const every = state.everyday.map(t => ({ ...t, scope: "everyday" }));
  return [...every, ...daily];
}

function ensureDone(key) {
  if (!state.done[key]) state.done[key] = {};
  return state.done[key];
}

function dayStatus(key) {
  const tasks = tasksForDay(key);
  if (!tasks.length) return "empty";
  const done = state.done[key] || {};
  const n = tasks.filter(t => done[t.id]).length;
  if (n === tasks.length) return "complete";
  if (n > 0) return "partial";
  return "pending";
}

const dayColors = {
  complete: { fill: "#22c55e", text: "#fff" },
  partial:  { fill: "#facc15", text: "#713f12" },
  pending:  { fill: "#ef4444", text: "#fff" }
};

const pastStyle = { fill: "#f1f5f9", text: "#94a3b8" };
const futureStyle = { fill: "#fff", text: "#cbd5e1" };

function cellColors(key) {
  const off = dayOffset(key);
  if (off > 0) return futureStyle;
  if (off < 0) return pastStyle;
  const status = dayStatus(key);
  if (dayColors[status]) return dayColors[status];
  return { fill: "#dbeafe", text: "#334155" };
}

function setSelected(key) {
  state.currentDay = key;
  saveState();
  renderCalendar();
  renderTasks();
}

function toggleTask(key, taskId, checked) {
  ensureDone(key)[taskId] = checked;
  saveState();
  renderCalendar();
  renderTasks();
}

// ── D3 calendar ──
const cellSize = 44;
const calPadding = { top: 28, left: 8, right: 8, bottom: 8 };
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function renderCalendar() {
  const year = state.viewYear;
  const month = state.viewMonth;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();

  const cells = [];
  for (let i = 0; i < startPad; i++) {
    const d = new Date(year, month, -startPad + i + 1);
    cells.push({ date: d, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  let trail = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, trail++), inMonth: false });
  }

  const cols = 7;
  const rows = cells.length / 7;
  const width = cols * cellSize + calPadding.left + calPadding.right;
  const height = rows * cellSize + calPadding.top + calPadding.bottom;

  d3.select("#month-label").text(
    d3.timeFormat("%B %Y")(new Date(year, month, 1))
  );

  const root = d3.select("#calendar");
  let svg = root.select("svg");
  if (svg.empty()) svg = root.append("svg");
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const g = svg.selectAll("g.cal-root").data([null]).join("g")
    .attr("class", "cal-root")
    .attr("transform", `translate(${calPadding.left},${calPadding.top})`);

  g.selectAll("text.day-label")
    .data(weekdays)
    .join("text")
    .attr("class", "day-label")
    .attr("x", (_, i) => i * cellSize + cellSize / 2)
    .attr("y", -8)
    .attr("text-anchor", "middle")
    .text(d => d);

  const today = todayKey();
  const dayG = g.selectAll("g.day-cell")
    .data(cells, d => dateKey(d.date))
    .join(
      enter => enter.append("g").attr("class", "day-cell"),
      update => update,
      exit => exit.remove()
    )
    .attr("transform", (_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return `translate(${col * cellSize},${row * cellSize})`;
    })
    .attr("class", d => {
      const key = dateKey(d.date);
      const off = dayOffset(key);
      let cls = "day-cell";
      if (!d.inMonth) cls += " other-month";
      if (key === state.currentDay) cls += " selected";
      if (off > 0) cls += " future";
      else if (off < 0) cls += " past";
      else {
        cls += " today";
        const status = dayStatus(key);
        if (status !== "empty") cls += " " + status;
      }
      return cls;
    })
    .on("click", (_, d) => setSelected(dateKey(d.date)));

  dayG.selectAll("rect").data(d => [d]).join("rect")
    .attr("width", cellSize - 4)
    .attr("height", cellSize - 4)
    .attr("x", 2)
    .attr("y", 2)
    .attr("rx", 6)
    .attr("fill", d => cellColors(dateKey(d.date)).fill);

  dayG.selectAll("text.day-num").data(d => [d]).join("text")
    .attr("class", "day-num")
    .attr("x", cellSize / 2)
    .attr("y", cellSize / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("fill", d => cellColors(dateKey(d.date)).text)
    .text(d => d.date.getDate());
}

// ── Task lists ──
function renderTaskList(containerId, tasks, dayKey) {
  const ul = document.getElementById(containerId);
  ul.innerHTML = "";
  const done = state.done[dayKey] || {};

  tasks.forEach(task => {
    const li = document.createElement("li");
    li.className = "task-item" + (done[task.id] ? " done" : "");
    const id = `cb-${dayKey}-${task.id}`;
    li.innerHTML = `
      <input type="checkbox" id="${id}" ${done[task.id] ? "checked" : ""}>
      <label for="${id}">${escapeHtml(task.text)}</label>
      <button type="button" class="delete" aria-label="Delete task">&times;</button>
    `;
    li.querySelector("input").addEventListener("change", e => {
      toggleTask(dayKey, task.id, e.target.checked);
    });
    li.querySelector(".delete").addEventListener("click", () => {
      if (task.scope === "everyday") {
        state.everyday = state.everyday.filter(t => t.id !== task.id);
        Object.keys(state.done).forEach(k => delete state.done[k][task.id]);
      } else {
        state.dayTasks[dayKey] = (state.dayTasks[dayKey] || []).filter(t => t.id !== task.id);
        delete (state.done[dayKey] || {})[task.id];
      }
      saveState();
      renderCalendar();
      renderTasks();
    });
    ul.appendChild(li);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderTasks() {
  const key = state.currentDay;
  const d = parseKey(key);
  document.getElementById("selected-label").textContent =
    "Working on: " + d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  document.getElementById("day-tasks-title").textContent =
    "This day only — " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (!state.dayTasks[key]) state.dayTasks[key] = [];

  renderTaskList(
    "everyday-list",
    state.everyday.map(t => ({ ...t, scope: "everyday" })),
    key
  );
  renderTaskList(
    "day-list",
    state.dayTasks[key].map(t => ({ ...t, scope: "day" })),
    key
  );
}

// ── Forms & nav ──
document.getElementById("form-everyday").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("input-everyday");
  const text = input.value.trim();
  if (!text) return;
  state.everyday.push({ id: uid(), text });
  input.value = "";
  saveState();
  renderCalendar();
  renderTasks();
});

document.getElementById("form-day").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("input-day");
  const text = input.value.trim();
  if (!text) return;
  const key = state.currentDay;
  if (!state.dayTasks[key]) state.dayTasks[key] = [];
  state.dayTasks[key].push({ id: uid(), text });
  input.value = "";
  saveState();
  renderCalendar();
  renderTasks();
});

document.getElementById("btn-prev").addEventListener("click", () => {
  if (state.viewMonth === 0) {
    state.viewMonth = 11;
    state.viewYear--;
  } else state.viewMonth--;
  saveState();
  renderCalendar();
});

document.getElementById("btn-next").addEventListener("click", () => {
  if (state.viewMonth === 11) {
    state.viewMonth = 0;
    state.viewYear++;
  } else state.viewMonth++;
  saveState();
  renderCalendar();
});

document.getElementById("btn-today").addEventListener("click", () => {
  const now = new Date();
  state.viewYear = now.getFullYear();
  state.viewMonth = now.getMonth();
  setSelected(dateKey(now));
});

renderCalendar();
renderTasks();
