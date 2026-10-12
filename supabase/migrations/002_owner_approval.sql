-- Run after 001_initial.sql. This trusted operation creates exactly one official
-- assignment for a pending suggestion and records its review.
create or replace function public.approve_suggestion(suggestion_id uuid, reviewer_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  suggestion public.assignment_suggestions;
  assignment_id uuid;
begin
  if not public.is_owner() then
    raise exception 'not authorized';
  end if;

  select * into suggestion
  from public.assignment_suggestions
  where id = suggestion_id
  for update;

  if not found then
    raise exception 'suggestion not found';
  end if;

  if suggestion.status = 'approved' then
    return null;
  end if;

  if suggestion.status <> 'pending' then
    raise exception 'suggestion is no longer pending';
  end if;

  insert into public.assignments (title, subject, description, due_at, priority, status, created_by)
  values (suggestion.title, suggestion.subject, suggestion.description, suggestion.proposed_due_at, 'Medium', 'published', auth.uid())
  returning id into assignment_id;

  update public.assignment_suggestions
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reviewer_notes = reviewer_note, updated_at = now()
  where id = suggestion_id;

  return assignment_id;
end;
$$;

revoke execute on function public.approve_suggestion(uuid, text) from public, anon;
grant execute on function public.approve_suggestion(uuid, text) to authenticated;
