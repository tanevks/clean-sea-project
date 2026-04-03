ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

UPDATE public.reports
SET
  latitude = ST_Y(location::geometry),
  longitude = ST_X(location::geometry)
WHERE latitude IS NULL OR longitude IS NULL;

ALTER TABLE public.reports
ALTER COLUMN latitude SET NOT NULL,
ALTER COLUMN longitude SET NOT NULL;

ALTER TABLE public.reports
ADD CONSTRAINT reports_latitude_range CHECK (latitude BETWEEN -90 AND 90),
ADD CONSTRAINT reports_longitude_range CHECK (longitude BETWEEN -180 AND 180);

CREATE INDEX IF NOT EXISTS idx_reports_latitude ON public.reports(latitude);
CREATE INDEX IF NOT EXISTS idx_reports_longitude ON public.reports(longitude);
