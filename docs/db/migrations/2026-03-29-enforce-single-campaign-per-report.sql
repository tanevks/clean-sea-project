delete from public.report_campaigns older
using public.report_campaigns newer
where older.report_id = newer.report_id
  and (
    older.created_at < newer.created_at
    or (older.created_at = newer.created_at and older.ctid < newer.ctid)
  );

create unique index if not exists idx_report_campaigns_report_id_unique
  on public.report_campaigns(report_id);
