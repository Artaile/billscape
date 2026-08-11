-- Create org-assets bucket
insert into storage.buckets (id, name, public)
values ('org-assets', 'org-assets', true)
on conflict (id) do nothing;

-- Set up basic access policies for the bucket
-- Allow public access to read files
create policy "Public Access to org-assets"
on storage.objects for select
to public
using ( bucket_id = 'org-assets' );

-- Allow authenticated users to upload files to their org
create policy "Auth users can upload to org-assets"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'org-assets' );

-- Allow authenticated users to update their files
create policy "Auth users can update org-assets"
on storage.objects for update
to authenticated
using ( bucket_id = 'org-assets' );
