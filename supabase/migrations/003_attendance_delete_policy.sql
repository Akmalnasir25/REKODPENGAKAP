-- Allow admins to delete attendance verification records when a scan is wrong
create policy "attendance_delete" on public.attendance_verifications
  for delete to authenticated using (public.is_admin_or_above());
