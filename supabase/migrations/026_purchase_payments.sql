create table if not exists purchase_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  purchase_id uuid not null references purchases(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  mode text not null default 'cash',
  reference text,
  notes text,
  paid_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists purchase_payments_purchase_id_idx on purchase_payments(purchase_id);
create index if not exists purchase_payments_org_id_idx on purchase_payments(organization_id);

alter table purchase_payments enable row level security;

create policy "purchase_payments_select" on purchase_payments for select
  using (organization_id in (select organization_id from my_org_ids()));

create policy "purchase_payments_insert" on purchase_payments for insert
  with check (organization_id in (select organization_id from my_org_ids()));

create policy "purchase_payments_delete" on purchase_payments for delete
  using (organization_id in (select organization_id from my_org_ids()));

-- One-time backfill: migrate existing [PAYMENT: {...}] JSON blobs out of purchases.notes
-- into real rows, then strip the tag from notes so the text field only ever holds
-- genuine user notes going forward.
do $$
declare
  rec record;
  payment_json jsonb;
  history_item jsonb;
  extracted_tag text;
begin
  for rec in
    select id, organization_id, notes
    from purchases
    where notes like '%[PAYMENT:%'
  loop
    extracted_tag := substring(rec.notes from '\[PAYMENT:\s*(\{.*?\})\s*\]');
    if extracted_tag is not null then
      begin
        payment_json := extracted_tag::jsonb;
        for history_item in select * from jsonb_array_elements(coalesce(payment_json->'history', '[]'::jsonb))
        loop
          insert into purchase_payments (organization_id, purchase_id, amount, mode, reference, paid_at)
          values (
            rec.organization_id,
            rec.id,
            coalesce((history_item->>'amount')::numeric, 0),
            coalesce(history_item->>'mode', 'cash'),
            history_item->>'ref',
            coalesce((history_item->>'date')::timestamptz, now())
          );
        end loop;
        update purchases
        set notes = nullif(trim(regexp_replace(rec.notes, '\[PAYMENT:\s*\{.*?\}\s*\]', '', 'g')), '')
        where id = rec.id;
      exception when others then
        -- Malformed tag — leave notes untouched rather than losing data silently.
        null;
      end;
    end if;
  end loop;
end $$;
