package io.github.occasionalddd100.tasks;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    // what another app shared with us, waiting for the page to take it (window.AndroidShare.take())
    private volatile String pendingShare = null;

    // With edge-to-edge (target SDK 35+) the window no longer shrinks for the keyboard,
    // so the keyboard covered input fields. Pad the content by the keyboard's height instead.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        View root = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(0, 0, 0, ime.bottom);
            return insets;
        });
        bridge.getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public String take() { String s = pendingShare; pendingShare = null; return s; }
        }, "AndroidShare");
        // saving pictures and videos into the phone's gallery: window.AndroidMedia.save('[{"url":…,"name":…}]'),
        // the result comes back as a "mediasaved" event with { ok, fail }
        bridge.getWebView().addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void save(String json) { new Thread(() -> saveAll(json)).start(); }
        }, "AndroidMedia");
        readShare(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (readShare(intent)) bridge.getWebView().post(() ->
            bridge.getWebView().evaluateJavascript("window.dispatchEvent(new Event('androidshare'))", null));
    }

    private boolean readShare(Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        try {
            JSONObject out = new JSONObject();
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text != null) out.put("text", text);
            if (subject != null) out.put("subject", subject);
            ArrayList<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
                ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (list != null) uris.addAll(list);
            } else {
                Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) uris.add(u);
            }
            JSONArray images = new JSONArray();
            for (Uri u : uris) { if (images.length() >= 10) break; String d = imageData(u); if (d != null) images.put(d); }
            if (images.length() > 0) out.put("images", images);
            pendingShare = out.toString();
            intent.setAction(null); // don't hand it over twice (e.g. after rotation)
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // pictures are shrunk here to at most 2000px so they pass through the bridge quickly; the page compresses them further
    private String imageData(Uri uri) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(in, null, o); }
            int sample = 1;
            while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= 2000) sample *= 2;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sample;
            Bitmap bmp;
            try (InputStream in = getContentResolver().openInputStream(uri)) { bmp = BitmapFactory.decodeStream(in, null, o2); }
            if (bmp == null) return null;
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 88, buf);
            bmp.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(buf.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    private void saveAll(String json) {
        int ok = 0, fail = 0;
        try {
            JSONArray list = new JSONArray(json);
            for (int i = 0; i < list.length(); i++) {
                JSONObject it = list.getJSONObject(i);
                try { saveOne(it.getString("url"), it.optString("name", "")); ok++; } catch (Exception e) { fail++; }
            }
        } catch (Exception e) { fail++; }
        String js = "window.dispatchEvent(new CustomEvent('mediasaved',{detail:{ok:" + ok + ",fail:" + fail + "}}))";
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
    }

    private void saveOne(String url, String name) throws Exception {
        InputStream in; String mime;
        HttpURLConnection con = null;
        if (url.startsWith("data:")) {
            int comma = url.indexOf(',');
            String head = url.substring(5, comma);
            mime = head.split(";")[0];
            in = new ByteArrayInputStream(Base64.decode(url.substring(comma + 1), Base64.DEFAULT));
        } else {
            con = (HttpURLConnection) new URL(url).openConnection();
            con.setInstanceFollowRedirects(true);
            con.setConnectTimeout(15000); con.setReadTimeout(60000);
            con.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Tasks");
            if (con.getResponseCode() >= 400) throw new Exception("http " + con.getResponseCode());
            mime = con.getContentType();
            in = con.getInputStream();
        }
        if (mime != null) mime = mime.split(";")[0].trim().toLowerCase();
        if (mime == null || mime.isEmpty() || mime.equals("application/octet-stream") || mime.equals("binary/octet-stream")) {
            String ext = MimeTypeMap.getFileExtensionFromUrl(url.split("\\?")[0]);
            String m = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase());
            mime = m != null ? m : "image/jpeg";
        }
        boolean video = mime.startsWith("video/");
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        if (ext == null) ext = video ? "mp4" : "jpg";
        String base = name == null || name.isEmpty() ? (video ? "video-" : "img-") + System.currentTimeMillis() : name.replaceAll("[\\\\/:*?\"<>|]", "_");
        String file = base + "." + ext;
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, file);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + "/Задачи");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri col = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri dst = cr.insert(col, v);
                if (dst == null) throw new Exception("no uri");
                try (OutputStream out = cr.openOutputStream(dst)) { copy(in, out); }
                catch (Exception e) { cr.delete(dst, null, null); throw e; }
                v.clear(); v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(dst, v, null, null);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES), "Задачи");
                dir.mkdirs();
                File f = new File(dir, file);
                try (OutputStream out = new FileOutputStream(f)) { copy(in, out); }
                MediaScannerConnection.scanFile(this, new String[]{ f.getAbsolutePath() }, new String[]{ mime }, null);
            }
        } finally {
            in.close();
            if (con != null) con.disconnect();
        }
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[64 * 1024]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }
}
