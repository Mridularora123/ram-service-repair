# ram-service-repair

Starter private Shopify app + theme widget for RAM Servis Theme.
This package contains a minimal backend (Node/Express + MongoDB), a simple admin React app (single-file), data models (Mongoose), theme widget snippet, and deployment instructions for Render.

## What's included
- server.js (Express app with API endpoints)
- package.json
- models/Category.js, Model.js, RepairOption.js, ServiceRequest.js
- admin/ (simple React app files)
- theme/snippets/ram-service-widget.liquid (one-line include instruction)
- .env.example
- README with data model, pricing precedence, and admin instructions

## Quick start (local)
1. Copy files to your project folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Set environment variables (see .env.example).
4. Start:
   ```
   npm start
   ```

## Deploy to Render
- Create a new Web Service on Render using the repository.
- Set environment variables (MONGODB_URI, ADMIN_PASSWORD, SHOPIFY_API_KEY, SHOPIFY_API_SECRET, APP_URL).
- Use `npm start` as the start command.

See README for full details.
