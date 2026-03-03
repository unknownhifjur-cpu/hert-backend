const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

async function sendPushNotification(userId, payload) {
  try {
    const subscriptions = await PushSubscription.find({ user: userId });
    const notifications = subscriptions.map(sub => {
      return webpush.sendNotification(sub, JSON.stringify(payload))
        .catch(err => {
          // If subscription is expired or invalid, remove it
          if (err.statusCode === 410) {
            return PushSubscription.deleteOne({ _id: sub._id });
          }
          console.error('Push send error', err);
        });
    });
    await Promise.all(notifications);
  } catch (err) {
    console.error('Error sending push notifications', err);
  }
}

module.exports = sendPushNotification;