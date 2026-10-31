package com.blamag999.readalong;

import android.app.Activity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppLifecycle")
public class AppLifecyclePlugin extends Plugin {
    @PluginMethod
    public void exitApp(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Không tìm thấy Activity để thoát ứng dụng.");
            return;
        }
        activity.runOnUiThread(() -> {
            call.resolve();
            activity.finish();
        });
    }
}
