# 🎥 WebRTC Video Streaming Server

Raspberry Pi'den gelen video yayınını WebRTC teknolojisi ile başka bilgisayarlara aktaran modern streaming sunucusu.

## ✨ Özellikler

- 🚀 **Gerçek Zamanlı Streaming**: Düşük gecikme ile video akışı
- 📱 **Çoklu Platform**: Web, mobil ve desktop uyumlu
- 🔗 **Peer-to-Peer**: WebRTC ile doğrudan bağlantı
- 👥 **Çoklu İzleyici**: Aynı anda birden fazla izleyici
- 🎨 **Modern UI**: Responsive ve kullanıcı dostu arayüz
- 🔒 **Güvenli**: WebRTC'nin güvenli bağlantı protokolü

## 🏗️ Mimari

```
Raspberry Pi (Kamera) → WebRTC Server → İzleyici Cihazlar
     📹                    🖥️              👀👀👀
```

## 🚀 Hızlı Başlangıç

### 1. Sunucu Kurulumu

```bash
# Projeyi klonla
git clone <repository-url>
cd webrts

# Bağımlılıkları kur
npm install

# Sunucuyu başlat
npm start
```

### 2. Erişim URL'leri

- **Ana Sayfa**: http://217.18.210.175:3000
- **Streamer (Raspberry Pi)**: http://217.18.210.175:3000/streamer
- **Viewer (İzleyici)**: http://217.18.210.175:3000/viewer
- **API**: http://217.18.210.175:3000/api/streams

### 3. Raspberry Pi Kurulumu

Detaylı kurulum için [raspberry-pi-setup.md](raspberry-pi-setup.md) dosyasını inceleyin.

## 📋 Gereksinimler

### Sunucu
- Node.js 16+
- 2GB+ RAM
- 100Mbps+ internet bağlantısı

### Raspberry Pi
- Raspberry Pi 3B+ veya üzeri
- Kamera modülü (v2 veya HQ)
- 8GB+ microSD kart
- Güçlü internet bağlantısı

### İzleyici Cihazlar
- Modern web tarayıcısı (Chrome, Firefox, Safari, Edge)
- WebRTC desteği
- 5Mbps+ internet bağlantısı

## 🛠️ Teknoloji Stack

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: HTML5 + CSS3 + JavaScript + WebRTC API
- **Real-time**: Socket.io WebSocket
- **Video**: WebRTC PeerConnection
- **Styling**: Modern CSS Grid/Flexbox

## 📁 Proje Yapısı

```
webrts/
├── server.js              # Ana sunucu dosyası
├── package.json           # NPM konfigürasyonu
├── public/                # Web arayüzü
│   ├── index.html         # Ana sayfa
│   ├── streamer.html      # Streamer arayüzü
│   └── viewer.html        # Viewer arayüzü
├── raspberry-pi-setup.md  # Raspberry Pi kurulum rehberi
└── README.md             # Bu dosya
```

## 🔧 Konfigürasyon

### Sunucu Ayarları

```javascript
// server.js içinde
const PORT = process.env.PORT || 3000;

// WebRTC ICE Servers
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
```

### Raspberry Pi Ayarları

```bash
# Kamera çözünürlüğü
--width 1280 --height 720

# Frame rate
--framerate 30

# Bitrate
--bitrate 2500000
```

## 🚀 Deployment

### Production Sunucu

```bash
# PM2 ile deployment
npm install -g pm2
pm2 start server.js --name webrtc-server
pm2 startup
pm2 save
```

### Docker ile Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Docker build ve run
docker build -t webrtc-server .
docker run -p 3000:3000 webrtc-server
```

## 📊 API Endpoints

### GET /api/streams
Aktif streamleri listeler.

**Response:**
```json
[
  {
    "id": "stream-id",
    "streamerId": "socket-id",
    "viewerCount": 3,
    "streamData": {
      "title": "Raspberry Pi Stream",
      "description": "Live video from Raspberry Pi"
    }
  }
]
```

### GET /api/stream/:id
Belirli bir stream hakkında bilgi verir.

**Response:**
```json
{
  "id": "stream-id",
  "streamerId": "socket-id",
  "viewerCount": 3,
  "streamData": {
    "title": "Raspberry Pi Stream",
    "description": "Live video from Raspberry Pi"
  }
}
```

## 🔒 Güvenlik

- **HTTPS**: Production'da SSL sertifikası kullanın
- **CORS**: Cross-origin istekleri kontrol edilir
- **Rate Limiting**: Aşırı istekleri engelleyin
- **Authentication**: Gerekirse kullanıcı doğrulama ekleyin

## 🐛 Sorun Giderme

### Yaygın Sorunlar

1. **Kamera Erişim Hatası**
   ```bash
   # Raspberry Pi'de kamera modülünü kontrol et
   vcgencmd get_camera
   ```

2. **WebRTC Bağlantı Hatası**
   - STUN/TURN sunucularını kontrol edin
   - Firewall ayarlarını kontrol edin
   - HTTPS kullanın (production'da)

3. **Yüksek CPU Kullanımı**
   - Video çözünürlüğünü düşürün
   - Frame rate'i azaltın
   - GPU memory'yi artırın

### Log Kontrolü

```bash
# Sunucu logları
pm2 logs webrtc-server

# Raspberry Pi logları
sudo journalctl -u webrtc-streamer.service -f
```

## 📈 Performans Optimizasyonu

### Sunucu Tarafı
- **Load Balancing**: Nginx ile yük dağıtımı
- **CDN**: Statik dosyalar için CDN kullanımı
- **Caching**: Redis ile cache mekanizması

### Raspberry Pi Tarafı
- **GPU Memory**: 128MB+ GPU memory ayırın
- **Overclock**: Güvenli overclock yapın
- **Cooling**: Aktif soğutma kullanın

### Ağ Optimizasyonu
- **Bandwidth**: Yeterli upload hızı
- **Latency**: Düşük gecikme için yakın sunucu
- **QoS**: Video trafiği için QoS ayarları

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🙏 Teşekkürler

- WebRTC topluluğu
- Socket.io ekibi
- Raspberry Pi Foundation
- Tüm katkıda bulunanlar

## 📞 Destek

Sorularınız için:
- GitHub Issues
- Email: your-email@example.com
- Discord: [Sunucu Linki]

---

**Not**: Bu proje eğitim amaçlıdır. Production kullanımı için ek güvenlik önlemleri alın.
