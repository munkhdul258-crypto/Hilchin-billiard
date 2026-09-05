// Нэвтрэлт болон хуудас хамгаалалттай холбоотой нийтлэг функцууд.
// Бүх хамгаалагдсан хуудас (index, reports, staff) энэ файлыг ачаална.

const HB_Auth = {
  currentUser: null,
  currentProfile: null,

  /**
   * Хуудас ачаалахад session шалгаж, байхгүй бол login.html руу
   * шилжүүлнэ. Байвал profile-ийг (нэр, role) татаж буцаана.
   */
  async requireAuth() {
    const {
      data: { session },
    } = await window.supabaseClient.auth.getSession();

    if (!session) {
      window.location.href = "login.html";
      return null;
    }

    this.currentUser = session.user;

    const { data: profile, error } = await window.supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (error) {
      console.error("Profile татахад алдаа гарлаа:", error);
    }
    this.currentProfile = profile || null;
    return { user: this.currentUser, profile: this.currentProfile };
  },

  /** Зөвхөн админд зориулсан хуудсыг хамгаална. */
  async requireAdmin() {
    const ctx = await this.requireAuth();
    if (!ctx) return null;
    if (!ctx.profile || ctx.profile.role !== "admin") {
      alert("Энэ хуудас зөвхөн админд зориулагдсан.");
      window.location.href = "index.html";
      return null;
    }
    return ctx;
  },

  async signOut() {
    await window.supabaseClient.auth.signOut();
    window.location.href = "login.html";
  },

  /** Нийтлэг navbar-ийг DOM дотор render хийнэ. */
  renderNavbar(activePage) {
    const el = document.getElementById("hb-navbar");
    if (!el) return;

    const isAdmin = this.currentProfile && this.currentProfile.role === "admin";
    const name =
      (this.currentProfile && this.currentProfile.full_name) ||
      (this.currentUser && this.currentUser.email) ||
      "";

    const link = (href, label, key) =>
      `<a href="${href}" class="nav-link ${activePage === key ? "active" : ""}">${label}</a>`;

    el.innerHTML = `
      <div class="nav-inner">
        <div class="nav-brand"><img src="logo.png?v=21" alt="Хилчин Биллиард" class="nav-logo" /> Хилчин Биллиард</div>
        <button type="button" id="hb-nav-toggle" class="nav-toggle" aria-label="Цэс">☰</button>
        <nav class="nav-links" id="hb-nav-links">
          ${link("index.html", "Ширээ", "tables")}
          ${link("orders.html", "Захиалга", "orders")}
          ${link("inventory.html", "Бараа материал", "inventory")}
          ${link("debts.html", "Зээл", "debts")}
          ${link("shift.html", "Ээлж", "shift")}
          ${link("reports.html", "Тайлан", "reports")}
          ${isAdmin ? link("dashboard.html", "Хянах самбар", "dashboard") : ""}
          ${isAdmin ? link("staff.html", "Ажилтан", "staff") : ""}
          ${isAdmin ? link("audit.html", "Аудит", "audit") : ""}
        </nav>
        <div class="nav-user">
          <div class="nav-bell-wrap"><button id="hb-bell-btn" class="nav-bell">🔔<span id="hb-bell-dot" class="nav-bell-dot hidden">0</span></button><div id="hb-bell-panel" class="nav-bell-panel hidden"></div></div>
          <span class="nav-user-name">${name}${isAdmin ? " · admin" : ""}</span>
          <button id="hb-logout-btn" class="btn btn-ghost btn-sm">Гарах</button>
        </div>
      </div>
    `;

    document.getElementById("hb-logout-btn").addEventListener("click", () => this.signOut());

    const navToggle = document.getElementById("hb-nav-toggle");
    const navLinks = document.getElementById("hb-nav-links");
    if (navToggle && navLinks) {
      navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
      navLinks.querySelectorAll(".nav-link").forEach((a) =>
        a.addEventListener("click", () => navLinks.classList.remove("open"))
      );
    }

    this.initBell(isAdmin);
  },

  /**
   * Bell: бүх ажилтанд admin-ийн илгээсэн мэдэгдэл харагдана.
   * Admin-д нэмээд хүлээгдэж буй барааны хүсэлт + хугацаа хэтэрсэн зээл харагдана.
   */
  async initBell(isAdmin) {
    const refresh = async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const queries = [
        window.supabaseClient
          .from("announcements")
          .select("id, message, created_at")
          .eq("active", true)
          .order("created_at", { ascending: false })
          .limit(10),
        window.supabaseClient
          .from("sessions")
          .select("id, started_at, planned_hours, billiard_tables(name)")
          .eq("status", "active")
          .not("planned_hours", "is", null),
        window.supabaseClient
          .from("customer_orders")
          .select("id, table_id, billiard_tables(name)")
          .eq("status", "pending"),
      ];
      if (isAdmin) {
        queries.push(
          window.supabaseClient.from("stock_requests").select("id, product_name").eq("status", "pending"),
          window.supabaseClient
            .from("debts")
            .select("id, customer_name, due_date")
            .eq("status", "unpaid")
            .lt("due_date", todayStr)
        );
      }

      const results = await Promise.all(queries);
      const announcements = results[0].data || [];
      const overdueSessions = (results[1].data || []).filter((s) => {
        if (!s.planned_hours) return false;
        const elapsedHours = (Date.now() - new Date(s.started_at).getTime()) / 3600000;
        return elapsedHours >= s.planned_hours;
      });
      const pendingOrders = results[2].data || [];
      const pendingStock = isAdmin ? results[3].data || [] : [];
      const overdueDebts = isAdmin ? results[4].data || [] : [];

      const count =
        announcements.length + overdueSessions.length + pendingOrders.length + pendingStock.length + overdueDebts.length;
      const dot = document.getElementById("hb-bell-dot");
      const panel = document.getElementById("hb-bell-panel");
      if (!dot || !panel) return;

      if (count > 0) {
        dot.textContent = count;
        dot.classList.remove("hidden");
      } else {
        dot.classList.add("hidden");
      }

      const items = [];
      announcements.forEach((a) => items.push(`<div class="bell-item">📢 ${a.message}</div>`));
      overdueSessions.forEach((s) =>
        items.push(
          `<div class="bell-item">⏰ <a href="index.html">${s.billiard_tables ? s.billiard_tables.name : "Ширээ"}</a> — захиалсан цаг дууссан</div>`
        )
      );
      pendingOrders.forEach((o) =>
        items.push(
          `<div class="bell-item">🧾 <a href="orders.html">${o.billiard_tables ? o.billiard_tables.name : "Ширээ"}</a> — шинэ захиалга ирлээ</div>`
        )
      );
      pendingStock.forEach((r) =>
        items.push(`<div class="bell-item">📦 <a href="inventory.html">${r.product_name}</a> — хүсэлт хүлээгдэж байна</div>`)
      );
      overdueDebts.forEach((d) =>
        items.push(`<div class="bell-item">⏰ <a href="debts.html">${d.customer_name}</a> — зээлийн хугацаа хэтэрсэн</div>`)
      );
      panel.innerHTML = items.length
        ? items.join("")
        : `<div class="bell-item muted">Мэдэгдэл алга</div>`;
    };

    await refresh();
    setInterval(refresh, 30000);

    const bellBtn = document.getElementById("hb-bell-btn");
    const panel = document.getElementById("hb-bell-panel");
    if (bellBtn && panel) {
      bellBtn.addEventListener("click", () => panel.classList.toggle("hidden"));
      document.addEventListener("click", (e) => {
        if (!bellBtn.contains(e.target) && !panel.contains(e.target)) panel.classList.add("hidden");
      });
    }

    window.supabaseClient
      .channel("hb-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_requests" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "debts" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_orders" }, refresh)
      .subscribe();
  },
};
