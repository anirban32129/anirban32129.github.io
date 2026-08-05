-- Delete Comment / Delete Question feature — RLS policies for "Questions"
--
-- Run this in Supabase Dashboard → SQL Editor (or via `supabase db push`
-- if you keep migrations under version control).
--
-- Assumes RLS is already enabled on "Questions" (it must be, since your
-- existing SELECT/INSERT behavior already depends on it — ask-question.js
-- says "RLS already restricts this to the logged-in user's own rows").
-- If it somehow isn't enabled yet, uncomment the line below.

-- alter table "Questions" enable row level security;

-- 1. Students can delete only their own rows.
--    auth.uid() is the authenticated user's id from their JWT — it cannot
--    be spoofed by the client, so this holds even if someone edits the
--    frontend JS or calls the Supabase REST API directly.
create policy "Students can delete their own questions"
on "Questions"
for delete
to authenticated
using (auth.uid() = user_id);

-- 2. The admin (matching admin-files.html's ADMIN_EMAILS allowlist) can
--    delete any row. auth.jwt() ->> 'email' reads the email claim out of
--    the caller's own JWT — again, not something the client can forge.
--    If you add more admins to ADMIN_EMAILS in admin-files.html later,
--    add their email(s) here too (or list them all in one `in (...)`).
create policy "Admin can delete any question"
on "Questions"
for delete
to authenticated
using (auth.jwt() ->> 'email' = 'abinashdebnath32129@gmail.com');

-- Multiple permissive policies for the same command (delete) are combined
-- with OR, so a request succeeds if EITHER policy's condition is true —
-- you don't need to merge these into one policy.
