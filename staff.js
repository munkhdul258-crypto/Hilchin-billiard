// Ажилтны эрх удирдах хуудас (зөвхөн admin)

const HB_Staff = {
  async init() {
    const ctx = await HB_Auth.requireAdmin();
    if (!ctx) return;
    HB_Auth.renderNavbar("staff");
    await this.load();
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
};

document.addEventListener("DOMContentLoaded", () => HB_Staff.init());
