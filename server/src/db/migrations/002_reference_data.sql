-- Reference data and default settings

INSERT INTO counters (name, prefix, pad) VALUES
  ('customer', 'FH-C-', 5),
  ('booking',  'FH-B-', 5),
  ('receipt',  'FH-R-', 6),
  ('transfer', 'FH-T-', 5),
  ('expense',  'FH-E-', 5),
  ('refund',   'FH-RF-', 5);

INSERT INTO expense_categories (name, cost_type, sort_order) VALUES
  ('Land Purchase',   'LAND_PAYMENT', 1),
  ('Development',     'PROJECT',      2),
  ('Construction',    'PROJECT',      3),
  ('Road Work',       'PROJECT',      4),
  ('Electricity',     'PROJECT',      5),
  ('Water Supply',    'PROJECT',      6),
  ('Marketing',       'OPERATING',    7),
  ('Staff Salaries',  'OPERATING',    8),
  ('Office Expenses', 'OPERATING',    9),
  ('Commission',      'OPERATING',   10),
  ('Legal Expenses',  'OPERATING',   11),
  ('Other Expenses',  'OPERATING',   12);

INSERT INTO settings (key, value) VALUES
  ('company', '{"name":"FAISAL HOMES","tagline":"Real Estate & Developers","address":"","phone":"","email":"","website":""}'),
  ('measurement', '{"marla_sqft":272.25,"kanal_marla":20}'),
  ('display', '{"number_format":"intl","date_format":"DD-MM-YYYY","language":"en"}'),
  ('security', '{"session_timeout_minutes":30}'),
  ('late_fee', '{"enabled":false,"mode":"FIXED","value":0,"grace_days":0}'),
  ('installments', '{"default_rounding":100}'),
  ('backup', '{"auto_enabled":true,"time":"23:00","retention_count":30}'),
  ('receipt', '{"footer_note":"This is a computer generated receipt. Please keep it safe for future reference.","signature_label":"Authorized Signature","booking_terms":"1. Installments must be paid on or before the due date.\n2. The booking can be cancelled by the company as per the agreement if installments remain unpaid.\n3. Transfer of the plot is subject to clearance of all dues and company approval."}');
