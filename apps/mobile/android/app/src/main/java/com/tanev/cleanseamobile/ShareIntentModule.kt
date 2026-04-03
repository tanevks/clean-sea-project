package com.tanev.cleanseamobile

import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class ShareIntentModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val EVENT_NAME = "ShareIntentReceived"
    private var pendingSharedText: String? = null
    private var instance: ShareIntentModule? = null

    fun captureIntent(intent: Intent?) {
      val sharedText = extractSharedText(intent) ?: return
      pendingSharedText = sharedText
      instance?.emitSharedText(sharedText)
    }

    private fun extractSharedText(intent: Intent?): String? {
      if (intent?.action != Intent.ACTION_SEND) {
        return null
      }

      val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()
      if (!sharedText.isNullOrEmpty()) {
        return sharedText
      }

      val sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()
      if (!sharedSubject.isNullOrEmpty()) {
        return sharedSubject
      }

      return null
    }
  }

  init {
    instance = this
  }

  override fun getName() = "ShareIntentModule"

  @ReactMethod
  fun getInitialSharedText(promise: Promise) {
    promise.resolve(pendingSharedText)
  }

  @ReactMethod
  fun clearSharedText() {
    pendingSharedText = null
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required by NativeEventEmitter.
  }

  private fun emitSharedText(sharedText: String) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }

    val payload = Arguments.createMap().apply {
      putString("text", sharedText)
    }

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }
}
