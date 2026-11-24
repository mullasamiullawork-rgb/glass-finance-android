package com.samiulla.glassfinance

import android.os.Bundle
import android.view.WindowManager
import com.getcapacitor.BridgeActivity
import com.samiulla.glassfinance.autotrack.AutoTrackPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AutoTrackPlugin::class.java)
        super.onCreate(savedInstanceState)
        // Financial screens are kept out of screenshots and the recent-apps preview.
        window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
    }
}
