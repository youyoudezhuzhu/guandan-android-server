package com.hanazar.guandanserver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.os.IBinder;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * 前台服务：把 assets/nodejs-project 复制到 filesDir，
 * 然后启动嵌入的 Node.js 运行时运行 lan-server.cjs（掼蛋局域网服务器）。
 */
public class NodeService extends Service {
    private static final String TAG = "GuandanServer";
    private static final String CHANNEL_ID = "guandan_server";
    private static final int NOTIF_ID = 1;
    public static final int PORT = 4173;

    // 加载 JNI 桥接库与 node 运行时
    static {
        System.loadLibrary("native-lib");
        System.loadLibrary("node");
    }

    public static native int startNodeWithArguments(String[] arguments);

    // 只启动一个 node 实例
    public static boolean _startedNodeAlready = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification("掼蛋服务器启动中…"));
        if (!_startedNodeAlready) {
            _startedNodeAlready = true;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        String nodeDir = getApplicationContext().getFilesDir().getAbsolutePath() + "/nodejs-project";
                        if (wasAPKUpdated()) {
                            File nodeDirReference = new File(nodeDir);
                            if (nodeDirReference.exists()) {
                                deleteFolderRecursively(new File(nodeDir));
                            }
                            copyAssetFolder(getApplicationContext().getAssets(), "nodejs-project", nodeDir);
                            saveLastUpdateTime();
                        }
                        Log.i(TAG, "starting node: " + nodeDir + "/lan-server.cjs");
                        startNodeWithArguments(new String[]{"node", nodeDir + "/lan-server.cjs"});
                    } catch (Throwable t) {
                        Log.e(TAG, "node start failed", t);
                        stopSelf();
                    }
                }
            }).start();
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** 更新前台通知文案（MainActivity 拿到局域网地址后调用） */
    public static void updateNotification(Context context, String text) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            Notification.Builder b = new Notification.Builder(context, CHANNEL_ID)
                    .setContentTitle("掼蛋服务器")
                    .setContentText(text)
                    .setSmallIcon(R.drawable.ic_stat_card)
                    .setOngoing(true);
            nm.notify(NOTIF_ID, b.build());
        }
    }

    private Notification buildNotification(String text) {
        return new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("掼蛋服务器")
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_stat_card)
                .setOngoing(true)
                .build();
    }

    private void createChannel() {
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "掼蛋服务器", NotificationManager.IMPORTANCE_LOW);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.createNotificationChannel(channel);
    }

    // ---- assets 复制辅助 ----

    private static boolean deleteFolderRecursively(File file) {
        try {
            boolean res = true;
            File[] children = file.listFiles();
            if (children != null) {
                for (File childFile : children) {
                    if (childFile.isDirectory()) {
                        res &= deleteFolderRecursively(childFile);
                    } else {
                        res &= childFile.delete();
                    }
                }
            }
            res &= file.delete();
            return res;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    private static boolean copyAssetFolder(AssetManager assetManager, String fromAssetPath, String toPath) {
        try {
            String[] files = assetManager.list(fromAssetPath);
            boolean res = true;
            if (files == null || files.length == 0) {
                res &= copyAsset(assetManager, fromAssetPath, toPath);
            } else {
                new File(toPath).mkdirs();
                for (String file : files) {
                    res &= copyAssetFolder(assetManager, fromAssetPath + "/" + file, toPath + "/" + file);
                }
            }
            return res;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    private static boolean copyAsset(AssetManager assetManager, String fromAssetPath, String toPath) {
        InputStream in = null;
        OutputStream out = null;
        try {
            in = assetManager.open(fromAssetPath);
            File outFile = new File(toPath);
            if (!outFile.getParentFile().exists()) outFile.getParentFile().mkdirs();
            out = new FileOutputStream(outFile);
            copyFile(in, out);
            in.close();
            in = null;
            out.flush();
            out.close();
            out = null;
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    private static void copyFile(InputStream in, OutputStream out) throws IOException {
        byte[] buffer = new byte[1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
    }

    // ---- APK 更新检测：只在升级后重新复制 assets ----

    private boolean wasAPKUpdated() {
        SharedPreferences prefs = getApplicationContext().getSharedPreferences("NODEJS_MOBILE_PREFS", Context.MODE_PRIVATE);
        long previousLastUpdateTime = prefs.getLong("NODEJS_MOBILE_APK_LastUpdateTime", 0);
        long lastUpdateTime = 1;
        try {
            PackageInfo packageInfo = getApplicationContext().getPackageManager()
                    .getPackageInfo(getApplicationContext().getPackageName(), 0);
            lastUpdateTime = packageInfo.lastUpdateTime;
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
        }
        return (lastUpdateTime != previousLastUpdateTime);
    }

    private void saveLastUpdateTime() {
        long lastUpdateTime = 1;
        try {
            PackageInfo packageInfo = getApplicationContext().getPackageManager()
                    .getPackageInfo(getApplicationContext().getPackageName(), 0);
            lastUpdateTime = packageInfo.lastUpdateTime;
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
        }
        SharedPreferences prefs = getApplicationContext().getSharedPreferences("NODEJS_MOBILE_PREFS", Context.MODE_PRIVATE);
        prefs.edit().putLong("NODEJS_MOBILE_APK_LastUpdateTime", lastUpdateTime).apply();
    }
}
