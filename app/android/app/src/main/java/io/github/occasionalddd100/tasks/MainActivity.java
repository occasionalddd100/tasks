package io.github.occasionalddd100.tasks;

import android.content.Intent;
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
import java.io.InputStream;
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
}
