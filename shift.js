// Ээлж хүлээлцэх хуудас: тохируулсан цагийн ээлжийн орлого/зарлага/үлдэгдлийг
// (бэлэн/дансаар задлан) нэгтгэж харуулаад, "Ээлж хаах" үед shift_handovers-т бүртгэнэ.

const HB_Shift = {
  SHIFT_START_HOUR: 10, // settings хүснэгтээс ачаалагдмагц дарагдана
  PAYMENT_LABELS: { cash: "Бэлэн мөнгө", transfer: "Дансны шилжүүлэг", pos: "POS / карт" },

  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("shift");

    this.isAdmin = ctx.profile && ctx.profile.role === "admin";

    document.getElementById("hb-shift-form").addEventListener("submit", (e) => this.handleClose(e));

    if (this.isAdmin) {
      document.getElementById("hb-shift-hour-wrap").classList.remove("hidden");
      document.getElementById("hb-shift-hour-form").addEventListener("submit", (e) => this.handleSaveHour(e));
    }

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

    const label = document.getElementById("hb-shift-hour-label");
    if (label) label.textContent = `${String(this.SHIFT_START_HOUR).padStart(2, "0")}:00`;
    const input = document.getElementById("hb-shift-hour-input");
    if (input) input.value = this.SHIFT_START_HOUR;
  },

  async handleSaveHour(e) {
    e.preventDefault();
    const val = parseInt(document.getElementById("hb-shift-hour-input").value, 10);
    if (!Number.isFinite(val) || val < 0 || val > 23) return alert("0-23 хооронд цаг оруулна уу.");

    const { error } = await window.supabaseClient
      .from("settings")
      .update({ value: String(val), updated_by: HB_Auth.currentUser.id, updated_at: new Date().toISOString() })
      .eq("key", "shift_start_hour");

    if (error) return alert("Ээлжийн цаг хадгалахад алдаа гарлаа: " + error.message);

    alert(`Ээлж солигдох цаг ${String(val).padStart(2, "0")}:00 боллоо.`);
    await this.loadShiftHour();
    await this.load();
  },

  shiftDayStart(date) {
    const d = new Date(date);
    if (d.getHours() < this.SHIFT_START_HOUR) d.setDate(d.getDate() - 1);
    d.setHours(this.SHIFT_START_HOUR, 0, 0, 0);
    return d;
  },

  async load() {
    const shiftStart = this.shiftDayStart(new Date());
    this._shiftStart = shiftStart;

    const [{ data: sessions }, { data: expenses }, { data: activeSessions }, { data: products }, { data: history }] =
      await Promise.all([
        window.supabaseClient
          .from("sessions")
          .select("total_amount, payment_method")
          .eq("status", "completed")
          .gte("ended_at", shiftStart.toISOString()),
        window.supabaseClient.from("expenses").select("amount").gte("spent_at", shiftStart.toISOString()),
        window.supabaseClient.from("sessions").select("id").eq("status", "active"),
        window.supabaseClient.from("products").select("*").order("name", { ascending: true }),
        window.supabaseClient
          .from("shift_handovers")
          .select("*, profiles(full_name, email)")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    const revenue = (sessions || []).reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const expense = (expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const byPayment = { cash: 0, transfer: 0, pos: 0 };
    (sessions || []).forEach((s) => {
      const method = s.payment_method || "cash";
      byPayment[method] = (byPayment[method] || 0) + Number(s.total_amount || 0);
    });

    this._revenue = revenue;
    this._expense = expense;
    this._byPayment = byPayment;
    this._products = products || [];

    document.getElementById("hb-shift-revenue").textContent = this.formatMoney(revenue);
    document.getElementById("hb-shift-expense").textContent = this.formatMoney(expense);
    document.getElementById("hb-shift-net").textContent = this.formatMoney(revenue - expense);
    document.getElementById("hb-shift-active").textContent = (activeSessions || []).length;
    document.getElementById("hb-shift-cash").textContent = this.formatMoney(byPayment.cash);
    document.getElementById("hb-shift-transfer").textContent = this.formatMoney(byPayment.transfer);
    document.getElementById("hb-shift-pos").textContent = this.formatMoney(byPayment.pos);

    const rangeLabel = document.getElementById("hb-shift-range-label");
    if (rangeLabel) {
      rangeLabel.textContent = `${shiftStart.toLocaleString("mn-MN")} — одоо (ээлж ${String(this.SHIFT_START_HOUR).padStart(2, "0")}:00 цагт эхэлдэг)`;
    }

    const stockBody = document.getElementById("hb-shift-stock-body");
    stockBody.innerHTML = (products || []).length
      ? products.map((p) => `<tr><td>${p.name}</td><td>${p.quantity} ${p.unit}</td></tr>`).join("")
      : `<tr><td colspan="2" class="muted">Бараа бүртгэгдээгүй</td></tr>`;

    const historyBody = document.getElementById("hb-shift-history-body");
    historyBody.innerHTML = (history || []).length
      ? history
          .map(
            (h) => `
        <tr>
          <td>${new Date(h.created_at).toLocaleString("mn-MN")}</td>
          <td>${(h.profiles && (h.profiles.full_name || h.profiles.email)) || "—"}</td>
          <td>${this.formatMoney(h.revenue)}</td>
          <td>${this.formatMoney(h.expense)}</td>
          <td>${this.formatMoney(h.net)}</td>
          <td>${h.note || "—"}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="muted">Ээлж хүлээлцсэн бүртгэл алга</td></tr>`;
  },

  async handleClose(e) {
    e.preventDefault();
    const note = document.getElementById("hb-shift-note").value.trim();

    if (!confirm("Ээлжээ хааж, дараагийн ажилтанд хүлээлгэн өгөх үү?")) return;

    const stockSnapshot = this._products.map((p) => ({
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
    }));

    const { error } = await window.supabaseClient.from("shift_handovers").insert({
      staff_id: HB_Auth.currentUser.id,
      shift_start: this._shiftStart.toISOString(),
      shift_end: new Date().toISOString(),
      revenue: this._revenue,
      expense: this._expense,
      net: this._revenue - this._expense,
      stock_snapshot: stockSnapshot,
      note,
    });

    if (error) return alert("Ээлж хаахад алдаа гарлаа: " + error.message);

    alert("Ээлж амжилттай хүлээлцлээ.");
    document.getElementById("hb-shift-form").reset();
    await this.load();
  },

  formatMoney(n) {
    return Math.round(n || 0).toLocaleString("mn-MN") + "₮";
  },
};

document.addEventListener("DOMContentLoaded", () => HB_Shift.init());
