document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await window.supabaseClient.auth.getSession();
  if (session) {
    window.location.href = "index.html";
    return;
  }

  const form = document.getElementById("hb-login-form");
  const errorEl = document.getElementById("hb-login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const email = document.getElementById("hb-email").value.trim();
    const password = document.getElementById("hb-password").value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Нэвтэрч байна...";

    const { error } = await window.supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Нэвтрэх";

    if (error) {
      errorEl.textContent = "Нэвтрэхэд алдаа гарлаа: имэйл эсвэл нууц үг буруу байна.";
      errorEl.classList.remove("hidden");
      return;
    }

    window.location.href = "index.html";
  });
});
