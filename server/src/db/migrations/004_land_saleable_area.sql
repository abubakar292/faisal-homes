-- Expected saleable (plottable) area after roads, parks and other common areas.
-- Used as the denominator for cost per Marla while a society is only partly plotted.
ALTER TABLE lands ADD COLUMN saleable_marla NUMERIC(14,4) CHECK (saleable_marla IS NULL OR saleable_marla >= 0);
