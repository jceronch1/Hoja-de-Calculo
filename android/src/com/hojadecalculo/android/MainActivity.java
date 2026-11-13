package com.hojadecalculo.android;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Collections;
import java.util.Locale;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String INDEX = "https://" + HOST + "/index.html";
    private static final String CSP = "default-src 'none'; script-src 'self'; "
            + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
            + "font-src 'self'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
    private static final int OPEN_DOCUMENT = 100;
    private static final int CREATE_DOCUMENT = 101;

    private WebView sheetView;
    private FrameLayout content;
    private WebView printView;
    private ValueCallback<Uri[]> fileChooser;
    private final ExportBridge bridge = new ExportBridge();
    private boolean sheetReady;
    private String pendingExportResult;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        content = new FrameLayout(this);
        content.setBackgroundColor(0xffeaf3ed);
        sheetView = new WebView(this);
        sheetView.setBackgroundColor(0xffeaf3ed);
        content.addView(sheetView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        if (Build.VERSION.SDK_INT >= 35) {
            content.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            });
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }

        setContentView(content);
        content.requestApplyInsets();
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        WebSettings settings = sheetView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // The document picker returns a user-granted content URI.
        settings.setBlockNetworkLoads(true);
        sheetView.addJavascriptInterface(bridge, "AndroidSpreadsheet");
        sheetView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String path = uri.getPath();
                if ("https".equals(uri.getScheme()) && HOST.equals(uri.getAuthority())
                        && path != null && path.matches("/(?:index\\.html|(?:css|js)/(?:[\\w-]+/)*[\\w-]+\\.(?:css|js))")) {
                    try {
                        String mime = path.endsWith(".html") ? "text/html"
                                : path.endsWith(".css") ? "text/css" : "application/javascript";
                        return new WebResourceResponse(mime, "UTF-8", 200, "OK",
                                Collections.singletonMap("Content-Security-Policy", CSP),
                                getAssets().open(path.substring(1)));
                    } catch (IOException missingAsset) {
                        // Return an empty error response so WebView never resolves the synthetic host.
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                        Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !INDEX.equals(request.getUrl().toString());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!INDEX.equals(url)) return;
                sheetReady = true;
                if (pendingExportResult != null) {
                    notifyExportResult(pendingExportResult);
                    pendingExportResult = null;
                }
            }
        });
        sheetView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (fileChooser != null) fileChooser.onReceiveValue(null);
                fileChooser = callback;
                // Some providers classify workbooks as generic binary files.
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("*/*");
                try {
                    startActivityForResult(intent, OPEN_DOCUMENT);
                } catch (ActivityNotFoundException error) {
                    fileChooser = null;
                    callback.onReceiveValue(null);
                    showToast("El selector de archivos no está disponible.");
                }
                return true;
            }
        });
        bridge.waiting = state != null && state.getBoolean("exportPickerOpen") && exportFile().isFile();
        if (!bridge.waiting) exportFile().delete();
        sheetView.loadUrl(INDEX);
    }

    @Override
    public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        content.requestApplyInsets();
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("exportPickerOpen", bridge.waiting);
        super.onSaveInstanceState(state);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (request == OPEN_DOCUMENT && fileChooser != null) {
            ValueCallback<Uri[]> callback = fileChooser;
            fileChooser = null;
            callback.onReceiveValue(uri == null || !"content".equals(uri.getScheme())
                    ? null : new Uri[] { uri });
        } else if (request == CREATE_DOCUMENT) {
            if (uri != null && "content".equals(uri.getScheme())) {
                new Thread(() -> writeDocument(uri), "guardar-documento").start();
            } else {
                bridge.complete("cancel");
            }
        }
    }

    private File exportFile() {
        return new File(getCacheDir(), "exportacion.tmp");
    }

    private void writeDocument(Uri destination) {
        String result = "saved";
        try (FileInputStream source = new FileInputStream(exportFile());
                OutputStream out = getContentResolver().openOutputStream(destination, "wt")) {
            if (out == null) throw new IOException("Sin destino");
            byte[] buffer = new byte[64 * 1024];
            int length;
            while ((length = source.read(buffer)) != -1) out.write(buffer, 0, length);
        } catch (IOException | SecurityException error) {
            result = "error";
        }
        String status = result;
        runOnUiThread(() -> bridge.complete(status));
    }

    private void showToast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private void notifyExportResult(String status) {
        if (isDestroyed()) return;
        if (!sheetReady) {
            pendingExportResult = status;
            return;
        }
        sheetView.evaluateJavascript(
                "window.HC && HC.ui.androidExportResult(" + JSONObject.quote(status) + ")", null);
    }

    private void openDocumentDestination(String filename) {
        String extension = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String mime;
        switch (extension) {
            case "xlsx": mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; break;
            case "csv": mime = "text/csv"; break;
            case "json": mime = "application/json"; break;
            case "png": mime = "image/png"; break;
            case "svg": mime = "image/svg+xml"; break;
            default: mime = "application/octet-stream";
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(mime)
                .putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(intent, CREATE_DOCUMENT);
        } catch (ActivityNotFoundException error) {
            bridge.complete("error");
        }
    }

    private void printDocument(String title, String html, PrintAttributes attributes) {
        if (printView != null) {
            showToast("Ya hay un documento en impresión.");
            return;
        }
        PrintManager manager = getSystemService(PrintManager.class);
        if (manager == null) {
            showToast("La impresión no está disponible.");
            return;
        }
        WebView view = new WebView(this);
        printView = view;
        view.getSettings().setBlockNetworkLoads(true);
        view.getSettings().setAllowFileAccess(false);
        view.getSettings().setAllowContentAccess(false);
        view.setWebViewClient(new WebViewClient() {
            private boolean started;

            @Override
            public void onPageFinished(WebView loaded, String url) {
                if (started || isDestroyed()) return;
                started = true;
                PrintDocumentAdapter webAdapter = loaded.createPrintDocumentAdapter(title);
                PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
                    @Override
                    public void onStart() { webAdapter.onStart(); }

                    @Override
                    public void onLayout(PrintAttributes previous, PrintAttributes current,
                            CancellationSignal cancel, LayoutResultCallback callback, Bundle extras) {
                        webAdapter.onLayout(previous, current, cancel, callback, extras);
                    }

                    @Override
                    public void onWrite(android.print.PageRange[] pages, ParcelFileDescriptor output,
                            CancellationSignal cancel, WriteResultCallback callback) {
                        webAdapter.onWrite(pages, output, cancel, callback);
                    }

                    @Override
                    public void onFinish() {
                        webAdapter.onFinish();
                        releasePrintView();
                    }
                };
                try {
                    manager.print(title, adapter, attributes);
                } catch (IllegalStateException error) {
                    releasePrintView();
                    showToast("No se pudo abrir la impresión.");
                }
            }
        });
        view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private void releasePrintView() {
        if (printView != null) {
            printView.destroy();
            printView = null;
        }
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        sheetView.evaluateJavascript(
                "window.HC && HC.ui.handleAndroidBack ? HC.ui.handleAndroidBack() : false",
                handled -> { if (!"true".equals(handled)) finish(); });
    }

    @Override
    protected void onDestroy() {
        bridge.abortExport();
        releasePrintView();
        if (fileChooser != null) {
            fileChooser.onReceiveValue(null);
            fileChooser = null;
        }
        sheetView.removeJavascriptInterface("AndroidSpreadsheet");
        sheetView.destroy();
        super.onDestroy();
    }

    public final class ExportBridge {
        private FileOutputStream staging;
        private boolean waiting;

        @JavascriptInterface
        public synchronized boolean beginExport() {
            if (waiting || staging != null) return false;
            try {
                staging = new FileOutputStream(exportFile());
                return true;
            } catch (IOException error) {
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean appendExport(String chunk) {
            if (staging == null || chunk.length() > 350_000) return false;
            try {
                staging.write(Base64.decode(chunk, Base64.DEFAULT));
                return true;
            } catch (IOException | IllegalArgumentException error) {
                abortExport();
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean finishExport(String filename) {
            if (staging == null || filename.isEmpty() || filename.length() > 255) return false;
            try {
                staging.close();
            } catch (IOException error) {
                abortExport();
                return false;
            }
            staging = null;
            waiting = true;
            runOnUiThread(() -> openDocumentDestination(filename));
            return true;
        }

        @JavascriptInterface
        public synchronized void abortExport() {
            if (staging == null) return;
            try {
                staging.close();
            } catch (IOException ignored) {
                // The partial export is discarded below.
            }
            staging = null;
            exportFile().delete();
        }

        synchronized void complete(String result) {
            waiting = false;
            exportFile().delete();
            notifyExportResult(result);
        }

        @JavascriptInterface
        public void print(String title, String html) {
            runOnUiThread(() -> printDocument(title, html, new PrintAttributes.Builder().build()));
        }

        @JavascriptInterface
        public void printPdf(String title, String html, boolean landscape) {
            PrintAttributes.MediaSize paper = PrintAttributes.MediaSize.ISO_A4;
            PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(landscape ? paper.asLandscape() : paper)
                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                    .build();
            runOnUiThread(() -> printDocument(title, html, attributes));
        }

        @JavascriptInterface
        public void openLink(String url) {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)
                    && !"mailto".equalsIgnoreCase(scheme) && !"tel".equalsIgnoreCase(scheme)) return;
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent("tel".equalsIgnoreCase(scheme) ? Intent.ACTION_DIAL
                            : Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException | SecurityException error) {
                    showToast("No hay una aplicación para abrir este vínculo.");
                }
            });
        }

        @JavascriptInterface
        public void copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager clipboard = getSystemService(ClipboardManager.class);
                if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("Celdas", text));
            });
        }

        @JavascriptInterface
        public String pasteText() {
            ClipboardManager clipboard = getSystemService(ClipboardManager.class);
            ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0) return null;
            CharSequence text = clip.getItemAt(0).getText();
            return text == null ? null : text.toString();
        }
    }
}

