# AI Customer Discovery Platform

A full-stack platform that monitors Reddit, Hacker News, and web sources to discover potential customers seeking AI software solutions. It scores leads, surfaces them in a CRM-like dashboard, and suggests personalized outreach messages.

## Features

- **Keyword-Based Scraping** - Define keywords and the platform scans Reddit, Hacker News, and web sources worldwide
- **Lead Scoring Engine** - 0-100 scoring based on keyword density, recency, engagement, platform authority, and intent signals
- **CRM Dashboard** - Stats cards, trend charts, recent leads, and notification center
- **Lead Management** - Filter by platform, score, status. Track leads through new/contacted/qualified/closed pipeline
- **Outreach Suggestions** - AI-generated outreach message templates tailored to each lead's context
- **Real-Time Notifications** - Get notified when high-scoring leads are discovered
- **Scheduled Scraping** - Automated periodic scraping via cron jobs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, CSS Modules, Recharts |
| Backend | Node.js, Express, SQLite (better-sqlite3) |
| Auth | JWT with bcrypt password hashing |
| Security | Helmet, CORS, Rate Limiting, Input Validation |

## Architecture

```
frontend/          React SPA with dark theme CRM dashboard
  src/
    components/    Dashboard, Leads, Keywords, Notifications, Outreach, Auth
    context/       AuthContext, NotificationContext
    hooks/         useApi, useLeads, useKeywords
    services/      API service layer

backend/           Express REST API
  src/
    controllers/   Auth, Keywords, Leads, Dashboard, Notifications, Outreach
    services/
      scrapers/    BaseScraper (Strategy), RedditScraper, WebScraper, ScraperFactory
      KeywordEngine, LeadScoringEngine, NotificationService, OutreachSuggestionService
    models/        User, Keyword, Lead, Notification, OutreachTemplate
    middleware/    JWT Auth, Rate Limiter, Validator, Error Handler
```

### Design Patterns Used
- **Strategy Pattern** - Interchangeable scraper implementations
- **Factory Pattern** - ScraperFactory for extensible scraper registration
- **Observer Pattern** - NotificationService with subscriber-based event system
- **Repository Pattern** - Models encapsulate all database operations

## Quick Start

### Prerequisites
- Node.js 18+

### Installation

```bash
# Clone the repository
git clone https://github.com/shaikds/shaikarnirodasilva.git
cd shaikarnirodasilva

# Install all dependencies
npm run install:all

# Set up environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your settings (JWT_SECRET is required)
```

### Development

```bash
# Run both frontend and backend concurrently
npm run dev

# Or run them separately:
npm run dev:backend   # Backend on http://localhost:3001
npm run dev:frontend  # Frontend on http://localhost:5173
```

### Docker

```bash
docker-compose up --build
# Frontend: http://localhost:80
# Backend:  http://localhost:3001
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT token |
| GET | `/api/auth/profile` | Get current user profile |
| GET/POST | `/api/keywords` | List/create keywords |
| PUT/DELETE | `/api/keywords/:id` | Update/delete keyword |
| GET | `/api/leads` | List leads (with filters) |
| POST | `/api/leads/scrape` | Trigger scraping job |
| PATCH | `/api/leads/:id` | Update lead status/notes |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET | `/api/notifications` | List notifications |
| GET | `/api/outreach/suggest/:leadId` | Get outreach suggestions |

## Lead Scoring (0-100)

| Dimension | Points | Description |
|-----------|--------|-------------|
| Keyword Density | 0-30 | How many keywords match and match frequency |
| Recency | 0-20 | How recent the post is |
| Engagement | 0-20 | Upvotes, comments, reactions |
| Platform Authority | 0-15 | Platform credibility score |
| Intent Signals | 0-15 | Phrases like "looking for", "need help", "recommend" |

## Security

- JWT authentication with secure token handling
- Bcrypt password hashing (12 rounds)
- Helmet security headers
- CORS whitelisting
- Rate limiting (100 req/15min general, 20/15min auth, 5/5min scraping)
- Input validation and sanitization on all endpoints
- Parameterized SQL queries (no string concatenation)
- No secrets in codebase

## License

MIT
