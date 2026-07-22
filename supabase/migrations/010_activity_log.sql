CREATE TABLE activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id        UUID NOT NULL REFERENCES auth.users(id),
  actor_name      TEXT NOT NULL,
  action          TEXT NOT NULL,
  entity          TEXT NOT NULL,
  entity_id       UUID,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_org ON activity_log(organization_id, created_at DESC);
CREATE INDEX idx_activity_log_actor ON activity_log(actor_id);
