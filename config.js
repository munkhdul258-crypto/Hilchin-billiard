// =========================================================
// Supabase холболтын тохиргоо
// Эдгээр утгыг Supabase Dashboard -> Project Settings -> API
// хуудаснаас олж, доор оруулна уу.
// "anon public" key бол клиент талд ил гарч болдог түлхүүр тул
// аюулгүй (өгөгдлийг Row Level Security хамгаална).
// =========================================================
window.SUPABASE_CONFIG = {
  url: "https://yapumhhxrtnzwvpbforq.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhcHVtaGh4cnRuend2cGJmb3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwNTg0MzcsImV4cCI6MjEwMzYzNDQzN30.szb4_F3Px3aTmHgtHcjcMbo1KVFff0baMqVTRpZkFFM",
};
