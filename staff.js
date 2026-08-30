// Ажилтны эрх удирдах хуудас (зөвхөн admin)

const HB_Staff = {
  async init() {
    const ctx = await HB_Auth.requireAdmin();
    if (!ctx) return;
    HB_Auth.renderNavbar("staff");
    document.getElementById("hb-announce-form").addEventListener("submit", (e) => this.handleAnnounce(e));
    await this.load();
    await this.loadAnnouncements();
  },

  async load() {
    const { data: profiles, error } = await window.supabaseClient
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      alert("Ажилтны жагсаалт татахад алдаа гарлаа: " + error.message);
      return;
    }

    const tbody = document.getElementById("hb-staff-body");
    tbody.innerHTML = (profiles || [])
      .map(
        (p) => `
      <tr>
        <td>${p.full_name || "—"}</td>
        <td>${p.email || "—"}</td>
        <td>
          <select data-id="${p.id}" class="role-select" ${
          p.id === HB_Auth.currentUser.id ? "disabled" : ""
        }>
            <option value="staff" ${p.role === "staff" ? "selected" : ""}>Ажилтан</option>
            <option value="admin" ${p.role === "admin" ? "selected" : ""}>Админ</option>
          </select>
        </td>
        <td>${new Date(p.created_at).toLocaleDateString("mn-MN")}</td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll(".role-select").forEach((sel) => {
      sel.addEventListener("change", () => this.updateRole(sel.dataset.id, sel.value));
    });
  },

  async updateRole(id, role) {
    const { error } = await window.supabaseClient
      .from("profiles")
      .update({ role })
      .eq("id", id);

    if (error) {
      alert("Эрх солиход алдаа гарлаа: " + error.message);
      return;
    }
    await this.load();
  },

  async loadAnnouncements() {
    const { data, error } = await window.supabaseClient
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return console.error(error);

    const tbody = document.getElementById("hb-announce-body");
    tbody.innerHTML = (data || []).length
      ? data
          .map(
            (a) => `
        <tr>
          <td>${a.message}</td>
          <td>${new Date(a.created_at).toLocaleString("mn-MN")}</td>
          <td><span class="status-pill ${a.active ? "status-approved" : "status-rejected"}">${a.active ? "Идэвхтэй" : "Идэвхгүй"}</span></td>
          <td>${a.active ? `<button class="btn btn-ghost btn-sm" data-deactivate="${a.id}">Идэвхгүй болгох</button>` : ""}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="4" class="muted">Мэдэгдэл алга</td></tr>`;

    tbody.querySelectorAll("[data-deactivate]").forEach((btn) => {
      btn.addEventListener("click", () => this.deactivateAnnouncement(btn.dataset.deactivate));
    });
  },

  async handleAnnounce(e) {
    e.preventDefault();
    const message = document.getElementById("hb-announce-text").value.trim();
    if (!message) return;

    const { error } = await window.supabaseClient.from("announcements").insert({
      message,
      created_by: HB_Auth.currentUser.id,
    });

    if (error) return alert("Мэдэгдэл илгээхэд алдаа гарлаа: " + error.message);

    e.target.reset();
    await this.loadAnnouncements();
  },

  async deactivateAnnouncement(id) {
    const { error } = await window.supabaseClient.from("announcements").update({ active: false }).eq("id", id);
    if (error) return alert("Алдаа гарлаа: " + error.message);
    await this.loadAnnouncements();
  },
};

document.addEventListener("DOMContentLoaded", () => HB_Staff.init());
