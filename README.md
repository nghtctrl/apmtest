# Getting Started

## Prerequisites

You will need a [Netlify](https://www.netlify.com/) and a [Neon](https://neon.com/) account (you’ll connect Neon later).

## Setup

1. Fork this repository.

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the Netlify development environment:

   ```bash
   npx netlify dev
   ```

4. Follow the interactive prompts:

   * Create & configure a new Netlify project
   * Authorize Netlify when prompted
   * Accept the default configurations (you can customize the project name if desired)

5. Run database migrations:

   ```bash
   npm run db:migrate
   ```

6. Once setup is complete, your app will be deployed at: `https://<project-name>.netlify.app`

7. In the Netlify dashboard, navigate to **Extensions → Neon** and claim your database (it will expire if it is no claimed).

## Local Development

To run and test the app locally at any time:

```bash
npx netlify dev
```

## Important

* Database interactions in the local development environment affect the production database (e.g., creating a new user account, creating a new APM project).
* By default, Netlify automatically deploys every commit pushed to the `main` branch. Each deployment uses up monthly free-tier credits. You can configure this setting on the Netlify dashboard.
