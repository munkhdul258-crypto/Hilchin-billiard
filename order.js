// QR цэсний захиалгын хуудас. Нэвтрэлт шаардахгүй, олон нийтэд нээлттэй.
// Урсгал: Ширээ сонгох → Цэснээс сагслах → Захиалга илгээх.

const STORAGE_KEY = "hb_order_table_id";

const HB_Order = {
  tables: [],
  products: [],
  selectedTableId: null,
  activeSession: null,
  myOrders: [],
  cart: {}, // product_id -> { product, qty }

  async init() {
    document.getElementById("hb-back-to-table").addEventListener("click", () => this.showStep("table"));
    document.getElementById("hb-submit-order").addEventListener("click", () => this.submitOrder());
    document.getElementById("hb-new-order").addEventListener("click", () => this.resetAndStart());
    document.getElementById("hb-bill-toggle").addEventListener("click", () => {
      document.getElementById("hb-bill-history").classList.toggle("hidden");
    });

    await this.loadTables();
    await this.loadProducts();

    let savedTableId = null;
    try {
      savedTableId = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      /* browser storage blocked — no big deal, just skip restoring */
    }
    if (savedTableId && this.tables.find((t) => t.id === savedTableId)) {
      this.selectTable(savedTableId);
    } else if (savedTableId) {
      this.forgetTable();
    }

    this.subscribeBill();
    setInterval(() => this.updateBillTotal(), 1000);
  },

  rememberTable(tableId) {
    try {
      localStorage.setItem(STORAGE_KEY, tableId);
    } catch (e) {
      /* ignore — browser storage may be unavailable */
    }
  },

  forgetTable() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  },

  subscribeBill() {
    window.supabaseClient
      .channel("hb-order-bill")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, () => this.refreshBill())
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_orders" }, () => this.refreshBill())
      .on("postgres_changes", { event: "*", schema: "public", table: "billiard_tables" }, () => this.handleTablesChange())
      .subscribe();
  },

  async handleTablesChange() {
    await this.loadTables();
    if (this.selectedTableId && !this.tables.find((t) => t.id === this.selectedTableId)) {
      this.selectedTableId = null;
      this.activeSession = null;
      this.forgetTable();
      document.getElementById("hb-bill-panel").classList.add("hidden");
      if (!document.getElementById("hb-step-done").classList.contains("active")) {
        this.showStep("table");
      }
    }
  },

  async refreshBill() {
    if (!this.selectedTableId) {
      document.getElementById("hb-bill-panel").classList.add("hidden");
      return;
    }

    const { data: session } = await window.supabaseClient
      .from("sessions")
      .select("*")
      .eq("table_id", this.selectedTableId)
      .eq("status", "active")
      .maybeSingle();
    this.activeSession = session || null;

    const { data: orders } = await window.supabaseClient
      .from("customer_orders")
      .select("*")
      .eq("table_id", this.selectedTableId)
      .order("created_at", { ascending: false })
      .limit(20);
    this.myOrders = orders || [];

    this.renderBill();
  },

  renderBill() {
    const panel = document.getElementById("hb-bill-panel");
    if (!this.selectedTableId || !this.activeSession) {
      panel.classList.add("hidden");
      return;
    }
    panel.classList.remove("hidden");

    const table = this.tables.find((t) => t.id === this.selectedTableId);
    document.getElementById("hb-bill-table-name").textContent = table ? table.name : "";
    this.updateBillTotal();

    const historyEl = document.getElementById("hb-bill-history");
    const statusLabel = { pending: "Хүлээгдэж буй", confirmed: "Баталгаажсан", rejected: "Татгалзсан" };
    historyEl.innerHTML = this.myOrders.length
      ? this.myOrders
          .map((o) => {
            const itemsSummary = (o.items || []).map((it) => `${it.product_name}×${it.quantity}`).join(", ");
            return `
              <div class="bill-history-item">
                <div class="bill-history-top">
                  <span class="status-pill status-${o.status}">${statusLabel[o.status] || o.status}</span>
                  <span class="muted" style="font-size:0.75rem;">${new Date(o.created_at).toLocaleTimeString("mn-MN")}</span>
                </div>
                <div class="bill-history-items">${itemsSummary} — ${this.formatMoney(o.total_amount)}</div>
              </div>
            `;
          })
          .join("")
      : `<p class="muted" style="font-size:0.8rem;">Захиалгын түүх алга.</p>`;
  },

  updateBillTotal() {
    if (!this.activeSession) return;
    const started = new Date(this.activeSession.started_at).getTime();
    const rate = Number(this.activeSession.hourly_rate || 0);
    const elapsedHours = (Date.now() - started) / 3600000;
    const timeAmount = Math.max(0, elapsedHours * rate);
    const itemsAmount = Number(this.activeSession.items_amount || 0);
    const totalEl = document.getElementById("hb-bill-total");
    if (totalEl) totalEl.textContent = this.formatMoney(timeAmount + itemsAmount);
  },

  async loadTables() {
    const { data, error } = await window.supabaseClient
      .from("billiard_tables")
      .select("*")
      .eq("status", "occupied")
      .order("name");

    if (error) {
      this.showError("Ширээнүүдийг ачаалахад алдаа гарлаа: " + error.message);
      return;
    }

    this.tables = data || [];
    const grid = document.getElementById("hb-table-grid");

    if (!this.tables.length) {
      grid.innerHTML = `<p class="muted">Одоогоор тоглож буй ширээ алга байна. Ажилтнаас асууна уу.</p>`;
      return;
    }

    grid.innerHTML = this.tables
      .map((t) => `<button type="button" class="table-pick-btn" data-table-id="${t.id}">${t.name}</button>`)
      .join("");

    grid.querySelectorAll(".table-pick-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.selectTable(btn.dataset.tableId));
    });
  },

  async loadProducts() {
    const { data, error } = await window.supabaseClient.from("products").select("*").order("name");
    if (error) {
      this.showError("Цэс ачаалахад алдаа гарлаа: " + error.message);
      return;
    }
    this.products = (data || []).filter((p) => Number(p.quantity) > 0);
  },

  selectTable(tableId) {
    this.selectedTableId = tableId;
    this.rememberTable(tableId);
    const table = this.tables.find((t) => t.id === tableId);
    document.getElementById("hb-selected-table-name").textContent = table ? table.name : "";
    this.renderMenu();
    this.showStep("menu");
    this.refreshBill();
  },

  renderMenu() {
    const list = document.getElementById("hb-menu-list");
    if (!this.products.length) {
      list.innerHTML = `<p class="muted">Одоогоор бараа алга байна.</p>`;
      return;
    }

    list.innerHTML = this.products
      .map((p) => {
        const qty = (this.cart[p.id] && this.cart[p.id].qty) || 0;
        return `
          <div class="menu-item">
            <div class="menu-item-info">
              <div class="menu-item-name">${p.name}</div>
              <div class="menu-item-price">${this.formatMoney(p.unit_price)}</div>
            </div>
            <div class="menu-item-qty">
              <button type="button" class="qty-btn" data-action="dec" data-id="${p.id}">−</button>
              <span class="qty-val" id="hb-qty-${p.id}">${qty}</span>
              <button type="button" class="qty-btn" data-action="inc" data-id="${p.id}">+</button>
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll('[data-action="inc"]').forEach((btn) =>
      btn.addEventListener("click", () => this.changeQty(btn.dataset.id, 1))
    );
    list.querySelectorAll('[data-action="dec"]').forEach((btn) =>
      btn.addEventListener("click", () => this.changeQty(btn.dataset.id, -1))
    );
  },

  changeQty(productId, delta) {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return;

    const current = (this.cart[productId] && this.cart[productId].qty) || 0;
    const next = Math.max(0, Math.min(Number(product.quantity), current + delta));

    if (next === 0) {
      delete this.cart[productId];
    } else {
      this.cart[productId] = { product, qty: next };
    }

    const qtyEl = document.getElementById(`hb-qty-${productId}`);
    if (qtyEl) qtyEl.textContent = next;

    this.updateCartBar();
  },

  updateCartBar() {
    const items = Object.values(this.cart);
    const count = items.reduce((s, it) => s + it.qty, 0);
    const total = items.reduce((s, it) => s + it.qty * Number(it.product.unit_price), 0);

    const bar = document.getElementById("hb-cart-bar");
    document.getElementById("hb-cart-count").textContent = count;
    document.getElementById("hb-cart-total").textContent = this.formatMoney(total);
    bar.classList.toggle("hidden", count === 0);
  },

  async submitOrder() {
    const items = Object.values(this.cart);
    if (!items.length || !this.selectedTableId) return;

    const submitBtn = document.getElementById("hb-submit-order");
    submitBtn.disabled = true;
    submitBtn.textContent = "Илгээж байна...";

    const payloadItems = items.map((it) => ({
      product_id: it.product.id,
      product_name: it.product.name,
      unit_price: it.product.unit_price,
      quantity: it.qty,
      line_total: Math.round(it.product.unit_price * it.qty),
    }));
    const totalAmount = payloadItems.reduce((s, it) => s + it.line_total, 0);
    const note = document.getElementById("hb-order-note").value.trim();

    const { error } = await window.supabaseClient.from("customer_orders").insert({
      table_id: this.selectedTableId,
      items: payloadItems,
      total_amount: totalAmount,
      note: note || null,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Захиалга өгөх";

    if (error) {
      this.showError("Захиалга илгээхэд алдаа гарлаа: " + error.message);
      return;
    }

    document.getElementById("hb-cart-bar").classList.add("hidden");
    this.showStep("done");
    this.refreshBill();
  },

  resetAndStart() {
    this.cart = {};
    document.getElementById("hb-order-note").value = "";
    if (this.selectedTableId && this.tables.find((t) => t.id === this.selectedTableId)) {
      this.renderMenu();
      this.showStep("menu");
    } else {
      this.selectedTableId = null;
      this.forgetTable();
      this.showStep("table");
    }
  },

  showStep(step) {
    document.querySelectorAll(".order-step").forEach((el) => el.classList.remove("active"));
    document.getElementById(`hb-step-${step}`).classList.add("active");
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

document.addEventListener("DOMContentLoaded", () => HB_Order.init());
