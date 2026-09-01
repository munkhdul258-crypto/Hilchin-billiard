// Нүүр хуудас: ширээнүүдийн жагсаалт, цаг тооцоолол (start/stop),
// ширээн дээр бараа нэмэх, realtime синк.

const HB_App = {
  tables: [],
  activeSessions: {}, // table_id -> session row
  sessionItems: {}, // session_id -> [items]
  products: [],
  tickInterval: null,

  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("tables");

    this.isAdmin = !!(ctx.profile && ctx.profile.role === "admin");

    if (this.isAdmin) {
      document.getElementById("hb-add-table-wrap").classList.remove("hidden");
      document
        .getElementById("hb-add-table-form")
        .addEventListener("submit", (e) => this.handleAddTable(e));
    }

    const overlay = document.getElementById("hb-modal-overlay");
    const closeBtn = document.getElementById("hb-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModal();
      });
    }

    await this.loadProducts();
    await this.loadTables();
    this.subscribeRealtime();

    this.tickInterval = setInterval(() => this.renderTimers(), 1000);
  },

  async loadProducts() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .order("name", { ascending: true });
    if (!error) this.products = data || [];
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

    const activeIds = Object.values(this.activeSessions).map((s) => s.id);
    this.sessionItems = {};
    if (activeIds.length) {
      const { data: items } = await window.supabaseClient
        .from("session_items")
        .select("*")
        .in("session_id", activeIds);
      (items || []).forEach((it) => {
        if (!this.sessionItems[it.session_id]) this.sessionItems[it.session_id] = [];
        this.sessionItems[it.session_id].push(it);
      });
    }

    this.render();
  },

  subscribeRealtime() {
    window.supabaseClient
      .channel("hb-tables-and-sessions")
      .on("postgres_changes", { event: "*", schema: "public", table: "billiard_tables" }, () => this.loadTables())
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => this.loadTables())
      .on("postgres_changes", { event: "*", schema: "public", table: "session_items" }, () => this.loadTables())
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => this.loadProducts())
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
        if (!occupied) return this.renderAvailableCard(t);
        return this.renderOccupiedCard(t, session);
      })
      .join("");

    grid.querySelectorAll('[data-action="start"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const tableId = btn.dataset.tableId;
        const rate = btn.dataset.rate;
        const hoursInput = document.getElementById(`hb-hours-${tableId}`);
        const hours = hoursInput && hoursInput.value ? parseFloat(hoursInput.value) : null;
        this.startSession(tableId, rate, hours);
      });
    });
    grid.querySelectorAll('[data-action="open-add-item"]').forEach((btn) => {
      btn.addEventListener("click", () => this.openAddItemModal(btn.dataset.tableId, btn.dataset.sessionId));
    });
    grid.querySelectorAll('[data-action="open-close"]').forEach((btn) => {
      btn.addEventListener("click", () => this.openCloseModal(btn.dataset.tableId, btn.dataset.sessionId));
    });
    grid.querySelectorAll('[data-action="remove-item"]').forEach((btn) => {
      btn.addEventListener("click", () =>
        this.removeItem(btn.dataset.itemId, btn.dataset.tableId)
      );
    });
    grid.querySelectorAll('[data-action="delete-table"]').forEach((btn) => {
      btn.addEventListener("click", () => this.deleteTable(btn.dataset.tableId, btn.dataset.tableName));
    });

    this.renderTimers();
  },

  renderAvailableCard(t) {
    return `
      <div class="table-card available" data-table-id="${t.id}">
        <div class="table-card-head">
          <h3>${t.name}</h3>
          <span class="badge badge-available">Сул</span>
        </div>
        <div class="table-card-rate">${this.formatMoney(t.hourly_rate)} / цаг</div>
        <div class="form-group">
          <label>Захиалсан цаг (заавал биш)</label>
          <input type="number" min="0" step="0.5" id="hb-hours-${t.id}" placeholder="жишээ: 2" />
        </div>
        <button class="btn btn-primary" data-action="start" data-table-id="${t.id}" data-rate="${t.hourly_rate}">
          Эхлүүлэх
        </button>
        ${
          this.isAdmin
            ? `<button type="button" class="btn btn-ghost btn-sm" data-action="delete-table" data-table-id="${t.id}" data-table-name="${t.name}">🗑 Ширээ устгах</button>`
            : ""
        }
      </div>
    `;
  },

  renderOccupiedCard(t, session) {
    const items = this.sessionItems[session.id] || [];
    const itemsTotal = items.reduce((sum, it) => sum + Number(it.line_total || 0), 0);

    return `
      <div class="table-card occupied" data-table-id="${t.id}">
        <div class="table-card-head">
          <h3>${t.name}</h3>
          <span class="badge badge-occupied">Тоглож байна</span>
        </div>
        <div class="table-card-rate">
          ${this.formatMoney(t.hourly_rate)} / цаг
          ${session.planned_hours ? ` · захиалсан: ${session.planned_hours} ц` : ""}
        </div>
        <div class="table-timer" data-started="${session.started_at}" data-rate="${session.hourly_rate}" data-items="${itemsTotal}" data-planned="${session.planned_hours || ""}">
          <div class="timer-time">00:00:00</div>
          <div class="timer-amount">0₮</div>
          <div class="timer-alert hidden">⏰ Захиалсан цаг дууслаа!</div>
        </div>
        ${
          items.length
            ? `<div class="item-list">
                ${items
                  .map(
                    (it) => `
                  <div class="item-row">
                    <span>${it.product_name} × ${it.quantity}</span>
                    <span>${this.formatMoney(it.line_total)}
                      <button type="button" class="item-remove" data-action="remove-item" data-item-id="${it.id}" data-table-id="${t.id}" title="Устгах">×</button>
                    </span>
                  </div>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-add-item" data-table-id="${t.id}" data-session-id="${session.id}">+ Бараа нэмэх</button>
        <button class="btn btn-danger" data-action="open-close" data-session-id="${session.id}" data-table-id="${t.id}">
          Дуусгах
        </button>
      </div>
    `;
  },

  /* ---------- Popup (modal) ---------- */

  openModal(innerHtml) {
    const overlay = document.getElementById("hb-modal-overlay");
    const body = document.getElementById("hb-modal-body");
    if (!overlay || !body) return;
    body.innerHTML = innerHtml;
    overlay.classList.remove("hidden");
  },

  closeModal() {
    const overlay = document.getElementById("hb-modal-overlay");
    if (overlay) overlay.classList.add("hidden");
  },

  openAddItemModal(tableId, sessionId) {
    const table = this.tables.find((tb) => tb.id === tableId);
    const productOptions = this.products
      .map((p) => `<option value="${p.id}">${p.name} (${this.formatMoney(p.unit_price)}) — үлдэгдэл: ${p.quantity} ${p.unit}</option>`)
      .join("");

    this.openModal(`
      <div class="modal-title">${table ? table.name : ""} — Бараа нэмэх</div>
      <div class="form-group" style="margin-bottom:14px;">
        <label>Бараа</label>
        <select id="hb-modal-product">
          <option value="">Бараа сонгох...</option>
          ${productOptions}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:18px;">
        <label>Тоо ширхэг</label>
        <input type="number" id="hb-modal-qty" min="1" step="1" value="1" />
      </div>
      <button type="button" class="btn btn-primary btn-full" id="hb-modal-add-btn">+ Нэмэх</button>
    `);

    document.getElementById("hb-modal-add-btn").addEventListener("click", () => this.handleAddItem(sessionId, tableId));
  },

  openCloseModal(tableId, sessionId) {
    const table = this.tables.find((tb) => tb.id === tableId);
    const session = this.activeSessions[tableId];
    if (!table || !session) return;

    const items = this.sessionItems[sessionId] || [];
    const itemsAmount = items.reduce((sum, it) => sum + Number(it.line_total || 0), 0);
    const elapsedMs = Date.now() - new Date(session.started_at).getTime();
    const elapsedHours = elapsedMs / 1000 / 60 / 60;
    const timeAmount = Math.round(Math.max(0, elapsedHours * session.hourly_rate));
    const total = timeAmount + itemsAmount;

    this.openModal(`
      <div class="modal-title">${table.name} — Тооцоо дуусгах</div>
      <div class="modal-summary-row"><span>Тоглосон хугацаа</span><span>${this.formatDuration(elapsedMs)}</span></div>
      <div class="modal-summary-row"><span>Цагийн төлбөр</span><span>${this.formatMoney(timeAmount)}</span></div>
      <div class="modal-summary-row"><span>Бараа (${items.length})</span><span>${this.formatMoney(itemsAmount)}</span></div>
      <div class="modal-summary-row total"><span>Нийт дүн</span><span>${this.formatMoney(total)}</span></div>
      <div class="form-group" style="margin: 16px 0 18px;">
        <label>Төлбөрийн хэлбэр</label>
        <select id="hb-modal-payment">
          <option value="cash">Бэлэн мөнгө</option>
          <option value="transfer">Дансны шилжүүлэг</option>
          <option value="pos">POS / карт</option>
        </select>
      </div>
      <button type="button" class="btn btn-danger btn-full" id="hb-modal-close-btn">Дуусгаж баталгаажуулах</button>
    `);

    document.getElementById("hb-modal-close-btn").addEventListener("click", () => {
      const paymentMethod = document.getElementById("hb-modal-payment").value;
      this.stopSession(sessionId, tableId, paymentMethod);
    });
  },

  renderTimers() {
    document.querySelectorAll(".table-timer").forEach((el) => {
      const started = new Date(el.dataset.started).getTime();
      const rate = parseFloat(el.dataset.rate);
      const itemsTotal = parseFloat(el.dataset.items || "0");
      const planned = parseFloat(el.dataset.planned || "0");
      const elapsedMs = Date.now() - started;
      const elapsedHours = elapsedMs / 1000 / 60 / 60;
      const timeAmount = Math.max(0, elapsedHours * rate);

      el.querySelector(".timer-time").textContent = this.formatDuration(elapsedMs);
      el.querySelector(".timer-amount").textContent =
        this.formatMoney(timeAmount + itemsTotal) + (itemsTotal ? ` (цаг: ${this.formatMoney(timeAmount)} + бараа: ${this.formatMoney(itemsTotal)})` : "");

      const alertEl = el.querySelector(".timer-alert");
      const card = el.closest(".table-card");
      const isOverdue = planned > 0 && elapsedHours >= planned;
      if (alertEl) alertEl.classList.toggle("hidden", !isOverdue);
      if (card) card.classList.toggle("time-up", isOverdue);
    });
  },

  async startSession(tableId, rate, plannedHours) {
    const { error } = await window.supabaseClient.from("sessions").insert({
      table_id: tableId,
      staff_id: HB_Auth.currentUser.id,
      hourly_rate: rate,
      planned_hours: plannedHours || null,
      status: "active",
    });
    if (error) {
      this.showError("Session эхлүүлэхэд алдаа гарлаа: " + error.message);
      return;
    }
    await window.supabaseClient.from("billiard_tables").update({ status: "occupied" }).eq("id", tableId);
    await this.loadTables();
  },

  async handleAddItem(sessionId, tableId) {
    const select = document.getElementById("hb-modal-product");
    const qtyInput = document.getElementById("hb-modal-qty");
    const productId = select.value;
    const qty = parseFloat(qtyInput.value) || 1;
    if (!productId) return;

    const product = this.products.find((p) => p.id === productId);
    if (!product) return;

    const lineTotal = Math.round(product.unit_price * qty);

    const { error } = await window.supabaseClient.from("session_items").insert({
      session_id: sessionId,
      product_id: product.id,
      product_name: product.name,
      quantity: qty,
      unit_price: product.unit_price,
      line_total: lineTotal,
    });
    if (error) {
      this.showError("Бараа нэмэхэд алдаа гарлаа: " + error.message);
      return;
    }

    await window.supabaseClient
      .from("sessions")
      .update({ items_amount: (this.sessionItems[sessionId] || []).reduce((s, it) => s + Number(it.line_total || 0), 0) + lineTotal })
      .eq("id", sessionId);

    await window.supabaseClient
      .from("products")
      .update({ quantity: Math.max(0, Number(product.quantity) - qty), updated_at: new Date().toISOString() })
      .eq("id", product.id);

    this.closeModal();
    await this.loadProducts();
    await this.loadTables();
  },

  async removeItem(itemId, tableId) {
    let item = null;
    Object.values(this.sessionItems).forEach((arr) => {
      const found = arr.find((it) => it.id === itemId);
      if (found) item = found;
    });
    if (!item) return;

    await window.supabaseClient.from("session_items").delete().eq("id", itemId);

    const remaining = (this.sessionItems[item.session_id] || []).filter((it) => it.id !== itemId);
    const newItemsAmount = remaining.reduce((s, it) => s + Number(it.line_total || 0), 0);
    await window.supabaseClient.from("sessions").update({ items_amount: newItemsAmount }).eq("id", item.session_id);

    if (item.product_id) {
      const product = this.products.find((p) => p.id === item.product_id);
      if (product) {
        await window.supabaseClient
          .from("products")
          .update({ quantity: Number(product.quantity) + Number(item.quantity) })
          .eq("id", product.id);
      }
    }

    await this.loadProducts();
    await this.loadTables();
  },

  async stopSession(sessionId, tableId, paymentMethod) {
    const session = this.activeSessions[tableId];
    if (!session) return;

    paymentMethod = paymentMethod || "cash";

    const startedAt = new Date(session.started_at).getTime();
    const endedAt = Date.now();
    const hours = (endedAt - startedAt) / 1000 / 60 / 60;
    const timeAmount = Math.round(hours * session.hourly_rate);
    const itemsAmount = (this.sessionItems[session.id] || []).reduce((s, it) => s + Number(it.line_total || 0), 0);
    const total = timeAmount + itemsAmount;

    const { error } = await window.supabaseClient
      .from("sessions")
      .update({
        ended_at: new Date(endedAt).toISOString(),
        time_amount: timeAmount,
        items_amount: itemsAmount,
        total_amount: total,
        payment_method: paymentMethod,
        status: "completed",
      })
      .eq("id", sessionId);

    if (error) {
      this.showError("Session дуусгахад алдаа гарлаа: " + error.message);
      return;
    }

    await window.supabaseClient.from("billiard_tables").update({ status: "available" }).eq("id", tableId);
    this.closeModal();
    await this.loadTables();
  },

  async deleteTable(tableId, tableName) {
    if (!confirm(`"${tableName}" ширээг устгах уу? Энэ үйлдлийг буцаах боломжгүй.`)) return;

    const { error } = await window.supabaseClient.from("billiard_tables").delete().eq("id", tableId);
    if (error) {
      this.showError("Ширээ устгахад алдаа гарлаа: " + error.message);
      return;
    }
    await this.loadTables();
  },

  async handleAddTable(e) {
    e.preventDefault();
    const name = document.getElementById("hb-new-table-name").value.trim();
    const rate = parseFloat(document.getElementById("hb-new-table-rate").value);
    if (!name || !rate) return;

    const { error } = await window.supabaseClient.from("billiard_tables").insert({ name, hourly_rate: rate });
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
    setTimeout(() => el.classList.add("hidden"), 6000);
  },
};

document.addEventListener("DOMContentLoaded", () => HB_App.init());
