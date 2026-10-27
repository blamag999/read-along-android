package com.blamag999.readalong;

import android.content.Context;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

@CapacitorPlugin(name = "Diagnostics")
public class DiagnosticsPlugin extends Plugin {
    private static final String TAG = "ReadAlongDiag";
    private static final String LOG_FILE = "read-along-lifecycle.log";
    private static final int MAX_LINES = 500;

    public static synchronized void recordLifecycle(Context context, String event) {
        if (context == null || event == null || !event.matches("[A-Za-z0-9_.-]{1,64}")) return;
        String line = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
                .format(new Date()) + " " + event;
        try {
            File file = new File(context.getFilesDir(), LOG_FILE);
            try (FileWriter writer = new FileWriter(file, true)) {
                writer.write(line + "\n");
            }
            trimFile(file);
            Log.i(TAG, event);
        } catch (IOException ignored) {
            Log.w(TAG, "Unable to persist lifecycle marker");
        }
    }

    private static void trimFile(File file) throws IOException {
        if (!file.exists() || file.length() < 48 * 1024) return;
        java.util.ArrayList<String> lines = new java.util.ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
            String line;
            while ((line = reader.readLine()) != null) lines.add(line);
        }
        int from = Math.max(0, lines.size() - MAX_LINES);
        try (FileWriter writer = new FileWriter(file, false)) {
            for (int i = from; i < lines.size(); i++) writer.write(lines.get(i) + "\n");
        }
    }

    @PluginMethod
    public void getLogs(PluginCall call) {
        JSObject result = new JSObject();
        JSArray lines = new JSArray();
        File file = new File(getContext().getFilesDir(), LOG_FILE);
        if (file.exists()) {
            try (BufferedReader reader = new BufferedReader(new FileReader(file))) {
                String line;
                int count = 0;
                java.util.ArrayList<String> last = new java.util.ArrayList<>();
                while ((line = reader.readLine()) != null) {
                    if (line.matches("[0-9T:.-]{20,30}Z? [A-Za-z0-9_.-]{1,64}")) {
                        last.add(line);
                        if (last.size() > MAX_LINES) last.remove(0);
                    }
                }
                for (String item : last) lines.put(item);
            } catch (Exception ignored) { }
        }
        result.put("lines", lines);
        call.resolve(result);
    }
}
