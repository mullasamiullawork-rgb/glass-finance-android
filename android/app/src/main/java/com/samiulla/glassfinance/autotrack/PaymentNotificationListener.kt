package com.samiulla.glassfinance.autotrack

import android.app.Notification
import android.content.ComponentName
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.samiulla.glassfinance.autotrack.core.PaymentAppRegistry
import com.samiulla.glassfinance.autotrack.core.RawNotification

/**
 * Receives notifications from the system. Everything except the supported payment and SMS apps is
 * dropped on the first line, before any text is read. Processing is on-device; nothing is sent anywhere.
 */
class PaymentNotificationListener : NotificationListenerService() {
    private val repo by lazy { AutoTrackRepository.get(this) }

    override fun onListenerConnected() {
        repo.markListenerEvent("listenerConnectedAt")
        repo.prefs.edit().putBoolean("listenerConnected", true).apply()
    }

    override fun onListenerDisconnected() {
        repo.markListenerEvent("listenerDisconnectedAt")
        repo.prefs.edit().putBoolean("listenerConnected", false).apply()
        // Ask the system to bind us again (e.g. after the process was killed). Has no effect if access was revoked.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try { requestRebind(ComponentName(this, PaymentNotificationListener::class.java)) } catch (_: Exception) {}
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val pkg = sbn.packageName ?: return
        if (!PaymentAppRegistry.isSupported(pkg)) return // unrelated apps: ignored, nothing read
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val ex = n.extras ?: return
        val raw = RawNotification(
            packageName = pkg,
            title = ex.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            text = ex.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            bigText = ex.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
            subText = ex.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString(),
            postedAt = sbn.postTime,
        )
        if (raw.body.isBlank()) return
        repo.handle(raw, sbn.key ?: (pkg + sbn.id))
    }
}
