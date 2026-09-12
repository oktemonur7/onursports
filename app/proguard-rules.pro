# Add project specific ProGuard rules here.
# WebView + JavaScript interface koruması
-keepclassmembers class com.tvlive.match.TvBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
-keepattributes *Annotation*

# Leanback
-keep class androidx.leanback.** { *; }
