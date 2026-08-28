-- Synthetic demo seed. NIK values are hashes/placeholders only; never use real personal data.

insert into public.rws (code, name) values ('RW 01', 'RW 01') on conflict (code) do nothing;

insert into public.rts (rw_id, code, name)
select rw_id, 'RT ' || lpad(n::text, 2, '0'), 'RT ' || lpad(n::text, 2, '0')
from public.rws cross join generate_series(1, 5) as n
on conflict (rw_id, code) do nothing;

insert into public.households (rt_id, household_number, head_name, address)
select rt_id, 'KK-' || replace(code, 'RT ', '') || '-' || lpad(n::text, 2, '0'),
       case when n % 3 = 0 then 'Slamet Haryono' when n % 3 = 1 then 'Budi Santoso' else 'Rina Wulandari' end,
       'Jalan Kenanga ' || n || ', Desa Kenanga'
from public.rts cross join generate_series(1, 10) as n
on conflict (rt_id, household_number) do nothing;

insert into public.citizens (household_id, nik_hash, nik_last4, full_name, phone, birth_date, gender, blood_type, marital_status, family_relation)
select household_id,
       encode(extensions.digest('DEMO-NIK-' || household_number || '-01', 'sha256'), 'hex'),
       lpad((row_number() over (order by household_number))::text, 4, '0'),
       head_name,
       '08' || lpad((100000000 + row_number() over (order by household_number))::text, 10, '0'),
       date '1980-01-01' + ((row_number() over (order by household_number) * 97) % 10000)::int,
       case when row_number() over (order by household_number) % 2 = 0 then 'perempuan' else 'laki-laki' end,
       case when row_number() over (order by household_number) % 4 = 0 then 'O+' when row_number() over (order by household_number) % 4 = 1 then 'A+' when row_number() over (order by household_number) % 4 = 2 then 'B+' else 'AB+' end,
       'menikah', 'kepala keluarga'
from public.households
on conflict (nik_hash) do nothing;

insert into public.health_workers (full_name, position, specialty, phone, is_online)
values
  ('Siti Rahmawati', 'Bidan Desa', 'Kesehatan ibu & anak', '081200000001', true),
  ('Dedi Prasetyo', 'Perawat Desa', 'Pemeriksaan umum', '081200000002', true),
  ('Maya Lestari', 'Kader Kesehatan', 'Posyandu & edukasi', '081200000003', false)
on conflict do nothing;

insert into public.health_articles (title, slug, summary, content, is_published)
values
  ('Cara menjaga tekanan darah tetap sehat', 'menjaga-tekanan-darah', 'Kebiasaan sederhana untuk membantu menjaga tekanan darah.', 'Kurangi garam, bergerak secara rutin, istirahat cukup, dan lakukan pemeriksaan berkala bersama tenaga kesehatan.', true),
  ('Piring makan yang lebih seimbang', 'piring-makan-seimbang', 'Panduan sederhana mengatur isi piring.', 'Isi setengah piring dengan sayur dan buah, lalu lengkapi dengan protein dan karbohidrat.', true),
  ('Kapan harus menghubungi petugas?', 'kapan-hubungi-petugas', 'Kenali kondisi yang perlu segera dibicarakan.', 'Jangan menunggu kondisi memburuk. Hubungi petugas saat gejala terasa berat atau mendadak.', true)
on conflict (slug) do nothing;

insert into public.emergency_contacts (label, phone, whatsapp_url, sort_order)
values ('Petugas kesehatan desa', '081200000001', 'https://wa.me/628120000001', 1),
       ('Kantor Desa Kenanga', '081200000010', 'https://wa.me/628120000010', 2)
on conflict do nothing;
