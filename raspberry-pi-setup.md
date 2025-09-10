# Raspberry Pi WebRTC Video Streaming Kurulumu

## 🍓 Raspberry Pi Konfigürasyonu

### 1. Sistem Güncellemesi
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Kamera Modülünü Etkinleştirme
```bash
# Kamera modülünü etkinleştir
sudo raspi-config
# Interface Options > Camera > Enable

# Veya manuel olarak
echo "start_x=1" | sudo tee -a /boot/config.txt
echo "gpu_mem=128" | sudo tee -a /boot/config.txt
```

### 3. Gerekli Paketleri Kurma
```bash
# Node.js kurulumu
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Kamera test araçları
sudo apt install -y v4l-utils fswebcam

# Geliştirme araçları
sudo apt install -y git build-essential
```

### 4. Kamera Testi
```bash
# Kamera listesini görme
v4l2-ctl --list-devices

# Kamera testi
fswebcam --no-banner test.jpg

# Video testi
libcamera-vid --width 1280 --height 720 --framerate 30 --output test.h264
```

### 5. WebRTC Streamer Kurulumu (Raspberry Pi için)

#### Yöntem A: Node.js ile WebRTC
```bash
# Proje dizini oluştur
mkdir ~/webrtc-streamer
cd ~/webrtc-streamer

# Package.json oluştur
cat > package.json << 'EOF'
{
  "name": "raspberry-pi-webrtc-streamer",
  "version": "1.0.0",
  "description": "WebRTC video streaming from Raspberry Pi",
  "main": "streamer.js",
  "scripts": {
    "start": "node streamer.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io-client": "^4.7.2",
    "node-rtc": "^0.1.0"
  }
}
EOF

# Paketleri kur
npm install
```

#### Yöntem B: Python ile WebRTC
```bash
# Python paketlerini kur
sudo apt install -y python3-pip python3-opencv

# Gerekli Python paketleri
pip3 install opencv-python websockets asyncio
```

### 6. Raspberry Pi Streamer Kodu

#### Node.js Versiyonu
```javascript
// streamer.js
const express = require('express');
const io = require('socket.io-client');
const { spawn } = require('child_process');

class RaspberryPiStreamer {
    constructor() {
        this.socket = io('http://217.18.210.175:3000');
        this.streamProcess = null;
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Sunucuya bağlandı');
            this.socket.emit('streamer-join', {
                streamId: 'raspberry-pi-stream',
                streamData: {
                    title: 'Raspberry Pi Kamera',
                    description: 'Live video from Raspberry Pi camera'
                }
            });
        });

        this.socket.on('viewer-joined', (data) => {
            console.log(`👀 Yeni izleyici: ${data.viewerId}`);
            this.startStreaming();
        });
    }

    startStreaming() {
        if (this.streamProcess) return;

        // libcamera-vid ile video akışı başlat
        this.streamProcess = spawn('libcamera-vid', [
            '--width', '1280',
            '--height', '720',
            '--framerate', '30',
            '--bitrate', '2500000',
            '--output', '-',
            '--inline'
        ]);

        this.streamProcess.stdout.on('data', (data) => {
            // Video verilerini sunucuya gönder
            this.socket.emit('stream-data', {
                streamId: 'raspberry-pi-stream',
                data: data.toString('base64')
            });
        });

        this.streamProcess.stderr.on('data', (data) => {
            console.error(`Stream error: ${data}`);
        });
    }

    stopStreaming() {
        if (this.streamProcess) {
            this.streamProcess.kill();
            this.streamProcess = null;
        }
    }
}

new RaspberryPiStreamer();
```

#### Python Versiyonu
```python
# streamer.py
import cv2
import socketio
import base64
import asyncio

class RaspberryPiStreamer:
    def __init__(self):
        self.sio = socketio.AsyncClient()
        self.cap = None
        self.setup_handlers()
    
    def setup_handlers(self):
        @self.sio.event
        async def connect():
            print('✅ Sunucuya bağlandı')
            await self.sio.emit('streamer-join', {
                'streamId': 'raspberry-pi-stream',
                'streamData': {
                    'title': 'Raspberry Pi Kamera',
                    'description': 'Live video from Raspberry Pi camera'
                }
            })
        
        @self.sio.event
        async def viewer_joined(data):
            print(f'👀 Yeni izleyici: {data["viewerId"]}')
            await self.start_streaming()
    
    async def start_streaming(self):
        # Kamera başlat
        self.cap = cv2.VideoCapture(0)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        
        while True:
            ret, frame = self.cap.read()
            if ret:
                # Frame'i JPEG'e çevir
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                frame_data = base64.b64encode(buffer).decode('utf-8')
                
                # Sunucuya gönder
                await self.sio.emit('stream-data', {
                    'streamId': 'raspberry-pi-stream',
                    'data': frame_data
                })
            
            await asyncio.sleep(0.033)  # ~30 FPS
    
    async def run(self):
        await self.sio.connect('http://217.18.210.175:3000')
        await self.sio.wait()

if __name__ == '__main__':
    streamer = RaspberryPiStreamer()
    asyncio.run(streamer.run())
```

### 7. Otomatik Başlatma (Systemd Service)

```bash
# Service dosyası oluştur
sudo nano /etc/systemd/system/webrtc-streamer.service
```

```ini
[Unit]
Description=WebRTC Video Streamer
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/webrtc-streamer
ExecStart=/usr/bin/node streamer.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# Service'i etkinleştir
sudo systemctl enable webrtc-streamer.service
sudo systemctl start webrtc-streamer.service

# Durumu kontrol et
sudo systemctl status webrtc-streamer.service
```

### 8. Ağ Konfigürasyonu

```bash
# Statik IP ayarla (opsiyonel)
sudo nano /etc/dhcpcd.conf
```

```
interface eth0
static ip_address=192.168.1.100/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4
```

### 9. Güvenlik Duvarı Ayarları

```bash
# UFW kurulumu
sudo apt install ufw

# Gerekli portları aç
sudo ufw allow 22    # SSH
sudo ufw allow 3000  # WebRTC Server
sudo ufw enable
```

### 10. Performans Optimizasyonu

```bash
# GPU memory artır
sudo nano /boot/config.txt
```

```
gpu_mem=128
gpu_mem_256=128
gpu_mem_512=256
```

### 11. Test ve Doğrulama

```bash
# Kamera testi
libcamera-hello --timeout 5000

# Video kayıt testi
libcamera-vid --width 1280 --height 720 --timeout 10000 --output test.h264

# Stream testi
libcamera-vid --width 1280 --height 720 --bitrate 2500000 --output - | ffplay -
```

## 🔧 Sorun Giderme

### Kamera Bulunamıyor
```bash
# Kamera modülünü kontrol et
vcgencmd get_camera

# Kamera listesini gör
ls /dev/video*

# libcamera test
libcamera-hello --list-cameras
```

### Performans Sorunları
```bash
# CPU kullanımını izle
htop

# Sıcaklığı kontrol et
vcgencmd measure_temp

# GPU kullanımını kontrol et
vcgencmd get_mem gpu
```

### Ağ Bağlantı Sorunları
```bash
# Ağ durumunu kontrol et
ip addr show
ping google.com

# Port erişimini test et
telnet YOUR_SERVER_IP 3000
```

## 📱 Mobil Erişim

Raspberry Pi'yi mobil cihazlardan erişilebilir yapmak için:

1. **Port Forwarding**: Router'da 3000 portunu forward edin
2. **Dynamic DNS**: No-IP veya DuckDNS kullanın
3. **SSL Sertifikası**: Let's Encrypt ile HTTPS aktif edin

Bu kurulum ile Raspberry Pi'niz WebRTC sunucunuza video akışı gönderebilecek!
