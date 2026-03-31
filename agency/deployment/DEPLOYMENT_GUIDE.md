# Deployment Guide

## Option 1: Railway (Recommended for Quick Deploy)

**Cost:** Free tier available, ~$5-20/month for production
**Best for:** Small-medium apps, fast setup

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create project
railway init

# 4. Add PostgreSQL
railway add --plugin postgresql

# 5. Set environment variables
railway variables set JWT_SECRET_KEY=your-secret-here
railway variables set APP_ENV=production

# 6. Deploy
railway up

# 7. Get your URL
railway domain
```

**Auto-deploy:** Connect to GitHub → deploys on push to main.

---

## Option 2: Render

**Cost:** Free tier available, ~$7-25/month for production
**Best for:** Simple deployment, free SSL

1. Go to render.com → New → Web Service
2. Connect GitHub repository
3. Settings:
   - Runtime: Python 3
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn src.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables
5. Deploy

---

## Option 3: Docker on VPS (DigitalOcean/Hetzner)

**Cost:** ~$5-20/month
**Best for:** Full control, multiple apps on one server

```bash
# 1. SSH into server
ssh root@your-server-ip

# 2. Install Docker
curl -fsSL https://get.docker.com | sh

# 3. Clone repo
git clone https://github.com/shaikds/client-project.git
cd client-project

# 4. Create .env
cp .env.example .env
nano .env  # Fill in production values

# 5. Build and run
docker compose up -d

# 6. Set up reverse proxy (nginx)
apt install nginx certbot python3-certbot-nginx

# 7. Configure nginx
cat > /etc/nginx/sites-available/app << 'EOF'
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/app /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 8. Get SSL certificate
certbot --nginx -d yourdomain.com
```

---

## Option 4: Vercel (Frontend Only)

**Cost:** Free tier generous
**Best for:** React/Next.js frontends

```bash
npm install -g vercel
vercel --prod
```

---

## Post-Deployment Checklist

- [ ] Application is running and accessible
- [ ] HTTPS is enabled (SSL certificate)
- [ ] Environment variables are set (not hardcoded)
- [ ] Database is connected and migrated
- [ ] Health check endpoint responds (`GET /`)
- [ ] Domain configured (DNS A record or CNAME)
- [ ] Error monitoring set up (see MONITORING_SETUP.md)
- [ ] Uptime monitoring set up
- [ ] Automated backups configured (database)
- [ ] CI/CD auto-deploys on push to main
- [ ] Logs are accessible
