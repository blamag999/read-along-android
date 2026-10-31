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
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static final String OTA_HOST = "read-along-admin.pages.dev";
    private static final String OTA_PATH = "/api/readalong-admin/ota/download";
    private static final int MAX_APK_SIZE = 250 * 1024 * 1024;
    private File pendingApk;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename");
        String expectedSha256 = call.getString("sha256");
        Integer expectedSizeValue = call.getInt("expectedSize");

        if (!isAllowedOtaUrl(url)) {
            call.reject("Đường dẫn OTA không hợp lệ.");
            return;
        }
        if (filename == null || !filename.matches("read-along-v[0-9]+\\.[0-9]+\\.[0-9]+-android\\.apk")) {
            call.reject("Tên APK không hợp lệ.");
            return;
        }
        if (expectedSha256 == null || !expectedSha256.matches("[a-fA-F0-9]{64}")) {
            call.reject("Checksum SHA-256 không hợp lệ.");
            return;
        }
        if (expectedSizeValue == null || expectedSizeValue < 1024 || expectedSizeValue > MAX_APK_SIZE) {
            call.reject("Kích thước APK không hợp lệ.");
            return;
        }

        final String safeUrl = url;
        final String safeName = filename;
        final String safeSha256 = expectedSha256.toLowerCase();
        final int expectedSize = expectedSizeValue;

        getBridge().execute(() -> {
            HttpURLConnection connection = null;
            File apk = null;
            try {
                URL target = new URL(safeUrl);
                connection = (HttpURLConnection) target.openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                connection.connect();

                int code = connection.getResponseCode();
                if (code != HttpURLConnection.HTTP_OK) {
                    throw new Exception("OTA server returned HTTP " + code + ".");
                }
                int contentLength = connection.getContentLength();
                if (contentLength >= 0 && contentLength != expectedSize) {
                    throw new Exception("Kích thước APK trên máy chủ không khớp manifest.");
                }

                File dir = new File(getContext().getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) throw new Exception("Không tạo được thư mục tải APK.");
                apk = new File(dir, safeName);

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long totalBytes = 0;
                try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[32768];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        totalBytes += count;
                        if (totalBytes > expectedSize || totalBytes > MAX_APK_SIZE) {
                            throw new Exception("Tệp APK tải về vượt quá kích thước cho phép.");
                        }
                        digest.update(buffer, 0, count);
                        out.write(buffer, 0, count);
                    }
                    out.getFD().sync();
                }

                if (totalBytes != expectedSize) throw new Exception("Tệp APK tải về bị thiếu hoặc sai kích thước.");
                String actualSha256 = toHex(digest.digest());
                if (!safeSha256.equals(actualSha256)) throw new Exception("Checksum SHA-256 không khớp; đã hủy cài đặt.");
                if (!apk.isFile() || apk.length() != expectedSize) throw new Exception("Tệp APK tải về không hợp lệ.");

                File verifiedApk = apk;
                getActivity().runOnUiThread(() -> beginInstall(verifiedApk, call));
            } catch (Exception e) {
                if (apk != null && apk.exists()) apk.delete();
                call.reject("Tải/xác minh APK thất bại: " + e.getMessage(), e);
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private boolean isAllowedOtaUrl(String value) {
        if (value == null || value.length() > 2048) return false;
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) &&
                OTA_HOST.equalsIgnoreCase(uri.getHost()) &&
                (uri.getPort() == -1 || uri.getPort() == 443) &&
                OTA_PATH.equals(uri.getPath()) &&
                uri.getUserInfo() == null &&
                uri.getFragment() == null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format("%02x", value & 0xff));
        return result.toString();
    }

    private void beginInstall(File apk, PluginCall call) {
        pendingApk = apk;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, settings, "onInstallPermissionResult");
            return;
        }
        launchInstaller(apk, call);
    }

    @ActivityCallback
    private void onInstallPermissionResult(PluginCall call, androidx.activity.result.ActivityResult result) {
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
