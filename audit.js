// Аудит лог хуудас — зөвхөн admin. Хэн, хэзээ, юуг өөрчилсөн бүх
// түүхийг (database trigger-ээр автоматаар бүртгэгдсэн) харуулна.

const HB_Audit = {
  logs: [],

  TABLE_LABELS: {
    billiard_tables: "Ширээ",
    sessions: "Тоглолт (session)",
    session_items: "Session-ий бараа",
    products: "Бараа материал",
    expenses: "Зарлага",
    debts: "Зээл",
    stock_requests: "Барааны хүсэлт",
    settings: "Тохиргоо",
    announcements: "Мэдэгдэл",
    shift_handovers: "Ээлж хүлээлцэлт",
  },

  OP_LABELS: { INSERT: "Үүсгэсэн", UPDATE: "Өөрчилсөн", DELETE: "Устгасан" },

  async init() {
    const ctx = await HB_Auth.requireAdmin();
    if (!ctx) return;
    HB_Auth.renderNavbar("audit");

    const closeBtn = document.getElementById("hb-audit-close");
    const overlay = document.getElementById("hb-audit-modal-overlay");
    if (closeBtn) closeBtn.addEventListener("click", () => this.closeModal());
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModal();
      });
    }

    const filter = document.getElementById("hb-audit-table-filter");
    if (filter) filter.addEventListener("change", () => this.load());

    const refreshBtn = document.getElementById("hb-audit-refresh");
    if (refreshBtn) refreshBtn.addEventListener("click", () => this.load());

    await this.load();
  },

  async load() {
    const filterEl = document.getElementById("hb-audit-table-filter");
    const filterValue = filterEl ? filterEl.value : "";

    let query = window.supabaseClient
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (filterValue) query = query.eq("table_name", filterValue);

    const { data, error } = await query;
    if (error) {
      this.showError("Аудит лог ачаалахад алдаа гарлаа: " + error.message);
      return;
    }
    this.logs = data || [];
    this.render();
  },

  render() {
    const tbody = document.getElementById("hb-audit-body");
    if (!tbody) return;

    if (!this.logs.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Лог бүртгэл алга.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.logs
      .map((l, idx) => {
        const dt = new Date(l.created_at).toLocaleString("mn-MN");
        const opClass =
          l.operation === "DELETE" ? "audit-op-delete" : l.operation === "UPDATE" ? "audit-op-update" : "audit-op-insert";
        return `
          <tr>
            <td>${dt}</td>
            <td>${l.actor_name || "—"}</td>
            <td><span class="audit-op ${opClass}">${this.OP_LABELS[l.operation] || l.operation}</span></td>
            <td>${this.TABLE_LABELS[l.table_name] || l.table_name}</td>
            <td><button type="button" class="btn btn-ghost btn-sm" data-action="details" data-idx="${idx}">Дэлгэрэнгүй</button></td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll('[data-action="details"]').forEach((btn) => {
      btn.addEventListener("click", () => this.showDetails(this.logs[Number(btn.dataset.idx)]));
    });
  },

  showDetails(log) {
    const overlay = document.getElementById("hb-audit-modal-overlay");
    const body = document.getElementById("hb-audit-modal-body");
    if (!overlay || !body || !log) return;

    body.innerHTML = `
      <div class="modal-title">${this.TABLE_LABELS[log.table_name] || log.table_name} — ${this.OP_LABELS[log.operation] || log.operation}</div>
      <div class="muted" style="margin-bottom:14px;">${new Date(log.created_at).toLocaleString("mn-MN")} · ${log.actor_name || "—"}</div>
      ${
        log.old_data
          ? `<div class="audit-json-label">Өмнөх утга:</div><pre class="audit-json">${this.escapeHtml(JSON.stringify(log.old_data, null, 2))}</pre>`
          : ""
      }
      ${
        log.new_data
          ? `<div class="audit-json-label">Шинэ утга:</div><pre class="audit-json">${this.escapeHtml(JSON.stringify(log.new_data, null, 2))}</pre>`
          : ""
      }
    `;
    overlay.classList.remove("hidden");
  },

  closeModal() {
    const overlay = document.getElementById("hb-audit-modal-overlay");
    if (overlay) overlay.classList.add("hidden");
  },

  escapeHtml(str) {
    return String(str).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  },

  showError(msg) {
    const el = document.getElementById("hb-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("hidden");
  },
};

document.addEventListener("DOMContentLoaded", () => HB_Audit.init());
