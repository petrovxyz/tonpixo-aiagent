# Tonpixo AI Agent

Tonpixo is an advanced, autonomous and serverless AI agent that transforms natural language into complex SQL queries for the TON (The Open Network) blockchain data. It provides users with deep insights into transactions, jettons, and NFTs for specified address using a conversational interface via Telegram Mini App (TMA).

Built during [TON x AWS AI-Powered Hack](https://t.me/tonushub/44).

## Technology stack

### Backend
*   **Framework**: [FastAPI](https://fastapi.tiangolo.com/).
*   **Serverless runtime**: AWS Lambda (Container Image support).
*   **AI engine**:
    *   [LangChain](https://www.langchain.com/) & [LangGraph](https://langchain-ai.github.io/langgraph/) - orchestration of AI agents.
    *   **AWS Bedrock** - foundation models (Claude Haiku 4.5).
*   **Database**:
    *   **Amazon DynamoDB** - NoSQL database for users, chats, jobs, and favorites.
    *   **Amazon S3** - object storage for transaction data (Parquet format) and analysis results.
*   **Data processing**:
    *   **Data provider**: [TON API](https://tonapi.io/).
    *   **Labels**: [ton-labels](https://github.com/ton-studio/ton-labels).
    *   **AWS Athena** & **AWS Glue** - serverless interactivity query service for analyzing blockchain data.
    *   **Pandas** & **AWS Wrangler** - data manipulation.
*   **Queue**: Amazon SQS - decoupling long-running scanning jobs from the API.
*   **Observability**: [Langfuse](https://langfuse.com/) - LLM engineering platform for tracing and metrics.

### Frontend
*   **Framework**: [Next.js 16](https://nextjs.org/) (App Router).
*   **Language**: TypeScript.
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & Vanilla CSS.
*   **UI Components**: FontAwesome, Framer Motion (animations), Recharts (charts).
*   **Integration**: Telegram Mini Apps SDK (`@tma.js/sdk`).

### Infrastructure (AWS)
*   **AWS SAM (Serverless Application Model)** - Infrastructure as Code (IaC).
*   **Amazon API Gateway** - REST API entry point.
*   **Amazon Secrets Manager** - secure management of API keys and tokens.

---

## Example flow

### User query

User: *"How much TON did I send to Binance last month?"*

### Step 1: intent analysis & schema lookup (Agent Lambda)
The Agent (Claude Haiku 4.5) receives the text. It retrieves the database schema from the system prompt and identifies the necessary filters.

### Step 2: SQL generation
The Agent generates a precise Presto/Trino SQL query. It does not fetch rows to Python; it pushes the compute to the database engine.

### Step 3: serverless execution (Amazon Athena)
1. The query is sent to Athena.
2. Using Partition Projection, Athena instantly locates the specific S3 folder: `s3://.../data/transactions/job_id=user_123/`.
3. It scans only the relevant Parquet files (e.g., 50KB of data) instead of the whole blockchain history.
4. Aggregation is performed on the AWS side.

### Step 4: result processing
Athena returns a lightweight result to the Lambda function.

### Step 5: final response
The Agent interprets the number and generates a natural language response (or a JSON payload for the UI).

- Zero RAM load: the Python Lambda never loaded the transaction history. It only handled the final number.
- Cost effective: we scanned only one user's data instead of querying a full database.
- Safety: the SQL generation layer is sandboxed, and the IAM role limits Athena to read-only access.

---

## Project structure

```bash
.
├── backend/                # Python FastAPI Serverless Application
│   ├── agent.py            # AI Agent logic and LangGraph definition
│   ├── main.py             # FastAPI entry point and routes
│   ├── template.yaml       # AWS SAM Infrastructure definition
│   ├── requirements.txt    # Python dependencies
│   └── worker/             # Background worker logic for processing jobs
├── frontend/               # Next.js Web Application
│   ├── app/                # App Router pages and layouts
│   ├── components/         # Reusable React components
│   └── public/             # Static assets
└── README.md               # This file
└── LICENSE                 # License
```

---

## Prerequisites

Before deploying, ensure you have the following installed:

1.  **AWS CLI** - [install guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
2.  **AWS SAM CLI** - [install guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
3.  **Docker** - required for building Lambda container images.
4.  **Node.js 20+** - for frontend.
5.  **Python 3.12** - for backend local development.

---

## Deployment guide (AWS)

This application is designed to be deployed using AWS SAM. Follow these steps carefully to deploy the full stack to your AWS account.

### 1. Build the backend

Navigate to the backend directory and build the application. We use `--use-container` to ensure the Python dependencies (like Pandas and NumPy) are compiled correctly for the AWS Lambda Linux environment.

```bash
cd backend
sam build --use-container
```

### 2. Initial deployment

If this is your **first time** deploying, run guided deployment once per profile. This will save profile-specific config in `samconfig.toml`.

```bash
sam deploy --guided --config-env main
sam deploy --guided --config-env dev
```

You will be prompted to enter parameters. Have the following ready:
*   **Stack Name**: use separate stacks, e.g. `tonpixo-main` and `tonpixo-dev`
*   **Region**: e.g., `us-east-1`
*   **DeploymentProfile**: `main` or `dev` (select based on branch)
*   **TonApiKey**: your API key from [tonapi.io](https://tonapi.io/).
*   **TelegramBotTokenMain**: your Bot Token for `main` deployments.
*   **TelegramBotTokenDev**: your Bot Token for `dev` deployments.
*   **LangfuseSecretKey**: your Secret Key from Langfuse.
*   **LangfusePublicKey**: your Public Key from Langfuse.
*   **LangfuseHost**: defaults to `https://cloud.langfuse.com`.

**Note:** when asked if you want to save arguments to configuration file, say **Y**.

### 3. Subsequent deployments

For future updates, use the profile-specific commands below. They build the container and deploy using saved profile configuration.

```bash
sam build --use-container && sam deploy --config-env main --resolve-image-repos --no-confirm-changeset
sam build --use-container && sam deploy --config-env dev --resolve-image-repos --no-confirm-changeset
```

**Command breakdown:**
*   `sam build --use-container`: builds the application using a Docker container to ensure compatibility with AWS Lambda.
*   `--config-env main|dev`: picks the matching profile from `samconfig.toml` (`tonpixo-main` or `tonpixo-dev` stack and `DeploymentProfile`).
*   `--resolve-image-repos`: automatically creates and manages ECR repositories for your Docker images.
*   `--no-confirm-changeset`: deploys immediately without waiting for manual confirmation of the changeset.

### 4. Deploying the frontend

After the backend is deployed, SAM will output the `FunctionUrl`. You need to configure this in your frontend.

1.  Create a `.env.local` file in the `frontend` folder or specify the environment variables in the Vercel / AWS Amplify console.
2.  Add your backend URL:
    ```env
    NEXT_PUBLIC_API_URL=https://your-api-id.execute-api.region.amazonaws.com/Prod
    AMPLIFY_MONOREPO_APP_ROOT=frontend
    ```
3.  Deploy requests to Vercel, AWS Amplify, or any static hosting provider.
    ```bash
    cd frontend
    npm run build
    ```

---

## Local development

### Backend

Use separate env files per branch to avoid `TELEGRAM_BOT_TOKEN` conflicts:

```bash
git checkout main
cp backend/env.main.example backend/.env.main

git checkout dev
cp backend/env.dev.example backend/.env.dev
```

The backend auto-loads:
- `.env.dev` on `dev` / `development` branch
- `.env.main` on `main` / `master` branch
- `.env.local`, then `.env` as fallback

You can force a profile manually with `TONPIXO_ENV=dev` or `TONPIXO_ENV=main`.

1.  Navigate to `backend`:
    ```bash
    cd backend
    ```
2.  Create and activate a virtual environment:
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Create your branch-specific env file (`.env.dev` or `.env.main`) and fill keys (see `template.yaml` parameters).
5.  Run the local server:
    ```bash
    python main.py
    ```

### Frontend

1.  Navigate to `frontend`:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    ```
3.  Run the development server:
    ```bash
    npm run dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. Note that to test Telegram-specific features, you specifically need to open the app via the Telegram client.

---

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

* **Permitted:** personal use, educational use, testing, and contribution.
* **Prohibited:** any commercial use (selling the code, using it for a paid service, integration into a commercial product) without prior permission.

For commercial inquiries, please contact the author: [Telegram](https://t.me/petrovxyz).