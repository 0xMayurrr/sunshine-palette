-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- These columns are required for reminder emails and default email settings to work

-- 1. Add reminder_emails to meetings table
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS reminder_emails text[] DEFAULT '{}';

-- 2. Add reminder_emails to reminders table
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS reminder_emails text[] DEFAULT '{}';

-- 3. Add default_reminder_emails to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_reminder_emails text[] DEFAULT '{}';

-- 4. Allow shared owner ID to access all meetings (fixes RLS block for shared workspace)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'Shared owner can access all meetings'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Shared owner can access all meetings" ON public.meetings
      USING (user_id = '85f65368-252f-41c3-8831-be3b2c970ec2'::uuid)
      WITH CHECK (user_id = '85f65368-252f-41c3-8831-be3b2c970ec2'::uuid);
    $policy$;
  END IF;
END;
$$;
