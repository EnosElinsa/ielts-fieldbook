-- Read-only post-migration verification. No learner text or credentials emitted.
select jsonb_build_object(
  'books',(select count(*) from public.wordbooks),
  'units',(select count(*) from public.wordbook_units),
  'memberships',(select count(*) from public.wordbook_memberships),
  'entries',(select count(*) from public.word_entries),
  'senses',(select count(*) from public.word_senses),
  'aliases',(select count(*) from public.vocabulary_identity_aliases),
  'catalogReferencesMissing',(select count(*) from public.wordbook_memberships m where not exists(select 1 from public.wordbooks b where b.id=m.payload->>'bookId') or not exists(select 1 from public.wordbook_units u where u.id=m.payload->>'unitId') or not exists(select 1 from public.word_entries e where e.id=m.payload->>'entryId')),
  'disabledImmutableTriggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgname='immutable_history' and t.tgenabled<>'O'),
  'enabledImmutableTriggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgname='immutable_history' and t.tgenabled='O'),
  'legacyBookIds',(select count(*) from public.wordbooks b join public.vocabulary_identity_aliases a on a.kind='book' and b.id=a.old_id),
  'legacyUnitIds',(select count(*) from public.wordbook_units u join public.vocabulary_identity_aliases a on a.kind='unit' and u.id=a.old_id),
  'legacyMemberIds',(select count(*) from public.wordbook_memberships m join public.vocabulary_identity_aliases a on a.kind='membership' and m.id=a.old_id)
) as neutral_identity_verification;
