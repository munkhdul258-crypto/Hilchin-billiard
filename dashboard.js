// Админы хянах самбар: өнөөдрийн үзүүлэлт, сүүлийн 14 хоногийн орлого/зарлагын
// график, мөн ээлж бүрийн кассын зөрүүгийн график — бүгд нэг дор, товч харагдацтай.

const HB_Dashboard = {
  SHIFT_START_HOUR: 10,
  revenueChart: null,
  diffChart: null,

  async init() {
    const ctx = await HB_Auth.requireAdmin();
    if (!ctx) return;
    HB_Auth.renderNavbar("dashboard");

    await this.loadShiftHour();
    await this.load();
  },

  async loadShiftHour() {
    const { data } = await window.supabaseClient
      .from("settings")
      .select("value")
      .eq("key", "shift_start_hour")
      .maybeSingle();
    const hour = data ? parseInt(data.value, 10) : NaN;
    this.SHIFT_START_HOUR = Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 10;
  },

  shiftDayStart(date) {
    const d = new Date(date);
    if (d.getHours() < this.SHIFT_START_HOUR) d.setDate(d.getDate() - 1);
    d.setHours(this.SHIFT_START_HOUR, 0, 0, 0);
    return d;
  },

  async load() {
    const now = new Date();
    const todayStart = this.shiftDayStart(now);
    const rangeStart = new Date(todayStart.getTime() - 13 * 24 * 60 * 60 * 1000);

    const [{ data: sessions }, { data: expenses }, { data: advances }, { data: shifts }] = await Promise.all([
      window.supabaseClient
        .from("sessions")
        .select("total_amount, ended_at")
        .eq("status", "completed")
        .gte("ended_at", rangeStart.toISOString()),
      window.supabaseClient.from("expenses").select("amount, spent_at").gte("spent_at", rangeStart.toISOString()),
      window.supabaseClient.from("cash_movements").select("amount").eq("category", "advance").eq("settled", false),
      window.supabaseClient
        .from("shift_handovers")
        .select("created_at, revenue, total_diff, profiles(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const todayRevenue = (sessions || [])
      .filter((s) => new Date(s.ended_at) >= todayStart)
      .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const todayExpense = (expenses || [])
      .filter((e) => new Date(e.spent_at) >= todayStart)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const advancesTotal = (advances || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);

    document.getElementById("hb-dash-revenue").textContent = this.formatMoney(todayRevenue);
    document.getElementById("hb-dash-expense").textContent = this.formatMoney(todayExpense);
    document.getElementById("hb-dash-net").textContent = this.formatMoney(todayRevenue - todayExpense);
    document.getElementById("hb-dash-advances").textContent = this.formatMoney(advancesTotal);

    this.renderRevenueChart(sessions || [], expenses || [], rangeStart, now);
    this.renderDiffChart((shifts || []).slice().reverse());
    this.renderShiftsTable(shifts || []);
  },

  renderRevenueChart(sessions, expenses, from, to) {
    const canvas = document.getElementById("hb-dash-revenue-chart");
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

    if (this.revenueChart) this.revenueChart.destroy();
    this.revenueChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Орлого", data: revByDay, backgroundColor: "#00e5ff", borderRadius: 4 },
          { label: "Зарлага", data: expByDay, backgroundColor: "#ff2bd6", borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true, labels: { color: "#86a0c4" } } },
        scales: {
          y: { beginAtZero: true, ticks: { color: "#86a0c4", callback: (v) => v.toLocaleString("mn-MN") }, grid: { color: "rgba(34,58,94,0.4)" } },
          x: { ticks: { color: "#86a0c4" }, grid: { color: "rgba(34,58,94,0.25)" } },
        },
      },
    });
  },

  renderDiffChart(shifts) {
    const canvas = document.getElementById("hb-dash-diff-chart");
    if (!canvas || !window.Chart) return;

    const labels = shifts.map((h) => new Date(h.created_at).toLocaleDateString("mn-MN", { month: "short", day: "numeric" }));
    const diffs = shifts.map((h) => Number(h.total_diff || 0));
    const colors = diffs.map((d) => (d > 0 ? "#3fedb5" : d < 0 ? "#ff2b6e" : "#86a0c4"));

    if (this.diffChart) this.diffChart.destroy();

    if (!shifts.length) {
      const ctx2d = canvas.getContext("2d");
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    this.diffChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: "Нийт зөрүү (₮)", data: diffs, backgroundColor: colors, borderRadius: 4 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: "#86a0c4", callback: (v) => v.toLocaleString("mn-MN") }, grid: { color: "rgba(34,58,94,0.4)" } },
          x: { ticks: { color: "#86a0c4" }, grid: { color: "rgba(34,58,94,0.25)" } },
        },
      },
    });
  },

  renderShiftsTable(shifts) {
    const body = document.getElementById("hb-dash-shifts-body");
    body.innerHTML = shifts.length
      ? shifts
          .map((h) => {
            const who = (h.profiles && (h.profiles.full_name || h.profiles.email)) || "—";
            const diffTxt = h.total_diff == null ? "—" : this.formatDiffText(h.total_diff);
            const diffCls = h.total_diff == null ? "diff-even" : Number(h.total_diff) > 0 ? "diff-surplus" : Number(h.total_diff) < 0 ? "diff-shortage" : "diff-even";
            return `
          <tr>
            <td>${new Date(h.created_at).toLocaleString("mn-MN")}</td>
            <td>${who}</td>
            <td>${this.formatMoney(h.revenue)}</td>
            <td class="${diffCls}">${diffTxt}</td>
          </tr>
        `;
          })
          .join("")
      : `<tr><td colspan="4" class="muted">Ээлж хүлээлцсэн бүртгэл алга</td></tr>`;
  },

  formatDiffText(diff) {
    const rounded = Math.round(diff);
    if (rounded === 0) return "Тэнцсэн";
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded.toLocaleString("mn-MN")}₮`;
  },

  formatMoney(n) {
    return Math.round(n || 0).toLocaleString("mn-MN") + "₮";
  },
};

document.addEventListener("DOMContentLoaded", () => HB_Dashboard.init());
