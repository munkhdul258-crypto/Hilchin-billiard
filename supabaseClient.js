// Supabase клиентийг нэг л удаа үүсгэж, бусад бүх js файлууд
// window.supabaseClient-ээр дамжуулан ашиглана.
(function () {
  const { url, anonKey } = window.SUPABASE_CONFIG || {};

  if (!url || !anonKey || url.includes("YOUR-PROJECT-REF")) {
    console.warn(
      "[Hilchin Billiard] Supabase тохиргоо дутуу байна. js/config.js файлыг бөглөнө үү."
    );
  }

  window.supabaseClient = window.supabase.createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
})();
