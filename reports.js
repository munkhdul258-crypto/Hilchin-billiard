// Орлогын тайлан, статистикийн хуудас

const HB_Reports = {
  chart: null,

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

    this.applyPreset("today");
  },

  applyPreset(preset) {
    const now = new Date();
    let from, to;
    to = new Date(now);
    to.setHours(23, 59, 59, 999);

    if (preset === "today") {
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
    } else if (preset === "week") {
      from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
    } else if (preset === "month") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    document.getElementById("hb-from").value = this.toInputDate(from);
    document.getElementById("hb-to").value = this.toInputDate(to);
    this.load();
  },

  toInputDate(d) {
    return d.toISOString().slice(0, 10);
  },

  async load() {
    const fromVal = document.getElementById("hb-from").value;
    const toVal = document.getElementById("hb-to").value;
    if (!fromVal || !toVal) return;

    const from = new Date(fromVal + "T00:00:00");
    const to = new Date(toVal + "T23:59:59.999");

    const { data: sessions, error } = await window.supabaseClient
      .from("sessions")
      .select("*, billiard_tables(name)")
      .eq("status", "completed")
      .gte("ended_at", from.toISOString())
      .lte("ended_at", to.toISOString())
      .order("ended_at", { ascending: false });

    if (error) {
      alert("Тайлан ачаалахад алдаа гарлаа: " + error.message);
      return;
    }

    this.renderSummary(sessions || []);
    this.renderByTable(sessions || []);
    this.renderHistory(sessions || []);
    this.renderChart(sessions || [], from, to);
  },

  renderSummary(sessions) {
    const totalRevenue = sessions.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalSessions = sessions.length;
    const totalMinutes = sessions.reduce((sum, s) => {
      const start = new Date(s.started_at).getTime();
      const end = new Date(s.ended_at).getTime();
      return sum + (end - start) / 60000;
    }, 0);

    document.getElementById("hb-stat-revenue").textContent = this.formatMoney(totalRevenue);
    document.getElementById("hb-stat-sessions").textContent = totalSessions;
    document.getElementById("hb-stat-hours").textContent = (totalMinutes / 60).toFixed(1) + " ц";
    document.getElementById("hb-stat-avg").textContent = this.formatMoney(
      totalSessions ? totalRevenue / totalSessions : 0
    );
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
          .map(
            ([name, v]) => `
        <tr>
          <td>${name}</td>
          <td>${v.count}</td>
          <td>${this.formatMoney(v.revenue)}</td>
        </tr>`
          )
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
            <td>${this.formatMoney(s.total_amount)}</td>
          </tr>`;
          })
          .join("")
      : `<tr><td colspan="4" class="muted">Мэдээлэл алга</td></tr>`;
  },

  renderChart(sessions, from, to) {
    const canvas = document.getElementById("hb-chart");
    if (!canvas || !window.Chart) return;

    const dayMs = 24 * 60 * 60 * 1000;
    const days = [];
    for (let t = new Date(from).setHours(0, 0, 0, 0); t <= to.getTime(); t += dayMs) {
      days.push(new Date(t));
    }

    const totals = days.map((day) => {
      const dayStr = day.toDateString();
      return sessions
        .filter((s) => new Date(s.ended_at).toDateString() === dayStr)
        .reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    });

    const labels = days.map((d) => d.toLocaleDateString("mn-MN", { month: "short", day: "numeric" }));

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Өдрийн орлого (₮)",
            data: totals,
            backgroundColor: "#2563eb",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => v.toLocaleString("mn-MN") } },
        },
      },
    });
  },

  formatMoney(n) {
    return Math.round(n).toLocaleString("mn-MN") + "₮";
  },
};

document.addEventListener("DOMContentLoaded", () => HB_Reports.init());
