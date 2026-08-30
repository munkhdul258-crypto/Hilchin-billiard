// Зээлийн бүртгэлийн хуудас

const HB_Debts = {
  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("debts");

    document.getElementById("hb-debt-form").addEventListener("submit", (e) => this.handleSubmit(e));

    await this.load();

    window.supabaseClient
      .channel("hb-debts")
      .on("postgres_changes", { event: "*", schema: "public", table: "debts" }, () => this.load())
      .subscribe();
  },

  async handleSubmit(e) {
    e.preventDefault();
    const customerName = document.getElementById("hb-debt-name").value.trim();
    const phone = document.getElementById("hb-debt-phone").value.trim();
    const amount = parseFloat(document.getElementById("hb-debt-amount").value);
    const dueDate = document.getElementById("hb-debt-due").value || null;
    const note = document.getElementById("hb-debt-note").value.trim();

    if (!customerName || !amount) return;

    const { error } = await window.supabaseClient.from("debts").insert({
      customer_name: customerName,
      phone,
      amount,
      due_date: dueDate,
      note,
      created_by: HB_Auth.currentUser.id,
      status: "unpaid",
    });

    if (error) return this.showError(error.message);

    e.target.reset();
    await this.load();
  },

  async load() {
    const { data, error } = await window.supabaseClient
      .from("debts")
      .select("*")
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false });

    if (error) return this.showError(error.message);

    const todayStr = new Date().toISOString().slice(0, 10);
    const rows = data || [];

    const totalUnpaid = rows.filter((d) => d.status === "unpaid").reduce((s, d) => s + Number(d.amount), 0);
    const overdueCount = rows.filter((d) => d.status === "unpaid" && d.due_date && d.due_date < todayStr).length;

    document.getElementById("hb-stat-unpaid").textContent = this.formatMoney(totalUnpaid);
    document.getElementById("hb-stat-overdue").textContent = overdueCount;
    document.getElementById("hb-stat-count").textContent = rows.filter((d) => d.status === "unpaid").length;

    const tbody = document.getElementById("hb-debts-body");
    tbody.innerHTML = rows.length
      ? rows
          .map((d) => {
            const isOverdue = d.status === "unpaid" && d.due_date && d.due_date < todayStr;
            const statusKey = d.status === "paid" ? "paid" : isOverdue ? "overdue" : "unpaid";
            const statusLabel = d.status === "paid" ? "Төлсөн" : isOverdue ? "Хугацаа хэтэрсэн" : "Төлөгдөөгүй";
            return `
          <tr>
            <td>${d.customer_name}${d.phone ? `<br/><span class="muted">${d.phone}</span>` : ""}</td>
            <td>${this.formatMoney(d.amount)}</td>
            <td>${d.due_date ? new Date(d.due_date).toLocaleDateString("mn-MN") : "—"}</td>
            <td>${d.note || "—"}</td>
            <td><span class="status-pill status-${statusKey}">${statusLabel}</span></td>
            <td>${
              d.status === "unpaid"
                ? `<button class="btn btn-primary btn-sm" data-action="mark-paid" data-id="${d.id}">Төлсөн</button>`
                : ""
            }</td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="muted">Зээл бүртгэгдээгүй байна</td></tr>`;

    tbody.querySelectorAll('[data-action="mark-paid"]').forEach((btn) =>
      btn.addEventListener("click", () => this.markPaid(btn.dataset.id))
    );
  },

  async markPaid(id) {
    await window.supabaseClient
      .from("debts")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id);
    await this.load();
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

document.addEventListener("DOMContentLoaded", () => HB_Debts.init());
