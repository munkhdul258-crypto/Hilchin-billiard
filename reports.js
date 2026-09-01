// Орлогын тайлан, статистикийн хуудас (v2: зарлага, үлдэгдэл, 10 цагийн ээлж)

const HB_Reports = {
  chart: null,
  SHIFT_START_HOUR: 10, // өглөөний 10 цагт ээлж солигдоно

  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("reports");

    document.getElementById("hb-range-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.load();
    });
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => this.applyPreset(btn.dataset.preset));
    });
    document.getElementById("hb-expense-form").addEventListener("submit", (e) => this.handleAddExpense(e));

    await this.loadStock();
    this.applyPreset("today");
  },

  /** "Өдөр" гэдгийг өглөөний 10 цагаас эхлүүлж тооцно (ээлж солигдох цаг). */
  shiftDayStart(date) {
    const d = new Date(date);
    if (d.getHours() < this.SHIFT_START_HOUR) d.setDate(d.getDate() - 1);
    d.setHours(this.SHIFT_START_HOUR, 0, 0, 0);
    return d;
  },

  applyPreset(preset) {
    const now = new Date();
    let from, to;

    if (preset === "today") {
      from = this.shiftDayStart(now);
      to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1000);
    } else if (preset === "yesterday") {
      const todayStart = this.shiftDayStart(now);
      from = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      to = new Date(todayStart.getTime() - 1000);
    } else if (preset === "week") {
      from = this.shiftDayStart(now);
      from.setDate(from.getDate() - 6);
      to = new Date();
    } else if (preset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1, this.SHIFT_START_HOUR, 0, 0);
      to = new Date();
    } else if (preset === "halfyear") {
      from = new Date(now);
      from.setMonth(from.getMonth() - 6);
      to = new Date();
    } else if (preset === "year") {
      from = new Date(now.getFullYear(), 0, 1, this.SHIFT_START_HOUR, 0, 0);
      to = new Date();
    }

    document.getElementById("hb-from").value = this.toInputDateTime(from);
    document.getElementById("hb-to").value = this.toInputDateTime(to);
    this.load();
  },

  toInputDateTime(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  async load() {
    const fromVal = document.getElementById("hb-from").value;
    const toVal = document.getElementById("hb-to").value;
    if (!fromVal || !toVal) return;

    const from = new Date(fromVal);
    const to = new Date(toVal);

    const [{ data: sessions, error }, { data: expenses, error: expErr }] = await Promise.all([
      window.supabaseClient
        .from("sessions")
        .select("*, billiard_tables(name), profiles(full_name, email)")
        .eq("status", "completed")
        .gte("ended_at", from.toISOString())
        .lte("ended_at", to.toISOString())
        .order("ended_at", { ascending: false }),
      window.supabaseClient
        .from("expenses")
        .select("*")
        .gte("spent_at", from.toISOString())
        .lte("spent_at", to.toISOString())
        .order("spent_at", { ascending: false }),
    ]);

    if (error) return alert("Тайлан ачаалахад алдаа гарлаа: " + error.message);
    if (expErr) console.error(expErr);

    this.renderSummary(sessions || [], expenses || []);
    this.renderByTable(sessions || []);
    this.renderByPayment(sessions || []);
    this.renderByStaff(sessions || []);
    this.renderHistory(sessions || []);
    this.renderExpenses(expenses || []);
    this.renderChart(sessions || [], expenses || [], from, to);
  },

  renderSummary(sessions, expenses) {
    const totalRevenue = sessions.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const totalSessions = sessions.length;

    document.getElementById("hb-stat-revenue").textContent = this.formatMoney(totalRevenue);
    document.getElementById("hb-stat-expense").textContent = this.formatMoney(totalExpense);
    document.getElementById("hb-stat-net").textContent = this.formatMoney(totalRevenue - totalExpense);
    document.getElementById("hb-stat-sessions").textContent = totalSessions;
  },

  async loadStock() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .order("quantity", { ascending: true });
    if (error) return;

    const totalValue = (data || []).reduce((sum, p) => sum + Number(p.quantity || 0) * Number(p.unit_price || 0), 0);
    const totalValueEl = document.getElementById("hb-stock-total-value");
    if (totalValueEl) totalValueEl.textContent = this.formatMoney(totalValue);

    const tbody = document.getElementById("hb-stock-body");
    tbody.innerHTML = (data || []).length
      ? data
          .map(
            (p) => `
        <tr>
          <td>${p.name}</td>
          <td>${p.category || "—"}</td>
          <td>${p.quantity} ${p.unit}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="3" class="muted">Бараа бүртгэгдээгүй</td></tr>`;
  },

  renderByTable(sessions) {
    const map = {};
    sessions.forEach((s) => {
      const name = (s.billiard_tables && s.billiard_tables.name) || "—";
      if (!map[name]) map[name] = { count: 0, revenue: 0 };
      map[name].count += 1;
      map[name].revenue += Number(s.total_amount || 0);
    });

    const rows = Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
    const tbody = document.getElementById("hb-by-table-body");
    tbody.innerHTML = rows.length
      ? rows
          .map(([name, v]) => `<tr><td>${name}</td><td>${v.count}</td><td>${this.formatMoney(v.revenue)}</td></tr>`)
          .join("")
      : `<tr><td colspan="3" class="muted">Мэдээлэл алга</td></tr>`;
  },

  PAYMENT_LABELS: { cash: "Бэлэн мөнгө", transfer: "Дансны шилжүүлэг", pos: "POS / карт" },

  renderByPayment(sessions) {
    const map = { cash: 0, transfer: 0, pos: 0 };
    sessions.forEach((s) => {
      const method = s.payment_method || "cash";
      map[method] = (map[method] || 0) + Number(s.total_amount || 0);
    });

    const total = map.cash + map.transfer + map.pos;
    const tbody = document.getElementById("hb-by-payment-body");
    if (!tbody) return;

    tbody.innerHTML = Object.entries(map)
      .map(([key, val]) => {
        const pct = total > 0 ? Math.round((val / total) * 100) : 0;
        return `<tr><td>${this.PAYMENT_LABELS[key] || key}</td><td>${this.formatMoney(val)}</td><td>${pct}%</td></tr>`;
      })
      .join("");
  },

  renderByStaff(sessions) {
    const map = {};
    sessions.forEach((s) => {
      const name = (s.profiles && (s.profiles.full_name || s.profiles.email)) || "—";
      if (!map[name]) map[name] = { count: 0, revenue: 0 };
      map[name].count += 1;
      map[name].revenue += Number(s.total_amount || 0);
    });

    const rows = Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
    const tbody = document.getElementById("hb-by-staff-body");
    if (!tbody) return;

    tbody.innerHTML = rows.length
      ? rows
          .map(([name, v]) => `<tr><td>${name}</td><td>${v.count}</td><td>${this.formatMoney(v.revenue)}</td></tr>`)
          .join("")
      : `<tr><td colspan="3" class="muted">Мэдээлэл алга</td></tr>`;
  },

  renderHistory(sessions) {
    const tbody = document.getElementById("hb-history-body");
    tbody.innerHTML = sessions.length
      ? sessions
          .map((s) => {
            const start = new Date(s.started_at);
            const end = new Date(s.ended_at);
            const durationMin = Math.round((end - start) / 60000);
            return `
          <tr>
            <td>${end.toLocaleString("mn-MN")}</td>
            <td>${(s.billiard_tables && s.billiard_tables.name) || "—"}</td>
            <td>${durationMin} мин</td>
            <td>${this.formatMoney(s.time_amount != null ? s.time_amount : s.total_amount)}</td>
            <td>${this.formatMoney(s.items_amount || 0)}</td>
            <td>${this.formatMoney(s.total_amount)}</td>
            <td>${this.PAYMENT_LABELS[s.payment_method] || "—"}</td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="7" class="muted">Мэдээлэл алга</td></tr>`;
  },

  renderExpenses(expenses) {
    const tbody = document.getElementById("hb-expenses-body");
    tbody.innerHTML = expenses.length
      ? expenses
          .map(
            (e) => `
        <tr>
          <td>${new Date(e.spent_at).toLocaleString("mn-MN")}</td>
          <td>${e.description}</td>
          <td>${e.category || "—"}</td>
          <td>${this.formatMoney(e.amount)}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="muted">Зарлага алга</td></tr>`;
  },

  async handleAddExpense(e) {
    e.preventDefault();
    const description = document.getElementById("hb-expense-desc").value.trim();
    const amount = parseFloat(document.getElementById("hb-expense-amount").value);
    const category = document.getElementById("hb-expense-category").value.trim();
    if (!description || !amount) return;

    const { error } = await window.supabaseClient.from("expenses").insert({
      description,
      amount,
      category,
      created_by: HB_Auth.currentUser.id,
    });
    if (error) return alert("Зарлага нэмэхэд алдаа гарлаа: " + error.message);

    e.target.reset();
    await this.load();
  },

  renderChart(sessions, expenses, from, to) {
    const canvas = document.getElementById("hb-chart");
    if (!canvas || !window.Chart) return;

    const dayMs = 24 * 60 * 60 * 1000;
    const days = [];
    for (let t = new Date(from).setHours(0, 0, 0, 0); t <= to.getTime(); t += dayMs) {
      days.push(new Date(t));
    }

    const revByDay = days.map((day) => {
      const dayStr = day.toDateString();
      return sessions
        .filter((s) => new Date(s.ended_at).toDateString() === dayStr)
        .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    });
    const expByDay = days.map((day) => {
      const dayStr = day.toDateString();
      return expenses
        .filter((e) => new Date(e.spent_at).toDateString() === dayStr)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    });

    const labels = days.map((d) => d.toLocaleDateString("mn-MN", { month: "short", day: "numeric" }));

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Орлого (₮)", data: revByDay, backgroundColor: "#2563eb", borderRadius: 6 },
          { label: "Зарлага (₮)", data: expByDay, backgroundColor: "#dc2626", borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true, ticks: { callback: (v) => v.toLocaleString("mn-MN") } } },
      },
    });
  },

  formatMoney(n) {
    return Math.round(n || 0).toLocaleString("mn-MN") + "₮";
  },
};

document.addEventListener("DOMContentLoaded", () => HB_Reports.init());
