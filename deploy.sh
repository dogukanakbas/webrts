#!/bin/bash

# WebRTC Video Streaming Server Deployment Script
# Bu script sunucuyu production ortamında deploy etmek için kullanılır

set -e

echo "🚀 WebRTC Video Streaming Server Deployment Başlıyor..."

# Renk kodları
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Log fonksiyonu
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Sistem gereksinimlerini kontrol et
check_requirements() {
    log "Sistem gereksinimleri kontrol ediliyor..."
    
    # Node.js kontrolü
    if ! command -v node &> /dev/null; then
        error "Node.js bulunamadı. Lütfen Node.js 16+ kurun."
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        error "Node.js 16+ gerekli. Mevcut versiyon: $(node --version)"
    fi
    
    # NPM kontrolü
    if ! command -v npm &> /dev/null; then
        error "NPM bulunamadı."
    fi
    
    # PM2 kontrolü
    if ! command -v pm2 &> /dev/null; then
        warning "PM2 bulunamadı. Kuruluyor..."
        npm install -g pm2
    fi
    
    log "✅ Sistem gereksinimleri karşılandı"
}

# Bağımlılıkları kur
install_dependencies() {
    log "Bağımlılıklar kuruluyor..."
    
    if [ ! -f "package.json" ]; then
        error "package.json bulunamadı. Lütfen proje dizininde olduğunuzdan emin olun."
    fi
    
    npm install --production
    log "✅ Bağımlılıklar kuruldu"
}

# Environment dosyası oluştur
create_env_file() {
    log "Environment dosyası oluşturuluyor..."
    
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# WebRTC Video Streaming Server Environment Variables
NODE_ENV=production
PORT=3000

# WebRTC Configuration
STUN_SERVER_1=stun:stun.l.google.com:19302
STUN_SERVER_2=stun:stun1.l.google.com:19302

# Security
CORS_ORIGIN=*

# Logging
LOG_LEVEL=info

# Performance
MAX_CONNECTIONS=100
STREAM_TIMEOUT=300000
EOF
        log "✅ .env dosyası oluşturuldu"
    else
        info ".env dosyası zaten mevcut"
    fi
}

# PM2 konfigürasyonu oluştur
create_pm2_config() {
    log "PM2 konfigürasyonu oluşturuluyor..."
    
    cat > ecosystem.config.js << EOF
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
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF
    log "✅ PM2 konfigürasyonu oluşturuldu"
}

# Log dizini oluştur
create_log_directory() {
    log "Log dizini oluşturuluyor..."
    
    mkdir -p logs
    log "✅ Log dizini oluşturuldu"
}

# Firewall ayarları
configure_firewall() {
    log "Firewall ayarları yapılandırılıyor..."
    
    if command -v ufw &> /dev/null; then
        # UFW kurulu
        sudo ufw allow 3000/tcp comment "WebRTC Streaming Server"
        sudo ufw allow 22/tcp comment "SSH"
        info "UFW kuralları eklendi"
    elif command -v firewall-cmd &> /dev/null; then
        # firewalld kurulu
        sudo firewall-cmd --permanent --add-port=3000/tcp
        sudo firewall-cmd --reload
        info "firewalld kuralları eklendi"
    else
        warning "Firewall bulunamadı. Manuel olarak 3000 portunu açın."
    fi
}

# Nginx konfigürasyonu (opsiyonel)
create_nginx_config() {
    if command -v nginx &> /dev/null; then
        log "Nginx konfigürasyonu oluşturuluyor..."
        
        sudo tee /etc/nginx/sites-available/webrtc-streaming << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
        
        sudo ln -sf /etc/nginx/sites-available/webrtc-streaming /etc/nginx/sites-enabled/
        sudo nginx -t && sudo systemctl reload nginx
        log "✅ Nginx konfigürasyonu oluşturuldu"
    else
        info "Nginx bulunamadı, atlanıyor"
    fi
}

# SSL sertifikası (Let's Encrypt)
setup_ssl() {
    if command -v certbot &> /dev/null && [ -n "$DOMAIN_NAME" ]; then
        log "SSL sertifikası kuruluyor..."
        
        sudo certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --email admin@$DOMAIN_NAME
        log "✅ SSL sertifikası kuruldu"
    else
        info "SSL kurulumu atlanıyor (certbot bulunamadı veya domain belirtilmedi)"
    fi
}

# Systemd service oluştur
create_systemd_service() {
    log "Systemd service oluşturuluyor..."
    
    sudo tee /etc/systemd/system/webrtc-streaming.service << EOF
[Unit]
Description=WebRTC Video Streaming Server
After=network.target

[Service]
Type=forking
User=$USER
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload ecosystem.config.js
ExecStop=/usr/bin/pm2 stop ecosystem.config.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable webrtc-streaming.service
    log "✅ Systemd service oluşturuldu"
}

# Sunucuyu başlat
start_server() {
    log "Sunucu başlatılıyor..."
    
    # PM2 ile başlat
    pm2 start ecosystem.config.js --env production
    pm2 save
    pm2 startup
    
    # Systemd service'i başlat
    sudo systemctl start webrtc-streaming.service
    
    log "✅ Sunucu başlatıldı"
}

# Durum kontrolü
check_status() {
    log "Sunucu durumu kontrol ediliyor..."
    
    sleep 5
    
    # PM2 durumu
    pm2 status
    
    # Systemd durumu
    sudo systemctl status webrtc-streaming.service --no-pager
    
    # Port kontrolü
    if netstat -tuln | grep -q ":3000 "; then
        log "✅ Sunucu 3000 portunda çalışıyor"
    else
        error "❌ Sunucu 3000 portunda çalışmıyor"
    fi
    
    # HTTP test
    if curl -s http://localhost:3000 > /dev/null; then
        log "✅ HTTP endpoint erişilebilir"
    else
        error "❌ HTTP endpoint erişilemiyor"
    fi
}

# Temizlik
cleanup() {
    log "Temizlik yapılıyor..."
    
    # Geçici dosyaları temizle
    rm -f *.tmp
    rm -f *.log
    
    log "✅ Temizlik tamamlandı"
}

# Ana deployment fonksiyonu
main() {
    log "WebRTC Video Streaming Server Deployment Başlıyor..."
    
    # Domain adı kontrolü
    if [ -n "$1" ]; then
        DOMAIN_NAME="$1"
        info "Domain: $DOMAIN_NAME"
    fi
    
    check_requirements
    install_dependencies
    create_env_file
    create_pm2_config
    create_log_directory
    configure_firewall
    create_nginx_config
    setup_ssl
    create_systemd_service
    start_server
    check_status
    cleanup
    
    log "🎉 Deployment başarıyla tamamlandı!"
    log "📱 Sunucu URL: http://$(hostname -I | awk '{print $1}'):3000"
    if [ -n "$DOMAIN_NAME" ]; then
        log "🌐 Domain URL: https://$DOMAIN_NAME"
    fi
    log "📊 PM2 Dashboard: pm2 monit"
    log "📋 Loglar: pm2 logs webrtc-streaming-server"
}

# Script'i çalıştır
main "$@"
