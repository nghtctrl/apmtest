# Getting Started

## Prerequisites

You will need [Netlify](https://www.netlify.com/) and [Neon](https://neon.com/) accounts (you will need a Neon account to claim your database on Netlify, as explained below). They both offer free-tier access. You will also need access to the project `.env` file, which includes the `DATABASE_URL` for the shared dummy database. Please contact us for `.env` file.

## One-Time Setup

1. Fork this repository.

2. Place the provided `.env` file in the root directory of the project.

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the Netlify development environment:

   ```bash
   npx netlify dev
   ```

5. Complete the setup prompts:

   * Select "Create & configure a new Netlify project"
   * Authorize Netlify when prompted
   * Accept the default configurations (you may customize the project name if desired)

You may see warnings about "no database found." This refers to the new *empty* database created when setting up a Netlify project (see notes below). These warnings can be safely ignored for local development.

## Local Development

To run the app locally at any time (after completing one-time setup):

```bash
npx netlify dev
```

## Contributing

Send a pull request.

## Important Notes

* The one-time setup creates a new Netlify project with its own *empty* database (it will also need to be [claimed](https://docs.netlify.com/build/data-and-storage/netlify-db/#claim-your-database) within 7 days). As a result, your deployment will not be connected to the shared dummy database, while your local development environment will be via `.env` file.
* If you plan to host your own apmtest deployment on Netlify, you may want to clone our dummy database to populate your empty database.
* Any database operations performed on the local development environment (e.g., creating new users or APM projects) will directly affect the shared dummy database.
* Netlify automatically deploys every commit pushed to the `main` branch. These deployments count toward your monthly free-tier usage. You can adjust this behavior in the Netlify dashboard.
