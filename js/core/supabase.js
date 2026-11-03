// Cliente de Supabase compartido por el QR y el panel.
// Clásico (no módulo): mismo ámbito global y mismo orden que antes.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== Consultas que aguantan internet lento =====
// Si la conexión se corta o tarda demasiado, reintenta solo (hasta 3 veces).
// Un error de la base de datos (no de red) se devuelve tal cual, sin reintentar.
