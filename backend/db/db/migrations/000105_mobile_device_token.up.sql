-- Mobile device token for FCM/APNs push notifications
CREATE TABLE IF NOT EXISTS "MobileDeviceToken" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "token" TEXT NOT NULL, -- FCM registration token or APNs device token
    "platform" TEXT NOT NULL CHECK ("platform" IN ('android', 'ios')),
    "bundleId" TEXT NOT NULL DEFAULT '', -- "ci.sect.app" or "ci.sect.app.ios"
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One token per user per platform (upsert on conflict)
    CONSTRAINT "uq_mobile_device_user_platform" UNIQUE ("userId", "platform")
);

-- Index for fast lookup by userId
CREATE INDEX IF NOT EXISTS "idx_mobile_device_user" ON "MobileDeviceToken"("userId");
CREATE INDEX IF NOT EXISTS "idx_mobile_device_active" ON "MobileDeviceToken"("userId", "active");

-- Row Level Security
ALTER TABLE "MobileDeviceToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mobile_device_owner" ON "MobileDeviceToken"
    FOR ALL USING ("userId" = current_setting('app.current_user_id', true));

-- Topic subscriptions for APNs (server-side routing)
CREATE TABLE IF NOT EXISTS "MobileTopicSubscription" (
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "topic" TEXT NOT NULL, -- e.g., "epreuve-123", "messages-456"
    "platform" TEXT NOT NULL DEFAULT 'ios' CHECK ("platform" IN ('android', 'ios')),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT "pk_mobile_topic_sub" PRIMARY KEY ("userId", "topic")
);

CREATE INDEX IF NOT EXISTS "idx_mobile_topic_topic" ON "MobileTopicSubscription"("topic");

ALTER TABLE "MobileTopicSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mobile_topic_owner" ON "MobileTopicSubscription"
    FOR ALL USING ("userId" = current_setting('app.current_user_id', true));
