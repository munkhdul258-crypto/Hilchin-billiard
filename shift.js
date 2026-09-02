// Ээлж хүлээлцэх хуудас: тохируулсан цагийн ээлжийн орлого/зарлага/үлдэгдлийг
// (бэлэн/дансаар задлан) нэгтгэж харуулаад, "Ээлж хаах" үед shift_handovers-т бүртгэнэ.
// v2: Кассын гар хөдөлгөөн (урьдчилгаа/бусад зохицуулалт) бүртгэж, нягтлан бодогчийн
// маягийн бэлэн/шилжүүлэг/POS зөрүүг автоматаар тооцоолно.

const HB_Shift = {
  SHIFT_START_HOUR: 10, // settings хүснэгтээс ачаалагдмагц дарагдана
  PAYMENT_LABELS: { cash: "Бэлэн мөнгө", transfer: "Дансны шилжүүлэг", pos: "POS / карт" },
  MOVEMENT_CATEGORY_LABELS: { advance: "Урьдчилгаа", other: "Бусад" },
  _rcInitialized: false,
  _movements: [],

  async init() {
    const ctx = await HB_Auth.requireAuth();
    if (!ctx) return;
    HB_Auth.renderNavbar("shift");

    this.isAdmin = ctx.profile && ctx.profile.role === "admin";

    document.getElementById("hb-shift-form").addEventListener("submit", (e) => this.handleClose(e));
    document.getElementById("hb-movement-form").addEventListener("submit", (e) => this.handleAddMovement(e));

    ["hb-rc-opening", "hb-rc-counted-cash", "hb-rc-counted-transfer", "hb-rc-counted-pos"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => this.recompute());
    });

    if (this.isAdmin) {
      document.getElementById("hb-shift-hour-wrap").classList.remove("hidden");
      document.getElementById("hb-shift-hour-form").addEventListener("submit", (e) => this.handleSaveHour(e));
      document.querySelectorAll(".admin-only").forEach((el) => el.classList.remove("hidden"));

      const detailsToggle = document.getElementById("hb-rc-details-toggle");
      const details = document.getElementById("hb-rc-details");
      if (detailsToggle && details) {
        detailsToggle.addEventListener("click", () => {
          const nowHidden = details.classList.toggle("hidden");
          detailsToggle.textContent = nowHidden ? "Дэлгэрэнгүй тооцоо ▾" : "Дэлгэрэнгүй тооцоо ▴";
        });
      }
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

    const [
      { data: sessions },
      { data: expenses },
      { data: activeSessions },
      { data: products },
      { data: history },
      { data: movements },
      { data: advances },
      { data: lastHandover },
    ] = await Promise.all([
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
      window.supabaseClient
        .from("cash_movements")
        .select("*")
        .gte("created_at", shiftStart.toISOString())
        .order("created_at", { ascending: false }),
      window.supabaseClient
        .from("cash_movements")
        .select("*")
        .eq("category", "advance")
        .eq("settled", false)
        .order("created_at", { ascending: true }),
      window.supabaseClient.from("shift_handovers").select("counted_cash").order("created_at", { ascending: false }).limit(1).maybeSingle(),
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
    this._movements = movements || [];

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

    this.renderMovements();
    this.renderAdvances(advances || []);

    if (!this._rcInitialized) {
      const openingDefault = lastHandover && lastHandover.counted_cash != null ? Number(lastHandover.counted_cash) : 0;
      document.getElementById("hb-rc-opening").value = openingDefault;
      document.getElementById("hb-rc-counted-transfer").value = byPayment.transfer || 0;
      document.getElementById("hb-rc-counted-pos").value = byPayment.pos || 0;
      this._rcInitialized = true;
    }
    this.recompute();

    const historyBody = document.getElementById("hb-shift-history-body");
    historyBody.innerHTML = (history || []).length
      ? history
          .map((h) => {
            const cashDiffTxt = h.cash_diff != null ? this.formatDiffText(h.cash_diff) : "—";
            const totalDiffTxt = h.total_diff != null ? this.formatDiffText(h.total_diff) : "—";
            return `
        <tr>
          <td>${new Date(h.created_at).toLocaleString("mn-MN")}</td>
          <td>${(h.profiles && (h.profiles.full_name || h.profiles.email)) || "—"}</td>
          <td>${this.formatMoney(h.revenue)}</td>
          <td>${this.formatMoney(h.expense)}</td>
          <td>${this.formatMoney(h.net)}</td>
          <td class="${this.diffClass(h.cash_diff)}">${cashDiffTxt}</td>
          <td class="${this.diffClass(h.total_diff)}">${totalDiffTxt}</td>
          <td>${h.note || "—"}</td>
        </tr>`;
          })
          .join("")
      : `<tr><td colspan="8" class="muted">Ээлж хүлээлцсэн бүртгэл алга</td></tr>`;
  },

  renderMovements() {
    const body = document.getElementById("hb-movements-body");
    body.innerHTML = this._movements.length
      ? this._movements
          .map(
            (m) => `
          <tr>
            <td>${new Date(m.created_at).toLocaleDateString("mn-MN")}</td>
            <td>${m.direction === "out" ? "Гарсан" : "Орсон"}</td>
            <td>${this.PAYMENT_LABELS[m.payment_method] || m.payment_method}</td>
            <td>${m.person_name || "—"}</td>
            <td>${m.reason || "—"}</td>
            <td>${this.formatMoney(m.amount)}</td>
            <td><button type="button" class="btn btn-ghost btn-sm" data-action="del-mv" data-id="${m.id}">Устгах</button></td>
          </tr>
        `
          )
          .join("")
      : `<tr><td colspan="7" class="muted">Хөдөлгөөн алга.</td></tr>`;

    body.querySelectorAll('[data-action="del-mv"]').forEach((btn) =>
      btn.addEventListener("click", () => this.deleteMovement(btn.dataset.id))
    );
  },

  renderAdvances(advances) {
    const wrap = document.getElementById("hb-advances-wrap");
    if (!advances.length) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");

    const body = document.getElementById("hb-advances-body");
    body.innerHTML = advances
      .map(
        (a) => `
      <tr>
        <td>${new Date(a.created_at).toLocaleDateString("mn-MN")}</td>
        <td>${a.person_name || "—"}</td>
        <td>${a.reason || "—"}</td>
        <td>${this.formatMoney(a.amount)}</td>
        <td><button type="button" class="btn btn-primary btn-sm" data-action="settle" data-id="${a.id}">Барагдсан</button></td>
      </tr>
    `
      )
      .join("");

    body.querySelectorAll('[data-action="settle"]').forEach((btn) =>
      btn.addEventListener("click", () => this.settleAdvance(btn.dataset.id))
    );
  },

  async handleAddMovement(e) {
    e.preventDefault();
    const direction = document.getElementById("hb-mv-direction").value;
    const category = document.getElementById("hb-mv-category").value;
    const paymentMethod = document.getElementById("hb-mv-method").value;
    const amount = parseFloat(document.getElementById("hb-mv-amount").value);
    const personName = document.getElementById("hb-mv-person").value.trim();
    const reason = document.getElementById("hb-mv-reason").value.trim();

    if (!amount || amount <= 0) return alert("Дүн зөв оруулна уу.");

    const { error } = await window.supabaseClient.from("cash_movements").insert({
      direction,
      category,
      payment_method: paymentMethod,
      amount,
      person_name: personName || null,
      reason: reason || null,
      created_by: HB_Auth.currentUser.id,
    });

    if (error) return alert("Бүртгэхэд алдаа гарлаа: " + error.message);

    document.getElementById("hb-movement-form").reset();
    await this.load();
  },

  async deleteMovement(id) {
    if (!confirm("Энэ бүртгэлийг устгах уу?")) return;
    const { error } = await window.supabaseClient.from("cash_movements").delete().eq("id", id);
    if (error) return alert("Устгахад алдаа гарлаа: " + error.message);
    await this.load();
  },

  async settleAdvance(id) {
    if (!confirm("Энэ урьдчилгааг барагдсан гэж тэмдэглэх үү?")) return;
    const { error } = await window.supabaseClient
      .from("cash_movements")
      .update({ settled: true, settled_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return alert("Тэмдэглэхэд алдаа гарлаа: " + error.message);
    await this.load();
  },

  /** Энэ ээлжийн cash_movements-ээс тухайн төлбөрийн хэлбэрийн цэвэр (гарсан - орсон) дүнг тооцно. */
  movementNet(paymentMethod) {
    return this._movements
      .filter((m) => m.payment_method === paymentMethod)
      .reduce((sum, m) => sum + (m.direction === "out" ? Number(m.amount) : -Number(m.amount)), 0);
  },

  recompute() {
    const opening = parseFloat(document.getElementById("hb-rc-opening").value) || 0;
    const cashMvNet = this.movementNet("cash");
    const transferMvNet = this.movementNet("transfer");
    const posMvNet = this.movementNet("pos");

    const expectedCash = opening + this._byPayment.cash - this._expense - cashMvNet;
    const expectedTransfer = this._byPayment.transfer - transferMvNet;
    const expectedPos = this._byPayment.pos - posMvNet;

    document.getElementById("hb-rc-cash-rev").textContent = this.formatMoney(this._byPayment.cash);
    document.getElementById("hb-rc-expense").textContent = this.formatMoney(this._expense);
    document.getElementById("hb-rc-cash-mv").textContent = this.formatMoney(cashMvNet);
    document.getElementById("hb-rc-expected-cash").textContent = this.formatMoney(expectedCash);
    document.getElementById("hb-rc-transfer-sys").textContent = this.formatMoney(this._byPayment.transfer);
    document.getElementById("hb-rc-pos-sys").textContent = this.formatMoney(this._byPayment.pos);

    const countedCashRaw = document.getElementById("hb-rc-counted-cash").value;
    const countedTransferRaw = document.getElementById("hb-rc-counted-transfer").value;
    const countedPosRaw = document.getElementById("hb-rc-counted-pos").value;

    const countedCash = countedCashRaw === "" ? null : parseFloat(countedCashRaw);
    const countedTransfer = countedTransferRaw === "" ? null : parseFloat(countedTransferRaw);
    const countedPos = countedPosRaw === "" ? null : parseFloat(countedPosRaw);

    const cashDiff = countedCash == null ? null : countedCash - expectedCash;
    const transferDiff = countedTransfer == null ? null : countedTransfer - expectedTransfer;
    const posDiff = countedPos == null ? null : countedPos - expectedPos;

    this.setDiffEl("hb-rc-cash-diff", cashDiff);
    this.setDiffEl("hb-rc-transfer-diff", transferDiff);
    this.setDiffEl("hb-rc-pos-diff", posDiff);

    const totalDiff = cashDiff == null ? null : cashDiff + (transferDiff || 0) + (posDiff || 0);
    this.setDiffEl("hb-rc-total-diff", totalDiff);

    this._computed = { opening, expectedCash, expectedTransfer, expectedPos, countedCash, countedTransfer, countedPos, cashDiff, transferDiff, posDiff, totalDiff };
  },

  setDiffEl(id, diff) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("diff-surplus", "diff-shortage", "diff-even");
    if (diff == null) {
      el.textContent = "—";
      el.classList.add("diff-even");
      return;
    }
    el.classList.add(this.diffClass(diff));
    el.textContent = this.formatDiffText(diff);
  },

  diffClass(diff) {
    if (diff == null) return "diff-even";
    if (Math.round(diff) > 0) return "diff-surplus";
    if (Math.round(diff) < 0) return "diff-shortage";
    return "diff-even";
  },

  formatDiffText(diff) {
    const rounded = Math.round(diff);
    if (rounded === 0) return "Тэнцсэн (0₮)";
    const sign = rounded > 0 ? "+" : "";
    const label = rounded > 0 ? "Илүү" : "Дутуу";
    return `${sign}${rounded.toLocaleString("mn-MN")}₮ (${label})`;
  },

  async handleClose(e) {
    e.preventDefault();

    if (this._computed.countedCash == null) {
      return alert("Бодит тоолсон бэлэн мөнгөө оруулна уу.");
    }

    const note = document.getElementById("hb-shift-note").value.trim();

    if (!confirm("Ээлжээ хааж, дараагийн ажилтанд хүлээлгэн өгөх үү?")) return;

    const stockSnapshot = this._products.map((p) => ({
      name: p.name,
      quantity: p.quantity,
      unit: p.unit,
    }));

    const c = this._computed;
    const { error } = await window.supabaseClient.from("shift_handovers").insert({
      staff_id: HB_Auth.currentUser.id,
      shift_start: this._shiftStart.toISOString(),
      shift_end: new Date().toISOString(),
      revenue: this._revenue,
      expense: this._expense,
      net: this._revenue - this._expense,
      stock_snapshot: stockSnapshot,
      note,
      opening_cash: c.opening,
      expected_cash: c.expectedCash,
      counted_cash: c.countedCash,
      cash_diff: c.cashDiff,
      expected_transfer: c.expectedTransfer,
      counted_transfer: c.countedTransfer,
      transfer_diff: c.transferDiff,
      expected_pos: c.expectedPos,
      counted_pos: c.countedPos,
      pos_diff: c.posDiff,
      total_diff: c.totalDiff,
      cash_movements_snapshot: this._movements,
    });

    if (error) return alert("Ээлж хаахад алдаа гарлаа: " + error.message);

    alert("Ээлж амжилттай хүлээлцлээ.");
    document.getElementById("hb-shift-form").reset();
    this._rcInitialized = false;
    await this.load();
  },

  formatMoney(n) {
    return Math.round(n || 0).toLocaleString("mn-MN") + "₮";
  },
};

document.addEventListener("DOMContentLoaded", () => HB_Shift.init());
