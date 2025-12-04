/**
 * Notification Service
 *
 * Handles push notifications, in-app notifications, and real-time alerts.
 * Supports multiple channels: web push, mobile push, in-app, SMS.
 */

export type NotificationChannel = "web_push" | "mobile_push" | "in_app" | "sms";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type NotificationStatus = "pending" | "sent" | "delivered" | "failed";

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  data?: Record<string, unknown>;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export interface Notification {
  id: string;
  userId: string;
  channel: NotificationChannel;
  priority: NotificationPriority;
  payload: NotificationPayload;
  status: NotificationStatus;
  createdAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

export interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
}

export interface NotificationPreferences {
  userId: string;
  channels: {
    [key in NotificationChannel]?: boolean;
  };
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm format
    end: string;
  };
  categories: {
    [category: string]: boolean;
  };
}

// In-memory stores (would be database in production)
const notifications: Map<string, Notification> = new Map();
const subscriptions: Map<string, PushSubscription[]> = new Map();
const preferences: Map<string, NotificationPreferences> = new Map();

/**
 * Send a notification to a user
 */
export async function sendNotification(
  userId: string,
  channel: NotificationChannel,
  payload: NotificationPayload,
  priority: NotificationPriority = "normal"
): Promise<Notification> {
  // Check user preferences
  const userPrefs = preferences.get(userId);
  if (userPrefs?.channels[channel] === false) {
    throw new Error(`User has disabled ${channel} notifications`);
  }

  // Check quiet hours
  if (userPrefs?.quietHours?.enabled && priority !== "urgent") {
    if (isQuietHours(userPrefs.quietHours.start, userPrefs.quietHours.end)) {
      throw new Error("Cannot send non-urgent notifications during quiet hours");
    }
  }

  const notification: Notification = {
    id: generateId(),
    userId,
    channel,
    priority,
    payload,
    status: "pending",
    createdAt: new Date(),
  };

  notifications.set(notification.id, notification);

  // Dispatch to appropriate channel
  try {
    switch (channel) {
      case "web_push":
        await sendWebPush(userId, payload);
        break;
      case "mobile_push":
        await sendMobilePush(userId, payload);
        break;
      case "in_app":
        await saveInAppNotification(notification);
        break;
      case "sms":
        await sendSMS(userId, payload);
        break;
    }

    notification.status = "sent";
    notification.sentAt = new Date();
  } catch (error) {
    notification.status = "failed";
    console.error(`Failed to send notification: ${error}`);
  }

  return notification;
}

/**
 * Send web push notification
 */
async function sendWebPush(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  const userSubscriptions = subscriptions.get(userId) || [];

  if (userSubscriptions.length === 0) {
    throw new Error("No push subscriptions found for user");
  }

  // In production, use web-push library
  for (const sub of userSubscriptions) {
    console.log(`Sending web push to ${sub.endpoint}:`, payload);
  }
}

/**
 * Send mobile push notification
 */
async function sendMobilePush(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  // In production, use Firebase Cloud Messaging or APNs
  console.log(`Sending mobile push to user ${userId}:`, payload);
}

/**
 * Save in-app notification
 */
async function saveInAppNotification(notification: Notification): Promise<void> {
  // Already saved in notifications map
  console.log(`Saved in-app notification ${notification.id}`);
}

/**
 * Send SMS notification
 */
async function sendSMS(
  userId: string,
  payload: NotificationPayload
): Promise<void> {
  // In production, use Twilio or similar
  console.log(`Sending SMS to user ${userId}: ${payload.body}`);
}

/**
 * Register a push subscription for a user
 */
export async function registerPushSubscription(
  subscription: PushSubscription
): Promise<void> {
  const userSubs = subscriptions.get(subscription.userId) || [];
  
  // Check if subscription already exists
  const exists = userSubs.some((s) => s.endpoint === subscription.endpoint);
  if (!exists) {
    userSubs.push(subscription);
    subscriptions.set(subscription.userId, userSubs);
  }
}

/**
 * Unregister a push subscription
 */
export async function unregisterPushSubscription(
  userId: string,
  endpoint: string
): Promise<void> {
  const userSubs = subscriptions.get(userId) || [];
  const filtered = userSubs.filter((s) => s.endpoint !== endpoint);
  subscriptions.set(userId, filtered);
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(
  userId: string,
  limit: number = 50
): Promise<Notification[]> {
  const userNotifications: Notification[] = [];

  for (const notification of notifications.values()) {
    if (notification.userId === userId && !notification.readAt) {
      userNotifications.push(notification);
    }
  }

  return userNotifications
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const notification = notifications.get(notificationId);
  if (notification) {
    notification.readAt = new Date();
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<number> {
  let count = 0;
  const now = new Date();

  for (const notification of notifications.values()) {
    if (notification.userId === userId && !notification.readAt) {
      notification.readAt = now;
      count++;
    }
  }

  return count;
}

/**
 * Update notification preferences
 */
export async function updatePreferences(
  prefs: NotificationPreferences
): Promise<void> {
  preferences.set(prefs.userId, prefs);
}

/**
 * Get notification preferences
 */
export async function getPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  return preferences.get(userId) || null;
}

/**
 * Send notification to multiple users
 */
export async function broadcastNotification(
  userIds: string[],
  channel: NotificationChannel,
  payload: NotificationPayload,
  priority: NotificationPriority = "normal"
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      await sendNotification(userId, channel, payload, priority);
      sent++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
}

// Helper functions
function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function isQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  if (start <= end) {
    return currentTime >= start && currentTime <= end;
  } else {
    // Quiet hours span midnight
    return currentTime >= start || currentTime <= end;
  }
}
