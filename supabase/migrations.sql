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
