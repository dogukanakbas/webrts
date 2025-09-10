# 🖥️ Sunucu Konfigürasyonu - 217.18.210.175

## 📋 Sunucu Bilgileri
- **IP Adresi**: 217.18.210.175
- **Port**: 3000
- **Protokol**: HTTP/HTTPS

## 🔧 Sunucuya Kurulum Komutları

### 1. Sunucuya Bağlan
```bash
ssh root@217.18.210.175
```

### 2. Sistem Güncellemesi
```bash
apt update && apt upgrade -y
apt install -y curl wget git build-essential nginx ufw
```

### 3. Node.js Kurulumu
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
```

### 4. Proje Kurulumu
```bash
mkdir -p /var/www/webrtc-streaming
cd /var/www/webrtc-streaming

# Dosyaları yükle (SCP ile)
# scp -r /Users/erlikhan/webrts/* root@217.18.210.175:/var/www/webrtc-streaming/

npm install
```

### 5. PM2 Kurulumu
```bash
npm install -g pm2

# PM2 konfigürasyonu
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'webrtc-streaming-server',
    script: 'server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

mkdir -p logs
```

### 6. Environment Dosyası
```bash
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
STUN_SERVER_1=stun:stun.l.google.com:19302
STUN_SERVER_2=stun:stun1.l.google.com:19302
CORS_ORIGIN=*
LOG_LEVEL=info
MAX_CONNECTIONS=100
STREAM_TIMEOUT=300000
EOF
```

### 7. Firewall Ayarları
```bash
ufw allow 22/tcp    # SSH
ufw allow 3000/tcp  # WebRTC Server
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable
```

### 8. Nginx Konfigürasyonu
```bash
cat > /etc/nginx/sites-available/webrtc-streaming << 'EOF'
server {
    listen 80;
    server_name 217.18.210.175;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/webrtc-streaming /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl enable nginx
```

### 9. Systemd Service
```bash
cat > /etc/systemd/system/webrtc-streaming.service << 'EOF'
[Unit]
Description=WebRTC Video Streaming Server
After=network.target

[Service]
Type=forking
User=www-data
WorkingDirectory=/var/www/webrtc-streaming
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable webrtc-streaming.service
```

### 10. Sunucuyu Başlat
```bash
cd /var/www/webrtc-streaming
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
systemctl start webrtc-streaming.service
```

## 🌐 Erişim URL'leri

- **Ana Sayfa**: http://217.18.210.175:3000
- **Streamer**: http://217.18.210.175:3000/streamer
- **Viewer**: http://217.18.210.175:3000/viewer
- **API**: http://217.18.210.175:3000/api/streams

## 🔍 Test Komutları

```bash
# Port kontrolü
netstat -tuln | grep :3000

# HTTP test
curl -I http://217.18.210.175:3000

# PM2 durumu
pm2 status

# Systemd durumu
systemctl status webrtc-streaming.service

# Log kontrolü
pm2 logs webrtc-streaming-server
```

## 📱 Raspberry Pi Bağlantısı

Raspberry Pi'de streamer kodunda sunucu IP'si:
```javascript
this.socket = io('http://217.18.210.175:3000');
```

## 🛠️ Yararlı Komutlar

```bash
# Sunucuyu yeniden başlat
pm2 restart webrtc-streaming-server

# Logları görüntüle
pm2 logs webrtc-streaming-server

# Nginx'i yeniden başlat
systemctl restart nginx

# Firewall durumu
ufw status

# Sistem kaynakları
htop
df -h
free -h
```

## ⚠️ Güvenlik Notları

1. **SSH Key**: SSH key authentication kullanın
2. **Firewall**: Sadece gerekli portları açın
3. **Updates**: Düzenli sistem güncellemeleri yapın
4. **Monitoring**: Sunucu kaynaklarını izleyin
5. **Backup**: Düzenli yedek alın

## 🔧 Sorun Giderme

### Port 3000 Açık Değil
```bash
# Port kontrolü
netstat -tuln | grep :3000

# PM2 durumu
pm2 status

# Log kontrolü
pm2 logs webrtc-streaming-server
```

### Nginx Hatası
```bash
# Nginx konfigürasyon testi
nginx -t

# Nginx logları
tail -f /var/log/nginx/error.log
```

### Firewall Sorunu
```bash
# Firewall durumu
ufw status

# Port açma
ufw allow 3000/tcp
```
