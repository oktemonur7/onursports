# TV Canlı Maç — Android TV App

Android TV için kumanda (D-Pad) odaklı, minimalist canlı maç yayın uygulaması.

## Özellikler
- Falcon + Kobra sunucularından anlık maç listesi
- D-Pad navigasyon (ArrowUp/Down/Left/Right + OK + BACK)
- Kaynak popup: F-1 HD, K-1 gibi etiketli yayın seçimi
- Tam ekran iframe oynatıcı
- 5 dakikada bir otomatik yenileme

## APK Derleme

GitHub Actions otomatik olarak APK derler.  
`Actions` sekmesine gidin → en son başarılı iş → `TvLiveMatch-debug` artifact'ını indirin.

## TV'ye Kurulum

```bash
adb connect <TV_IP>:5555
adb install app-debug.apk
```
