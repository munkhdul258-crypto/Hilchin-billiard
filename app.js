// Нүүр хуудас: ширээнүүдийн жагсаалт, цаг тооцоолол (start/stop),
// realtime синк.

const HB_App = {
  tables: [],
  activeSessions: {}, // table_id -> session row
  tickInterval: null,

  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("tables");

    if (ctx.profile && ctx.profile.role === "admin") {
      document.getElementById("hb-add-table-wrap").classList.remove("hidden");
      document
        .getElementById("hb-add-table-form")
        .addEventListener("submit", (e) => this.handleAddTable(e));
    }

    await this.loadTables();
    this.subscribeRealtime();

    this.tickInterval = setInterval(() => this.renderTimers(), 1000);
  },

  async loadTables() {
    const { data: tables, error } = await window.supabaseClient
      .from("billiard_tables")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      this.showError("Ширээнүүдийг ачаалахад алдаа гарлаа: " + error.message);
      return;
    }
    this.tables = tables || [];

    const { data: sessions, error: sErr } = await window.supabaseClient
      .from("sessions")
      .select("*")
      .eq("status", "active");

    if (sErr) {
      this.showError("Идэвхтэй session ачаалахад алдаа гарлаа: " + sErr.message);
    } else {
      this.activeSessions = {};
      (sessions || []).forEach((s) => {
        this.activeSessions[s.table_id] = s;
      });
    }

    this.render();
  },

  subscribeRealtime() {
    window.supabaseClient
      .channel("hb-tables-and-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "billiard_tables" },
        () => this.loadTables()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sessions" },
        () => this.loadTables()
      )
      .subscribe();
  },

  render() {
    const grid = document.getElementById("hb-tables-grid");
    if (!grid) return;

    if (this.tables.length === 0) {
      grid.innerHTML = `<p class="muted">Ширээ бүртгэгдээгүй байна.</p>`;
      return;
    }

    grid.innerHTML = this.tables
      .map((t) => {
        const session = this.activeSessions[t.id];
        const occupied = t.status === "occupied" && session;
        return `
          <div class="table-card ${occupied ? "occupied" : "available"}" data-table-id="${t.id}">
            <div class="table-card-head">
              <h3>${t.name}</h3>
              <span class="badge ${occupied ? "badge-occupied" : "badge-available"}">
                ${occupied ? "Эзэлсэн" : "Сул"}
              </span>
            </div>
            <div class="table-card-rate">${this.formatMoney(t.hourly_rate)} / цаг</div>
            ${
              occupied
                ? `<div class="table-timer" data-started="${session.started_at}" data-rate="${session.hourly_rate}">
                     <div class="timer-time">00:00:00</div>
                     <div class="timer-amount">0₮</div>
                   </div>
                   <button class="btn btn-danger" data-action="stop" data-session-id="${session.id}" data-table-id="${t.id}">
                     Дуусгах
                   </button>`
                : `<button class="btn btn-primary" data-action="start" data-table-id="${t.id}" data-rate="${t.hourly_rate}">
                     Эхлүүлэх
                   </button>`
            }
          </div>
        `;
      })
      .join("");

    grid.querySelectorAll('[data-action="start"]').forEach((btn) => {
      btn.addEventListener("click", () => this.startSession(btn.dataset.tableId, btn.dataset.rate));
    });
    grid.querySelectorAll('[data-action="stop"]').forEach((btn) => {
      btn.addEventListener("click", () =>
        this.stopSession(btn.dataset.sessionId, btn.dataset.tableId)
      );
    });

    this.renderTimers();
  },

  renderTimers() {
    document.querySelectorAll(".table-timer").forEach((el) => {
      const started = new Date(el.dataset.started).getTime();
      const rate = parseFloat(el.dataset.rate);
      const elapsedMs = Date.now() - started;
      const elapsedHours = elapsedMs / 1000 / 60 / 60;
      const amount = Math.max(0, elapsedHours * rate);

      el.querySelector(".timer-time").textContent = this.formatDuration(elapsedMs);
      el.querySelector(".timer-amount").textContent = this.formatMoney(amount);
    });
  },

  async startSession(tableId, rate) {
    const { error } = await window.supabaseClient.from("sessions").insert({
      table_id: tableId,
      staff_id: HB_Auth.currentUser.id,
      hourly_rate: rate,
      status: "active",
    });
    if (error) {
      this.showError("Session эхлүүлэхэд алдаа гарлаа: " + error.message);
      return;
    }
    await window.supabaseClient
      .from("billiard_tables")
      .update({ status: "occupied" })
      .eq("id", tableId);
    await this.loadTables();
  },

  async stopSession(sessionId, tableId) {
    const session = this.activeSessions[tableId];
    if (!session) return;

    const startedAt = new Date(session.started_at).getTime();
    const endedAt = Date.now();
    const hours = (endedAt - startedAt) / 1000 / 60 / 60;
    const total = Math.round(hours * session.hourly_rate);

    const { error } = await window.supabaseClient
      .from("sessions")
      .update({
        ended_at: new Date(endedAt).toISOString(),
        total_amount: total,
        status: "completed",
      })
      .eq("id", sessionId);

    if (error) {
      this.showError("Session дуусгахад алдаа гарлаа: " + error.message);
      return;
    }

    await window.supabaseClient
      .from("billiard_tables")
      .update({ status: "available" })
      .eq("id", tableId);

    await this.loadTables();
  },

  async handleAddTable(e) {
    e.preventDefault();
    const name = document.getElementById("hb-new-table-name").value.trim();
    const rate = parseFloat(document.getElementById("hb-new-table-rate").value);
    if (!name || !rate) return;

    const { error } = await window.supabaseClient
      .from("billiard_tables")
      .insert({ name, hourly_rate: rate });

    if (error) {
      this.showError("Ширээ нэмэхэд алдаа гарлаа: " + error.message);
      return;
    }
    document.getElementById("hb-add-table-form").reset();
    await this.loadTables();
  },

  formatDuration(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  },

  formatMoney(n) {
    return Math.round(n).toLocaleString("mn-MN") + "₮";
  },

  showError(msg) {
    const el = document.getElementById("hb-error");
    if (!el) return alert(msg);
    el.textContent = msg;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 5000);
  },
};

document.addEventListener("DOMContentLoaded", () => HB_App.init());
