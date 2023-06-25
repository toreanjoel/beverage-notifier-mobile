import notifee, {
  AuthorizationStatus,
  EventType,
  Notification,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';

interface ScheduleData {
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

class Notifications {
  constructor() {
    // Bootstrap method is called when the app is launched from a notification
    this.bootstrap();

    // Listen for events
    // This is called when the app is in the foreground
    notifee.onForegroundEvent(({type, detail}) => {
      switch (type) {
        case EventType.DISMISSED:
          console.log('User dismissed notification', detail.notification);
          break;
        case EventType.PRESS:
          console.log('User pressed notification', detail.notification);
          break;
      }
    });

    // This is called when the app is in the background
    notifee.onBackgroundEvent(async ({type, detail}) => {
      const {notification} = detail;
      console.log('Notification received: background', type, detail);
      if (notification) {
        this.handleNotificationOpen(notification);
      }
    });
  }

  // This method deals with what what happens when the user clicks on the notification
  public handleNotificationOpen(notification: Notification) {
    const {data} = notification;
    console.log('Notification Opened', data);
  }

  // This method is called when the app is launched from a notification
  public async bootstrap() {
    const initialNotification = await notifee.getInitialNotification();
    if (initialNotification) {
      this.handleNotificationOpen(initialNotification.notification);
    }
  }

  // This method is called to check if the user has granted permission to send notifications
  public async checkPermissions() {
    const settings = await notifee.requestPermission();

    if (settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED) {
      console.log('Permission settings:', settings);
      return true;
    } else {
      console.log('User declined permissions');
      return false;
    }
  }

  // The function we call to schedule a notifificaion
  public async scheduleNotification(data: ScheduleData) {
    // Check if the user has granted the permission to send notifications
    const hasPermissions = await this.checkPermissions();

    // destructure schedule time - default milliseconds if not set
    const {hours = 0, minutes = 0, seconds = 0, milliseconds = 500} = data;
    // If the user has granted the permission, schedule the notification
    if (hasPermissions) {
      // Create a timestamp trigger for the notification - we set it 5 seconds in the future
      const date = new Date(Date.now());
      date.setHours(date.getHours() + hours); // timezone?
      date.setMinutes(date.getMinutes() + minutes);
      date.setSeconds(date.getSeconds() + seconds);
      date.setMilliseconds(date.getMilliseconds() + milliseconds);

      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: date.getTime(), // convert the time to unix timestamp to be of type number
      };

      // Create a channel (required for Android)
      const channelId = await notifee.createChannel({
        id: 'default',
        name: 'Default Channel',
      });

      // Create the notification details
      const notificationDetails = {
        id: '1',
        title: `🔔 Reminder Title: ${date.getTime().toString()}`,
        body: 'Tap on it to check',
        android: {
          channelId,
          pressAction: {
            id: 'default',
          },
        },
        data: {
          id: '1',
          action: 'reminder',
          details: {},
        },
      };

      // Schedule the notification
      await notifee.createTriggerNotification(notificationDetails, trigger);
    }
  }

  // Get the queue of the pending notifications that are scheduled
  public async getQueuedNotifications() {
    let data = null;

    // set the data of the pending notifications
    notifee.getTriggerNotificationIds().then(ids => {
      data = [...ids];
    });

    if (!data) {
      return [];
    }
    return data;
  }
}

// Exporting an instance of the class
export default new Notifications();
