-- Storage is private. The backend uses the service_role client for upload,
-- cleanup, and signed URLs; the mobile app never accesses this role directly.
create policy visit_photos_service_insert on storage.objects
  for insert to service_role
  with check (bucket_id = 'visit-photos');

create policy visit_photos_service_select on storage.objects
  for select to service_role
  using (bucket_id = 'visit-photos');

create policy visit_photos_service_delete on storage.objects
  for delete to service_role
  using (bucket_id = 'visit-photos');