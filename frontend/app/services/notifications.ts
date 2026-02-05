import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import axios from 'axios';
import Constants from 'expo-constants';

const EXPO_PUBLIC_BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || 
  process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface CalendarReminder {
  event_id: string;
  title: string;
  body: string;
  reminder_time: string;
  event_time: string;
}

export class NotificationService {
  private static pushToken: string | null = null;

  /**
   * Request notification permissions and register for push notifications
   */
  static async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Push notifications require a physical device');
      return null;
    }

    try {
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

      // Get push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      this.pushToken = tokenData.data;
      console.log('Push token:', this.pushToken);

      // Configure Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('calendar-reminders', {
          name: 'Kalender Erinnerungen',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#5D3FD3',
          sound: 'default',
        });
      }

      return this.pushToken;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
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
      // Don't schedule if in the past
      if (triggerDate <= new Date()) {
        console.log('Cannot schedule reminder in the past');
        return null;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `📅 ${title}`,
          body: body,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { eventId, type: 'calendar_reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
        },
      });

      console.log(`Scheduled reminder ${notificationId} for ${triggerDate}`);
      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
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
          let body = `Beginnt um ${event.start_time}`;
          if (event.participant_details && event.participant_details.length > 0) {
            body += ` mit ${event.participant_details.map((p) => p.name).join(', ')}`;
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
        console.error(`Error scheduling reminder for event ${event.id}:`, error);
      }
    }

    console.log(`Scheduled ${scheduledCount} reminders`);
    return scheduledCount;
  }

  /**
   * Send an immediate local notification
   */
  static async sendImmediateNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: 'default',
        data,
      },
      trigger: null, // Immediate
    });
  }

  /**
   * Cancel all scheduled notifications
   */
  static async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  /**
   * Get all scheduled notifications
   */
  static async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    return await Notifications.getAllScheduledNotificationsAsync();
  }

  /**
   * Add notification response listener
   */
  static addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  /**
   * Add notification received listener (when app is in foreground)
   */
  static addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.EventSubscription {
    return Notifications.addNotificationReceivedListener(callback);
  }
}

export default NotificationService;
