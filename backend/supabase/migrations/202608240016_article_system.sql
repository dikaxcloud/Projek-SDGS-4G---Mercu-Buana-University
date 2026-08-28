-- Migration: Real article system (categories, thumbnails, archive state,
-- public read RPCs) + richer seed content. Additive only.

alter table public.health_articles add column if not exists category text;
alter table public.health_articles add column if not exists thumbnail_url text;
alter table public.health_articles add column if not exists is_archived boolean not null default false;

-- Categorize existing seeds
update public.health_articles set category = 'Tekanan Darah' where slug = 'menjaga-tekanan-darah' and category is null;
update public.health_articles set category = 'Pola Makan' where slug = 'piring-makan-seimbang' and category is null;
update public.health_articles set category = 'Pertolongan Pertama' where slug = 'kapan-hubungi-petugas' and category is null;

-- ============================================================
-- Seed: richer educational articles (idempotent by slug)
-- ============================================================
insert into public.health_articles (title, slug, summary, content, is_published, category) values
('Memahami Tekanan Darah', 'memahami-tekanan-darah', 'Apa itu angka sistolik dan diastolik, dan kapan sebaiknya memeriksa.', $c$Tekanan darah adalah tekanan darah pada dinding pembuluh nadi ketika jantung berdenyut dan beristirahat.

Dua angka yang biasa tercantum:
• Angka pertama (sistolik): tekanan saat jantung memompa darah.
• Angka kedua (diastolik): tekanan saat jantung beristirahat.

Sebagai acuan umum dewasa:
• Di bawah 120/80 mmHg tergolong baik.
• 120-139 atau 80-89 mmHg sebaiknya mulai dipantau.
• 140/90 mmHg ke atas sebaiknya dikonsultasikan dengan tenaga kesehatan.

Cara mengukur yang baik: istirahat 5 menit sebelum diukur, duduk tegak, kaki tidak menyilang, dan ukur pada jam yang sama setiap kali.

Kapan perlu memeriksa? Lakukan pemeriksaan rutin di posyandu atau poskesdes, terlebih bila keluarga ada riwayat tekanan darah tinggi.

Informasi ini bersifat edukatif. Untuk kondisi Anda secara pribadi, silakan berkonsultasi dengan tenaga kesehatan.$c$, true, 'Tekanan Darah'),
('Mengenal Gula Darah', 'mengenal-gula-darah', 'Sewaktu, puasa, dan setelah makan — apa bedanya?', $c$Gula darah adalah kadar glukosa dalam darah, sumber energi utama tubuh.

Jenis pemeriksaan gula darah:
• Sewaktu: diambil kapan saja tanpa memandang waktu makan.
• Puasa: diambil setelah berpuasa 8 jam (biasanya pagi sebelum sarapan).
• Setelah makan: diambil 2 jam setelah makan.

Nilai yang lebih tinggi dari acuan pada pemeriksaan puasa maupun sewaktu sebaiknya dipantau ulang dan dibicarakan dengan petugas kesehatan, terutama bila disertai rasa haus berlebihan, sering lemas, atau sering buang air kecil.

Tips membantu menjaga kadar gula darah:
• Kurangi minuman manis dan jajanan tinggi gula.
• Pilih karbohidrat kompleks seperti nasi merah atau jagung.
• Bergerak aktif minimal 30 menit setiap hari.

Informasi ini bersifat edukatif dan bukan diagnosis. Konsultasikan hasil pemeriksaan Anda dengan tenaga kesehatan.$c$, true, 'Gula Darah'),
('Aktivitas Fisik Ringan untuk Semua', 'aktivitas-fisik-ringan', 'Bergerak 30 menit sehari bisa dimulai dari hal sederhana.', $c$Tubuh yang aktif membantu menjaga berat badan, gula darah, dan suasana hati.

Aktivitas ringan yang mudah dilakukan warga desa:
• Jalan kaki pagi mengelilingi kampung selama 20-30 menit.
• Berkebun atau menyiram tanaman.
• Naik tangga daripada lift bila tersedia.
• Senam bersama di balai desa atau posyandu.

Mulailah pelan-pelan. Yang penting konsisten setiap hari, bukan berat sekali sebulan.

Hentikan aktivitas dan istirahat bila merasa pusing atau sesak napas, lalu ceritakan kepada petugas kesehatan.

Informasi ini bersifat edukatif.$c$, true, 'Aktivitas Fisik'),
('Menjaga Kesehatan Lansia', 'kesehatan-lansia', 'Perawatan sederhana untuk ayah, ibu, dan kakek-nenek kita.', $c$Lansia (warga lanjut usia) membutuhkan perhatian lebih dalam keseharian.

Yang bisa dilakukan keluarga:
• Temani jalan kaki ringan setiap pagi.
• Sajikan makanan bergizi lunak, kurangi garam dan gula.
• Ingatkan minum air putih meski tidak haus.
• Pastikan pemeriksaan rutin: tensi, gula darah, dan berat badan.
• Ajak bercerita; kesehatan jiwa juga penting.

Waspada tanda yang perlu segera dibicarakan dengan petugas: bicara pelo tiba-tiba, lemah di satu sisi tubuh, jatuh berulang, atau nyeri dada.

Informasi ini bersifat edukatif. Untuk keluhan khusus lansia, silakan konsultasikan dengan tenaga kesehatan.$c$, true, 'Kesehatan Lansia'),
('Imunisasi dan Kesehatan Anak', 'imunisasi-kesehatan-anak', 'Lindungi si kecil sejak dini melalui imunisasi lengkap.', $c$Imunisasi melindungi anak dari penyakit berbahaya sebelum tubuhnya siap melawan sendiri.

Yang perlu orang tua ingat:
• Bawa buku KIA setiap kunjungan posyandu.
• Imunisasi dasar lengkap sesuai jadwal di buku KIA.
• Catat pertumbuhan: berat badan dan tinggi badan tiap bulan.
• Berikan ASI eksklusif sesuai anjuran tenaga kesehatan.

Kapan harus segera ke petugas? Anak demam tinggi, tidak mau menyusu atau makan, diare terus-menerus, atau tampak sangat lesu.

Informasi ini bersifat edukatif. Ikuti arahan kader posyandu dan tenaga kesehatan untuk kondisi anak Anda.$c$, true, 'Kesehatan Anak'),
('Pertolongan Pertama Luka Ringan', 'pertolongan-pertama-luka', 'Langkah aman membersihkan dan menutup luka sebelum ke petugas.', $c$Luka ringan bisa ditangani di rumah dengan langkah yang benar:

1. Cuci tangan Anda terlebih dahulu.
2. Bilas luka dengan air mengalir yang bersih.
3. Bersihkan sekitar luka dengan sabun, hindari menyabun langsung ke dalam luka.
4. Tutup dengan kasa atau plester bersih.

Yang TIDAK boleh dilakukan:
• Jangan olesi kopi, daun, atau minyak panas pada luka.
• Jangan mengikat terlalu kuat untuk menghentikan darah.

Segera hubungi petugas kesehatan bila: luka dalam, darah tidak berhenti, luka karena benda berkarat, atau ada demam setelah luka.

Informasi ini bersifat edukatif, bukan pengganti pertolongan medis.$c$, true, 'Pertolongan Pertama'),
('Cuci Tangan: Pencegahan Paling Mudah', 'cuci-tangan-cegah-penyakit', 'Tujuh langkah cuci tangan melindungi satu keluarga.', $c$Banyak penyakit datang dari tangan yang tidak dicuci: diare, flu, hingga sakit perut pada anak.

Enam momen wajib cuci tangan:
• Sebelum makan dan menyiapkan makanan.
• Setelah dari toilet.
• Setelah mengurus anak.
• Setelah berternak atau berkebun.
• Setelah memegang uang.
• Saat tangan terlihat kotor.

Cara benar: basahi dengan air mengalir, gunakan sabun, gosok sela-sela jari, punggung tangan, dan kuku selama minimal 20 detik, lalu keringkan.

Informasi ini bersifat edukatif.$c$, true, 'Pencegahan Penyakit'),
('Rutin ke Posyandu, Kenapa Penting?', 'jadwal-posyandu-rutin', 'Pemeriksaan rutin menemukan masalah sebelum jadi berat.', $c$Posyandu bukan hanya untuk bayi — lansia dan dewasa juga bisa memeriksakan diri.

Manfaat pemeriksaan rutin:
• Menemukan perubahan kesehatan sedini mungkin.
• Mencatat tren tensi, gula darah, dan berat badan dari bulan ke bulan.
• Mendapatkan edukasi langsung dari kader dan nakes.
• Menghubungkan warga dengan puskesmas bila perlu rujukan.

Simpan hasil pemeriksaan Anda di aplikasi ini agar tren kesehatan dapat dipantau dari HP.

Informasi ini bersifat edukatif.$c$, true, 'Pemeriksaan Rutin'),
('Satu Keluarga Sehat, Satu Desa Kuat', 'keluarga-sehat-bersama', 'Kebiasaan sehat paling mudah dibangun bersama-sama di rumah.', $c$Keluarga adalah tempat kebiasaan sehat dimulai.

Ide sederhana untuk keluarga:
• Masak bersama dengan sayur lebih banyak dan garam lebih sedikit.
• Jadikan jalan sore sebagai rutinitas keluarga.
• Ganti camilan manis dengan buah musiman.
• Tidur dan bangun di waktu yang sama.
• Periksa kesehatan anggota keluarga secara berkala, catat di aplikasi.

Bila salah satu anggota keluarga memiliki nilai pemeriksaan yang perlu dipantau, dukung dia dengan pola makan bersama, bukan diet sendiri-sendiri.

Informasi ini bersifat edukatif.$c$, true, 'Kesehatan Keluarga')
on conflict (slug) do nothing;

-- ============================================================
-- Public article RPCs (anon callable)
-- ============================================================
create or replace function public.get_public_articles(p_category text default '')
returns table (article_id uuid, title text, slug text, summary text, category text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cat text := left(trim(coalesce(p_category, '')), 40);
begin
  return query
  select a.article_id, a.title, a.slug, a.summary, a.category, a.updated_at
  from public.health_articles a
  where a.is_published and not a.is_archived
    and (v_cat = '' or a.category = v_cat)
  order by a.updated_at desc;
end; $$;

create or replace function public.get_public_article_by_slug(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_slug text := left(trim(coalesce(p_slug, '')), 120);
  v_article jsonb;
  v_related jsonb;
  v_cat text;
begin
  select to_jsonb(a), a.category into v_article, v_cat
  from public.health_articles a
  where a.slug = v_slug and a.is_published and not a.is_archived;
  if v_article is null then
    raise exception using errcode = '22023', message = 'Artikel tidak ditemukan.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'slug', x.slug, 'summary', x.summary) order by x.updated_at desc), '[]'::jsonb)
    into v_related
  from (select * from public.health_articles where is_published and not is_archived and slug <> v_slug and category = v_cat order by updated_at desc limit 3) x;
  return jsonb_build_object('article', v_article, 'related', v_related);
end; $$;

-- ============================================================
-- Staff article management with category/thumbnail/archive
-- ============================================================
create or replace function public.admin_create_article(p_title text, p_slug text, p_summary text, p_content text, p_is_published boolean default false, p_category text default null, p_thumbnail_url text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_title, ''))) not between 1 and 160 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(trim(coalesce(p_summary, ''))) not between 1 and 300 or length(trim(coalesce(p_content, ''))) not between 1 and 20000 then raise exception using errcode = '22023', message = 'Data informasi kesehatan tidak valid.'; end if;
  insert into public.health_articles(title, slug, summary, content, is_published, category, thumbnail_url, author_user_id) values (trim(p_title), lower(trim(p_slug)), trim(p_summary), trim(p_content), coalesce(p_is_published, false), nullif(trim(coalesce(p_category, '')), ''), nullif(trim(coalesce(p_thumbnail_url, '')), ''), auth.uid()) returning article_id into v_id;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'create', 'health_article', v_id, jsonb_build_object('is_published', coalesce(p_is_published, false)));
  return jsonb_build_object('status', 'created', 'article_id', v_id);
exception when unique_violation then raise exception using errcode = '23505', message = 'Slug sudah digunakan.';
end; $$;

create or replace function public.admin_update_article(p_article_id uuid, p_title text, p_slug text, p_summary text, p_content text, p_is_published boolean default false, p_category text default null, p_thumbnail_url text default null, p_is_archived boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_guard();
  if length(trim(coalesce(p_title, ''))) not between 1 and 160 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(trim(coalesce(p_summary, ''))) not between 1 and 300 or length(trim(coalesce(p_content, ''))) not between 1 and 20000 then raise exception using errcode = '22023', message = 'Data informasi kesehatan tidak valid.'; end if;
  update public.health_articles set title = trim(p_title), slug = lower(trim(p_slug)), summary = trim(p_summary), content = trim(p_content), is_published = coalesce(p_is_published, false), category = nullif(trim(coalesce(p_category, '')), ''), thumbnail_url = nullif(trim(coalesce(p_thumbnail_url, '')), ''), is_archived = coalesce(p_is_archived, false), updated_at = now() where article_id = p_article_id;
  if not found then raise exception using errcode = '22023', message = 'Informasi kesehatan tidak ditemukan.'; end if;
  insert into public.audit_logs(actor_user_id, action, entity, entity_id, metadata) values (auth.uid(), 'update', 'health_article', p_article_id, jsonb_build_object('is_published', coalesce(p_is_published, false), 'is_archived', coalesce(p_is_archived, false)));
  return jsonb_build_object('status', 'updated');
exception when unique_violation then raise exception using errcode = '23505', message = 'Slug sudah digunakan.';
end; $$;

-- Extend admin article listing with new fields
drop function if exists public.list_admin_articles(text);
create function public.list_admin_articles(p_query text default '')
returns table (article_id uuid, title text, slug text, summary text, content text, is_published boolean, is_archived boolean, category text, thumbnail_url text, author_user_id uuid, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_query text := left(trim(coalesce(p_query, '')), 60);
begin
  perform public.admin_guard();
  return query select a.article_id, a.title, a.slug, a.summary, a.content, a.is_published, a.is_archived, a.category, a.thumbnail_url, a.author_user_id, a.created_at, a.updated_at
  from public.health_articles a where (v_query = '' or a.title ilike '%' || v_query || '%') and not coalesce(a.is_archived, false) order by a.updated_at desc;
end; $$;

-- ============================================================
-- Grants
-- ============================================================
revoke all on function public.get_public_articles(text) from public;
revoke all on function public.get_public_article_by_slug(text) from public;
revoke all on function public.admin_create_article(text, text, text, text, boolean, text, text) from public;
revoke all on function public.admin_update_article(uuid, text, text, text, text, boolean, text, text, boolean) from public;
revoke all on function public.list_admin_articles(text) from public;

grant execute on function public.get_public_articles(text) to anon, authenticated;
grant execute on function public.get_public_article_by_slug(text) to anon, authenticated;
grant execute on function public.admin_create_article(text, text, text, text, boolean, text, text) to authenticated;
grant execute on function public.admin_update_article(uuid, text, text, text, text, boolean, text, text, boolean) to authenticated;
grant execute on function public.list_admin_articles(text) to authenticated;
