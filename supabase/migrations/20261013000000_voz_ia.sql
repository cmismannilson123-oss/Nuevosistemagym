-- ============================================================
-- VOZ NATURAL (IA): caché de audios
-- La Edge Function "cy-voz" convierte texto en voz neuronal (OpenAI) y
-- guarda cada audio en este bucket privado. Una frase que se repite (por
-- ejemplo, la bienvenida de un socio que viene todos los días) se sirve
-- desde aquí al instante y sin costo. Solo la función (service role) entra.
-- La clave se configura como secreto de Edge Functions: OPENAI_API_KEY.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voz', 'voz', false, 2097152, array['audio/mpeg'])
on conflict (id) do nothing;
