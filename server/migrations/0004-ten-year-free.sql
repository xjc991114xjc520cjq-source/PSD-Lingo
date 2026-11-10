-- One-time owner-authorized ten-year free grant for existing active clients.
UPDATE licenses SET expires=MAX(expires, CAST(strftime('%s','now','+10 years') AS INTEGER)*1000),note='十年免费授权（2026-10-20 开放）' WHERE status='active';
