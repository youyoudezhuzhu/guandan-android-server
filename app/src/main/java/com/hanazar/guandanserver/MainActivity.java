package com.hanazar.guandanserver;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private TextView statusView;
    private TextView addressView;
    private ImageView qrView;
    private Button openButton;
    private Button copyButton;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private static final int REQUEST_NOTIFY = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusView = findViewById(R.id.tvStatus);
        addressView = findViewById(R.id.tvAddress);
        qrView = findViewById(R.id.ivQr);
        openButton = findViewById(R.id.btnOpen);
        copyButton = findViewById(R.id.btnCopy);

        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFY);
            }
        }

        // 启动前台服务，服务内会复制 assets 并拉起 node 服务器
        Intent service = new Intent(this, NodeService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(service);
        } else {
            startService(service);
        }

        openButton.setOnClickListener(v -> {
            Intent i = new Intent(this, GameActivity.class);
            startActivity(i);
        });

        copyButton.setOnClickListener(v -> {
            String text = addressView.getText().toString();
            if (text.isEmpty() || text.contains("…")) {
                Toast.makeText(this, "服务器还没就绪，请稍候", Toast.LENGTH_SHORT).show();
                return;
            }
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("guandan-url", text));
            Toast.makeText(this, "地址已复制：" + text, Toast.LENGTH_SHORT).show();
        });

        pollServerStatus();
    }

    /** 轮询本机 node 服务的 /api/info，直到服务器就绪并拿到局域网地址 */
    private void pollServerStatus() {
        new Thread(() -> {
            for (int attempt = 0; attempt < 60; attempt++) {
                try {
                    URL url = new URL("http://127.0.0.1:" + NodeService.PORT + "/api/info");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(1000);
                    conn.setReadTimeout(1000);
                    if (conn.getResponseCode() == 200) {
                        BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                        StringBuilder sb = new StringBuilder();
                        String line;
                        while ((line = in.readLine()) != null) sb.append(line);
                        in.close();
                        conn.disconnect();

                        JSONObject obj = new JSONObject(sb.toString());
                        JSONArray addresses = obj.getJSONArray("addresses");
                        String lanIp = pickLanAddress(addresses);
                        runOnUiThread(() -> onServerReady(lanIp));
                        return;
                    }
                    conn.disconnect();
                } catch (Exception ignored) {
                    // 服务器还没起来，继续等
                }
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    return;
                }
            }
            runOnUiThread(() -> statusView.setText("服务器启动失败，请查看日志"));
        }).start();
    }

    private String pickLanAddress(JSONArray addresses) {
        // 优先选私有网段的 IPv4（192.168 / 10. / 172.16-31.）
        String fallback = null;
        for (int i = 0; i < addresses.length(); i++) {
            String ip = addresses.optString(i);
            if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.matches("172\\.(1[6-9]|2[0-9]|3[01])\\..*")) {
                return ip;
            }
            if (fallback == null) fallback = ip;
        }
        return fallback != null ? fallback : "127.0.0.1";
    }

    private void onServerReady(String ip) {
        String url = "http://" + ip + ":" + NodeService.PORT;
        statusView.setText("● 服务器运行中");
        addressView.setText(url);
        Bitmap qr = generateQr(url, 480);
        if (qr != null) qrView.setImageBitmap(qr);
        NodeService.updateNotification(this, "服务器运行中 · " + url);
    }

    private Bitmap generateQr(String text, int size) {
        try {
            BitMatrix matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size);
            Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565);
            for (int x = 0; x < size; x++) {
                for (int y = 0; y < size; y++) {
                    bmp.setPixel(x, y, matrix.get(x, y) ? 0xFF1B5E20 : 0xFFFFFFFF);
                }
            }
            return bmp;
        } catch (WriterException e) {
            e.printStackTrace();
            return null;
        }
    }
}
