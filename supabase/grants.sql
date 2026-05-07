grant usage on schema public to anon, authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant all privileges on public.profiles to service_role;

grant select, insert, update on public.app_state to authenticated;
grant all privileges on public.app_state to service_role;

grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_admin_user() to authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.touch_updated_at() to service_role;
