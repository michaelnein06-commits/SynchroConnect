import { Platform, Alert } from 'react-native';
import axios from 'axios';
import Constants from 'expo-constants';

const EXPO_PUBLIC_BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Check if we're in Expo Go (which doesn't support all notification features)
const isExpoGo = Constants.appOwnership === 'expo';

// Lazy load notifications to avoid crashes in Expo Go
let Notifications: any = null;
let Device: any = null;

const loadNotificationModules = async () => {
  if (Notifications) return true;
  
  try {
    Notifications = await import('expo-notifications');
    Device = await import('expo-device');
    
    // Only configure handler if not in Expo Go or if it's supported
    if (Notifications && !isExpoGo) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }
    return true;
  } catch (error) {
    console.log('Notifications not available:', error);
    return false;
  }
};

export interface CalendarReminder {
  event_id: string;
  title: string;
  body: string;
  reminder_time: string;
  event_time: string;
}

export class NotificationService {
  private static pushToken: string | null = null;
  private static initialized = false;

  /**
   * Initialize the notification service
   */
  static async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    
    const loaded = await loadNotificationModules();
    this.initialized = loaded;
    return loaded;
  }

  /**
   * Request notification permissions and register for push notifications
   */
  static async registerForPushNotifications(): Promise<string | null> {
    try {
      const loaded = await this.initialize();
      if (!loaded || !Notifications || !Device) {
        console.log('Notifications module not available');
        return null;
      }

      if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission denied');
        return null;
      }

      // Get push token - skip if in Expo Go as it requires EAS
      if (isExpoGo) {
        console.log('Push tokens not available in Expo Go');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      this.pushToken = tokenData.data;
      console.log('Push token:', this.pushToken);

      // Configure Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('calendar-reminders', {
          name: 'Calendar Reminders',
          importance: Notifications.AndroidImportance?.HIGH || 4,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#5D3FD3',
          sound: 'default',
        });
      }

      return this.pushToken;
    } catch (error) {
      console.log('Error registering for push notifications:', error);
      return null;
    }
  }

  /**
   * Send push token to backend for storage
   */
  static async registerTokenWithBackend(token: string, authToken: string): Promise<boolean> {
    try {
      await axios.post(
        `${EXPO_PUBLIC_BACKEND_URL}/api/push-token`,
        {
          push_token: token,
          device_type: Platform.OS,
        },
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      return true;
    } catch (error) {
      console.error('Error registering push token with backend:', error);
      return false;
    }
  }

  /**
   * Schedule a local notification for a calendar event reminder
   */
  static async scheduleEventReminder(
    eventId: string,
    title: string,
    body: string,
    triggerDate: Date
  ): Promise<string | null> {
    try {
      const loaded = await this.initialize();
      if (!loaded || !Notifications) {
        console.log('Cannot schedule notification - module not available');
        return null;
      }

      // Don't schedule if in the past
      if (triggerDate <= new Date()) {
        console.log('Cannot schedule reminder in the past');
        return null;
      }

      // Use local notifications which work in Expo Go
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `📅 ${title}`,
          body: body,
          sound: 'default',
          data: { eventId, type: 'calendar_reminder' },
        },
        trigger: {
          type: 'date',
          date: triggerDate,
        },
      });

      console.log(`Scheduled reminder ${notificationId} for ${triggerDate}`);
      return notificationId;
    } catch (error) {
      console.log('Error scheduling notification:', error);
      return null;
    }
  }

  /**
   * Schedule reminders for all upcoming events
   */
  static async scheduleRemindersForEvents(
    events: Array<{
      id: string;
      title: string;
      date: string;
      start_time: string;
      reminder_minutes: number;
      participant_details?: Array<{ name: string }>;
    }>
  ): Promise<number> {
    try {
      const loaded = await this.initialize();
      if (!loaded || !Notifications) {
        console.log('Cannot schedule reminders - module not available');
        return 0;
      }

      // Cancel existing scheduled notifications first
      await Notifications.cancelAllScheduledNotificationsAsync();

      let scheduledCount = 0;
      const now = new Date();

      for (const event of events) {
        try {
          const eventDatetime = new Date(`${event.date}T${event.start_time}:00`);
          const reminderTime = new Date(
            eventDatetime.getTime() - (event.reminder_minutes || 30) * 60 * 1000
          );

          // Only schedule future reminders
          if (reminderTime > now) {
            let body = `Starts at ${event.start_time}`;
            if (event.participant_details && event.participant_details.length > 0) {
              body += ` with ${event.participant_details.map((p) => p.name).join(', ')}`;
            }

            const notificationId = await this.scheduleEventReminder(
              event.id,
              event.title,
              body,
              reminderTime
            );

            if (notificationId) {
              scheduledCount++;
            }
          }
        } catch (error) {
          console.log(`Error scheduling reminder for event ${event.id}:`, error);
        }
      }

      console.log(`Scheduled ${scheduledCount} reminders`);
      return scheduledCount;
    } catch (error) {
      console.log('Error in scheduleRemindersForEvents:', error);
      return 0;
    }
  }

  /**
   * Send an immediate local notification
   */
  static async sendImmediateNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    try {
      const loaded = await this.initialize();
      if (!loaded || !Notifications) return;

      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          data,
        },
        trigger: null, // Immediate
      });
    } catch (error) {
      console.log('Error sending notification:', error);
    }
  }

  /**
   * Cancel all scheduled notifications
   */
  static async cancelAllNotifications(): Promise<void> {
    try {
      const loaded = await this.initialize();
      if (!loaded || !Notifications) return;
      
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.log('Error canceling notifications:', error);
    }
  }

  /**
   * Get all scheduled notifications
   */
  static async getScheduledNotifications(): Promise<any[]> {
    try {
      const loaded = await this.initialize();
      if (!loaded || !Notifications) return [];
      
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.log('Error getting scheduled notifications:', error);
      return [];
    }
  }

  /**
   * Add notification response listener
   */
  static addNotificationResponseListener(
    callback: (response: any) => void
  ): { remove: () => void } | null {
    try {
      if (!Notifications) return null;
      return Notifications.addNotificationResponseReceivedListener(callback);
    } catch (error) {
      console.log('Error adding notification listener:', error);
      return null;
    }
  }

  /**
   * Add notification received listener (when app is in foreground)
   */
  static addNotificationReceivedListener(
    callback: (notification: any) => void
  ): { remove: () => void } | null {
    try {
      if (!Notifications) return null;
      return Notifications.addNotificationReceivedListener(callback);
    } catch (error) {
      console.log('Error adding notification listener:', error);
      return null;
    }
  }
}

export default NotificationService;
