package com.blamag999.readalong;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private File pendingApk;
    private PluginCall pendingCall;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename", "read-along-update.apk");
        if (url == null || !url.startsWith("https://github.com/")) {
            call.reject("Đường dẫn APK không hợp lệ.");
            return;
        }
        if (!filename.matches("[A-Za-z0-9._-]+\\.apk")) filename = "read-along-update.apk";
        final String safeName = filename;
        getBridge().execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("Không tải được APK (HTTP " + code + ").");
                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Không tạo được thư mục tải APK.");
                File apk = new File(dir, safeName);
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[32768];
                    int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                    out.getFD().sync();
                }
                if (!apk.isFile() || apk.length() < 1024) throw new Exception("Tệp APK tải về không hợp lệ.");
                getActivity().runOnUiThread(() -> beginInstall(apk, call));
            } catch (Exception e) {
                call.reject("Tải/cài đặt APK thất bại: " + e.getMessage(), e);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void beginInstall(File apk, PluginCall call) {
        pendingApk = apk;
        pendingCall = call;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, settings, "onInstallPermissionResult");
            return;
        }
        launchInstaller(apk, call);
    }

    @ActivityCallback\n    private void onInstallPermissionResult(PluginCall call, com.getcapacitor.ActivityResult result) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getContext().getPackageManager().canRequestPackageInstalls()) {
            if (pendingApk != null && pendingApk.exists()) launchInstaller(pendingApk, call);
            else call.reject("Không tìm thấy APK đã tải.");
        } else {
            call.reject("Chưa cấp quyền cho phép cài ứng dụng từ nguồn này.");
        }
    }

    private void launchInstaller(File apk, PluginCall call) {
        try {
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Không mở được trình cài đặt Android: " + e.getMessage(), e);
        }
    }
}
