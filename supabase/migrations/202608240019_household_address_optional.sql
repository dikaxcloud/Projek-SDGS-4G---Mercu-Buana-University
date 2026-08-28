-- Migration: allow optional address on households (UI treats address as optional).
alter table public.households alter column address drop not null;
