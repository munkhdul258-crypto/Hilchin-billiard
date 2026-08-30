// =========================================================
// Supabase холболтын тохиргоо
// Эдгээр утгыг Supabase Dashboard -> Project Settings -> API
// хуудаснаас олж, доор оруулна уу.
// "anon public" key бол клиент талд ил гарч болдог түлхүүр тул
// аюулгүй (өгөгдлийг Row Level Security хамгаална).
// =========================================================
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY",
};
