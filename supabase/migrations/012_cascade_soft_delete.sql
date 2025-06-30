-- Cascade soft deletion: when a folder/page is soft-deleted (is_deleted=true)
-- mark all its descendant pages as is_deleted=true as well.

create or replace function public.soft_delete_descendants() 
returns trigger
language plpgsql
as $$
begin
  -- Only run when is_deleted flips from false/null → true
  if new.is_deleted is true and (old.is_deleted is not true) then
    with recursive descendants as (
      select uuid from public.pages where parent_uuid = new.uuid
      union all
      select p.uuid
      from public.pages p
      join descendants d on p.parent_uuid = d.uuid
    )
    update public.pages
       set is_deleted = true
     where uuid in (select uuid from descendants)
       and is_deleted is not true; -- skip rows already soft-deleted
  end if;
  return new;
end;
$$;

-- Drop existing trigger if it exists to avoid duplication
drop trigger if exists trg_soft_delete_descendants on public.pages;

-- Create trigger that fires AFTER update of is_deleted
create trigger trg_soft_delete_descendants
after update of is_deleted on public.pages
for each row
execute procedure public.soft_delete_descendants(); 