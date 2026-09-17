-- A visit has one evolving form: drafts are updated until the lead MEO submits.
create unique index if not exists visit_forms_site_visit_unique on visit_forms (site_visit_id);