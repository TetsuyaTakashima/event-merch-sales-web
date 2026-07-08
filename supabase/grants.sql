grant usage on schema public to anon, authenticated, service_role;

grant select, update on public.profiles to authenticated;
grant all privileges on public.profiles to service_role;

revoke insert, update on public.app_state from authenticated;
grant select on public.app_state to authenticated;
grant all privileges on public.app_state to service_role;

grant execute on function public.is_active_user() to authenticated, service_role;
grant execute on function public.is_admin_user() to authenticated, service_role;
grant execute on function public.app_state_current_role() to authenticated, service_role;
grant execute on function public.app_state_current_id() to authenticated, service_role;
grant execute on function public.can_read_app_state_id(text) to authenticated, service_role;
grant execute on function public.can_write_app_state_id(text) to authenticated, service_role;
grant execute on function public.can_manage_app_state() to authenticated, service_role;
grant execute on function public.can_write_app_state() to authenticated, service_role;
grant execute on function public.require_app_state_role(text[], text) to authenticated, service_role;
grant execute on function public.app_state_now_iso() to authenticated, service_role;
grant execute on function public.initialize_app_state(jsonb) to authenticated, service_role;
grant execute on function public.save_app_state(jsonb, bigint) to authenticated, service_role;
grant execute on function public.create_sale(jsonb) to authenticated, service_role;
grant execute on function public.cancel_sale(text, text) to authenticated, service_role;
grant execute on function public.delete_cancelled_sale(text) to authenticated, service_role;
grant execute on function public.adjust_inventory(text, text, integer, text) to authenticated, service_role;
grant execute on function public.save_actual_stock(text, text, numeric) to authenticated, service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.touch_updated_at() to service_role;
