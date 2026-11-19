-- Fix sign-up failing with "Database error creating new user".
-- The trigger runs as supabase_auth_admin, whose search_path does not include
-- `public`, so the unqualified `user_profiles` reference could not be resolved.
-- Schema-qualify the table and pin search_path (also best practice for SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.create_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id, is_admin)
    VALUES (NEW.id, false)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$;
