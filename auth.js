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
        <div class="nav-brand">🎱 Hilchin Billiard</div>
        <nav class="nav-links">
          ${link("index.html", "Ширээ", "tables")}
          ${link("reports.html", "Тайлан", "reports")}
          ${isAdmin ? link("staff.html", "Ажилтан", "staff") : ""}
        </nav>
        <div class="nav-user">
          <span class="nav-user-name">${name}${isAdmin ? " · admin" : ""}</span>
          <button id="hb-logout-btn" class="btn btn-ghost btn-sm">Гарах</button>
        </div>
      </div>
    `;

    document
      .getElementById("hb-logout-btn")
      .addEventListener("click", () => this.signOut());
  },
};
