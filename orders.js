// Ажилтны талын захиалгын дараалал: QR цэсээр ирсэн захиалгыг харж,
// баталгаажуулах (ширээний тооцоонд нэмэх) эсвэл татгалзах.

const HB_Orders = {
  pending: [],
  history: [],
  tableNames: {},

  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("orders");

    document.getElementById("hb-orders-qr-btn").addEventListener("click", () => this.showQr());
    document.getElementById("hb-qr-close").addEventListener("click", () => this.closeQr());
    document.getElementById("hb-qr-overlay").addEventListener("click", (e) => {
      if (e.target.id === "hb-qr-overlay") this.closeQr();
    });

    await this.loadTableNames();
    await this.load();
    this.subscribe();
  },

  subscribe() {
    window.supabaseClient
      .channel("hb-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_orders" }, () => this.load())
      .on("postgres_changes", { event: "*", schema: "public", table: "billiard_tables" }, () => this.loadTableNames())
      .subscribe();
  },

  async loadTableNames() {
    const { data } = await window.supabaseClient.from("billiard_tables").select("id, name");
    this.tableNames = {};
    (data || []).forEach((t) => (this.tableNames[t.id] = t.name));
  },

  async load() {
    const { data, error } = await window.supabaseClient
      .from("customer_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      this.showError("Захиалга ачаалахад алдаа гарлаа: " + error.message);
      return;
    }

    const all = data || [];
    this.pending = all.filter((o) => o.status === "pending");
    this.history = all.filter((o) => o.status !== "pending");
    this.render();
  },

  render() {
    const pendingEl = document.getElementById("hb-pending-list");
    pendingEl.innerHTML = this.pending.length
      ? this.pending
          .map((o) => {
            const tableName = this.tableNames[o.table_id] || "?";
            const itemsHtml = (o.items || [])
              .map((it) => `<div><span>${it.product_name} × ${it.quantity}</span> <span>${this.formatMoney(it.line_total)}</span></div>`)
              .join("");
            return `
              <div class="order-card">
                <div class="order-card-head">
                  <h3>${tableName}</h3>
                  <span class="muted" style="font-size:0.8rem;">${new Date(o.created_at).toLocaleTimeString("mn-MN")}</span>
                </div>
                <div class="order-card-items">${itemsHtml}</div>
                ${o.note ? `<div class="order-card-note">📝 ${o.note}</div>` : ""}
                <div class="order-card-total">Нийт: ${this.formatMoney(o.total_amount)}</div>
                <div class="order-card-actions">
                  <button type="button" class="btn btn-primary btn-sm" data-action="confirm" data-id="${o.id}">✅ Баталгаажуулах</button>
                  <button type="button" class="btn btn-ghost btn-sm" data-action="reject" data-id="${o.id}">Татгалзах</button>
                </div>
              </div>
            `;
          })
          .join("")
      : `<p class="muted">Хүлээгдэж буй захиалга алга.</p>`;

    pendingEl.querySelectorAll('[data-action="confirm"]').forEach((btn) =>
      btn.addEventListener("click", () => this.reviewOrder(btn.dataset.id, "confirmed"))
    );
    pendingEl.querySelectorAll('[data-action="reject"]').forEach((btn) =>
      btn.addEventListener("click", () => this.reviewOrder(btn.dataset.id, "rejected"))
    );

    const historyBody = document.getElementById("hb-history-body");
    historyBody.innerHTML = this.history.length
      ? this.history
          .map((o) => {
            const tableName = this.tableNames[o.table_id] || "?";
            const itemsSummary = (o.items || []).map((it) => `${it.product_name}×${it.quantity}`).join(", ");
            return `
              <tr>
                <td>${new Date(o.created_at).toLocaleString("mn-MN")}</td>
                <td>${tableName}</td>
                <td>${itemsSummary}</td>
                <td>${this.formatMoney(o.total_amount)}</td>
                <td><span class="status-pill status-${o.status}">${{ confirmed: "Баталгаажсан", rejected: "Татгалзсан" }[o.status] || o.status}</span></td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="5" class="muted">Түүх алга.</td></tr>`;
  },

  async reviewOrder(id, status) {
    const order = [...this.pending, ...this.history].find((o) => o.id === id);
    if (!order) return;

    const { error: updateErr } = await window.supabaseClient
      .from("customer_orders")
      .update({ status, reviewed_by: HB_Auth.currentUser.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (updateErr) {
      this.showError("Захиалга шийдвэрлэхэд алдаа гарлаа: " + updateErr.message);
      return;
    }

    if (status === "confirmed") {
      await this.applyOrderToSession(order);
    }

    await this.load();
  },

  async applyOrderToSession(order) {
    const { data: session, error: sessErr } = await window.supabaseClient
      .from("sessions")
      .select("*")
      .eq("table_id", order.table_id)
      .eq("status", "active")
      .maybeSingle();

    if (sessErr || !session) {
      this.showError("Энэ ширээ одоо тоглож байгаа session олдсонгүй тул тооцоонд нэмэгдсэнгүй. Гараар нэмнэ үү.");
      return;
    }

    for (const it of order.items || []) {
      await window.supabaseClient.from("session_items").insert({
        session_id: session.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
      });

      const { data: product } = await window.supabaseClient
        .from("products")
        .select("*")
        .eq("id", it.product_id)
        .maybeSingle();
      if (product) {
        await window.supabaseClient
          .from("products")
          .update({ quantity: Math.max(0, Number(product.quantity) - Number(it.quantity)), updated_at: new Date().toISOString() })
          .eq("id", product.id);
      }
    }

    const { data: allItems } = await window.supabaseClient
      .from("session_items")
      .select("line_total")
      .eq("session_id", session.id);
    const itemsAmount = (allItems || []).reduce((s, it) => s + Number(it.line_total || 0), 0);

    await window.supabaseClient.from("sessions").update({ items_amount: itemsAmount }).eq("id", session.id);
  },

  showQr() {
    const url = `${window.location.origin}/order.html`;
    document.getElementById("hb-qr-url").textContent = url;
    const img = document.getElementById("hb-qr-img");
    if (img) {
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
    }
    document.getElementById("hb-qr-overlay").classList.remove("hidden");
  },

  closeQr() {
    document.getElementById("hb-qr-overlay").classList.add("hidden");
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

document.addEventListener("DOMContentLoaded", () => HB_Orders.init());
