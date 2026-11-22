-- Live financial position of every booking (balances recalculated from payments, never stored by hand)
CREATE VIEW v_booking_finance AS
SELECT b.id AS booking_id,
  COALESCE(p.paid, 0)::numeric(16,2)                  AS paid,
  (b.final_price - COALESCE(p.paid, 0))::numeric(16,2) AS balance,
  COALESCE(i.overdue_amount, 0)::numeric(16,2)        AS overdue_amount,
  COALESCE(i.overdue_count, 0)::int                   AS overdue_count,
  i.oldest_overdue_date,
  n.next_due_date,
  n.next_due_amount::numeric(16,2)                    AS next_due_amount,
  COALESCE(i.paid_count, 0)::int                      AS paid_count,
  COALESCE(i.unpaid_count, 0)::int                    AS unpaid_count,
  COALESCE(i.total_count, 0)::int                     AS total_count,
  COALESCE(c.charges_due, 0)::numeric(16,2)           AS charges_due
FROM bookings b
LEFT JOIN (
  SELECT booking_id, SUM(amount) AS paid FROM payments
  WHERE purpose = 'INSTALLMENT' AND status = 'VALID' GROUP BY booking_id
) p ON p.booking_id = b.id
LEFT JOIN (
  SELECT booking_id,
    SUM(amount - paid_amount) FILTER (WHERE due_date < CURRENT_DATE AND paid_amount < amount) AS overdue_amount,
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND paid_amount < amount)                  AS overdue_count,
    MIN(due_date) FILTER (WHERE due_date < CURRENT_DATE AND paid_amount < amount)             AS oldest_overdue_date,
    COUNT(*) FILTER (WHERE paid_amount >= amount)                                              AS paid_count,
    COUNT(*) FILTER (WHERE paid_amount < amount)                                               AS unpaid_count,
    COUNT(*)                                                                                   AS total_count
  FROM installments GROUP BY booking_id
) i ON i.booking_id = b.id
LEFT JOIN LATERAL (
  SELECT x.due_date AS next_due_date, (x.amount - x.paid_amount) AS next_due_amount
  FROM installments x WHERE x.booking_id = b.id AND x.paid_amount < x.amount
  ORDER BY x.due_date, x.seq_no LIMIT 1
) n ON TRUE
LEFT JOIN (
  SELECT ch.booking_id, SUM(ch.amount - COALESCE(cp.paid, 0)) AS charges_due
  FROM charges ch
  LEFT JOIN (SELECT charge_id, SUM(amount) AS paid FROM payments WHERE purpose = 'CHARGE' AND status = 'VALID' GROUP BY charge_id) cp
    ON cp.charge_id = ch.id
  WHERE ch.status = 'ACTIVE'
  GROUP BY ch.booking_id
) c ON c.booking_id = b.id;

CREATE VIEW v_charge_finance AS
SELECT ch.*,
  COALESCE(cp.paid, 0)::numeric(16,2)               AS paid,
  CASE WHEN ch.status = 'ACTIVE' THEN (ch.amount - COALESCE(cp.paid, 0)) ELSE 0 END::numeric(16,2) AS due
FROM charges ch
LEFT JOIN (SELECT charge_id, SUM(amount) AS paid FROM payments WHERE purpose = 'CHARGE' AND status = 'VALID' GROUP BY charge_id) cp
  ON cp.charge_id = ch.id;
