// Барааматериалын хуудас: нөөцийн жагсаалт + ажилтны хүсэлт + admin батламж

const HB_Inventory = {
  isAdmin: false,

  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("inventory");
    this.isAdmin = ctx.profile && ctx.profile.role === "admin";

    const submitBtn = document.querySelector('#hb-stock-form button[type="submit"]');
    if (submitBtn) submitBtn.textContent = this.isAdmin ? "Нөөцөд нэмэх" : "Админд хүсэлт илгээх";
    const formTitle = document.getElementById("hb-stock-form-title");
    if (formTitle && this.isAdmin) formTitle.textContent = "Нөөцөд бараа нэмэх";

    document.getElementById("hb-stock-form").addEventListener("submit", (e) => this.handleSubmit(e));
    document.getElementById("hb-receipt-file").addEventListener("change", (e) => this.previewFile(e));

    await this.loadProducts();
    await this.loadRequests();
    this.subscribe();
  },

  subscribe() {
    window.supabaseClient
      .channel("hb-inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => this.loadProducts())
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_requests" }, () => this.loadRequests())
      .subscribe();
  },

  async loadProducts() {
    const { data, error } = await window.supabaseClient.from("products").select("*").order("name");
    if (error) return this.showError(error.message);

    const tbody = document.getElementById("hb-products-body");
    tbody.innerHTML = (data || []).length
      ? data
          .map(
            (p) => `
        <tr>
          <td>${p.name}</td>
          <td>${p.category || "—"}</td>
          <td>${p.quantity} ${p.unit}</td>
          <td>${this.formatMoney(p.unit_price)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="muted">Нөөц хоосон байна</td></tr>`;
  },

  async loadRequests() {
    const { data, error } = await window.supabaseClient
      .from("stock_requests")
      .select("*, profiles!stock_requests_submitted_by_fkey(full_name)")
      .order("created_at", { ascending: false });
    if (error) return this.showError(error.message);

    const tbody = document.getElementById("hb-requests-body");
    tbody.innerHTML = (data || []).length
      ? data
          .map((r) => {
            const statusLabel = { pending: "Хүлээгдэж буй", approved: "Батлагдсан", rejected: "Цуцлагдсан" }[r.status];
            const submitter = (r.profiles && r.profiles.full_name) || "—";
            return `
          <tr>
            <td>${new Date(r.created_at).toLocaleDateString("mn-MN")}</td>
            <td>${r.product_name}${r.receipt_url ? ` <a href="${r.receipt_url}" target="_blank" title="Баримт">📎</a>` : ""}</td>
            <td>${r.quantity} ${r.unit}</td>
            <td>${this.formatMoney(r.unit_price)}</td>
            <td>${submitter}</td>
            <td><span class="status-pill status-${r.status}">${statusLabel}</span></td>
            <td>${
              this.isAdmin && r.status === "pending"
                ? `<button class="btn btn-primary btn-sm" data-action="approve" data-id="${r.id}">Батлах</button>
                   <button class="btn btn-ghost btn-sm" data-action="reject" data-id="${r.id}">Цуцлах</button>`
                : ""
            }</td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" class="muted">Хүсэлт алга</td></tr>`;

    tbody.querySelectorAll('[data-action="approve"]').forEach((btn) =>
      btn.addEventListener("click", () => this.reviewRequest(btn.dataset.id, "approved"))
    );
    tbody.querySelectorAll('[data-action="reject"]').forEach((btn) =>
      btn.addEventListener("click", () => this.reviewRequest(btn.dataset.id, "rejected"))
    );
  },

  previewFile(e) {
    const file = e.target.files[0];
    const img = document.getElementById("hb-receipt-preview");
    if (!file) {
      img.classList.add("hidden");
      return;
    }
    img.src = URL.createObjectURL(file);
    img.classList.remove("hidden");
  },

  async handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("hb-stock-name").value.trim();
    const category = document.getElementById("hb-stock-category").value.trim();
    const unit = document.getElementById("hb-stock-unit").value.trim() || "ширхэг";
    const quantity = parseFloat(document.getElementById("hb-stock-qty").value);
    const unitPrice = parseFloat(document.getElementById("hb-stock-price").value) || 0;
    const note = document.getElementById("hb-stock-note").value.trim();
    const file = document.getElementById("hb-receipt-file").files[0];

    if (!name || !quantity) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Илгээж байна...";

    let receiptUrl = null;
    if (file) {
      const path = `${Date.now()}-${file.name}`.replace(/\s+/g, "_");
      const { error: uploadError } = await window.supabaseClient.storage.from("receipts").upload(path, file);
      if (uploadError) {
        this.showError("Зураг upload хийхэд алдаа гарлаа: " + uploadError.message);
      } else {
        const { data: pub } = window.supabaseClient.storage.from("receipts").getPublicUrl(path);
        receiptUrl = pub.publicUrl;
      }
    }

    const status = this.isAdmin ? "approved" : "pending";
    const insertPayload = {
      product_name: name,
      category,
      unit,
      quantity,
      unit_price: unitPrice,
      receipt_url: receiptUrl,
      note,
      submitted_by: HB_Auth.currentUser.id,
      status,
    };
    if (this.isAdmin) {
      insertPayload.reviewed_by = HB_Auth.currentUser.id;
      insertPayload.reviewed_at = new Date().toISOString();
    }

    const { data: inserted, error } = await window.supabaseClient
      .from("stock_requests")
      .insert(insertPayload)
      .select()
      .single();

    submitBtn.disabled = false;
    submitBtn.textContent = this.isAdmin ? "Нөөцөд нэмэх" : "Админд хүсэлт илгээх";

    if (error) {
      this.showError("Хүсэлт илгээхэд алдаа гарлаа: " + error.message);
      return;
    }

    if (this.isAdmin && inserted) {
      await this.applyToStock(inserted);
    }

    e.target.reset();
    document.getElementById("hb-receipt-preview").classList.add("hidden");
    await this.loadProducts();
    await this.loadRequests();
  },

  async applyToStock(reqRow) {
    const { data: existing } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("name", reqRow.product_name)
      .maybeSingle();

    if (existing) {
      await window.supabaseClient
        .from("products")
        .update({
          quantity: Number(existing.quantity) + Number(reqRow.quantity),
          unit_price: reqRow.unit_price || existing.unit_price,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await window.supabaseClient.from("products").insert({
        name: reqRow.product_name,
        category: reqRow.category,
        unit: reqRow.unit,
        quantity: reqRow.quantity,
        unit_price: reqRow.unit_price,
      });
    }
  },

  async reviewRequest(id, status) {
    const { data: reqRow, error: fetchErr } = await window.supabaseClient
      .from("stock_requests")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !reqRow) return this.showError("Хүсэлт олдсонгүй.");

    const { error } = await window.supabaseClient
      .from("stock_requests")
      .update({ status, reviewed_by: HB_Auth.currentUser.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return this.showError(error.message);

    if (status === "approved") {
      await this.applyToStock(reqRow);
    }

    await this.loadProducts();
    await this.loadRequests();
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

document.addEventListener("DOMContentLoaded", () => HB_Inventory.init());
