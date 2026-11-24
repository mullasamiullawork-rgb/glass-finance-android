package com.samiulla.glassfinance

import android.app.Application
import com.samiulla.glassfinance.autotrack.AutoTrackRepository

class GlassFinanceApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Warm the repository so a notification arriving at cold start is handled without delay.
        AutoTrackRepository.get(this)
    }
}
