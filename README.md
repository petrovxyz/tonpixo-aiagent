# Tonpixo AI Agent

Tonpixo is an advanced, autonomous and serverless AI agent that transforms natural language into complex SQL queries for the TON (The Open Network) blockchain data. It provides users with deep insights into transactions, jettons, and NFTs for specified address using a conversational interface via Telegram Mini App (TMA).

Built during [TON x AWS AI-Powered Hack](https://t.me/tonushub/44).

> Current architecture split:
> - `tonpixo-aiagent` (this repo) keeps the LangGraph + Bedrock orchestration brain in AWS Lambda.
> - `tonpixo-mcp` (separate sibling repo) runs as external MCP tool/prompt server.
> - Lambda acts as MCP client (`backend/mcp_client.py`) and calls MCP for tools/resources.

## What's new (MCP split)

*   Agent orchestration remains in AWS Lambda; tools/prompts moved to external MCP service.
*   New backend MCP client with retries/timeouts and prompt/tool discovery.
*   SAM template now includes MCP parameters: `McpBaseUrl`, `McpBearerToken`, `McpTimeoutMs`, `McpRetryMax`.
*   Production-ready MCP setup supports separate `main`/`dev` MCP domains with distinct tokens.

## Technology stack

### Backend
*   **Framework**: [FastAPI](https://fastapi.tiangolo.com/).
*   **Serverless runtime**: AWS Lambda (Container Image support).
*   **AI engine**:
    *   [LangChain](https://www.langchain.com/) & [LangGraph](https://langchain-ai.github.io/langgraph/) - agent orchestration in Lambda.
    *   **AWS Bedrock** - foundation model inference (Claude Haiku 4.5).
    *   **MCP client integration** - remote tools/prompt resources fetched from Tonpixo MCP server.
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

### External MCP service
*   **Repository**: sibling repo `tonpixo-mcp` (outside this workspace root).
*   **Hosting**: Hetzner CPX11 (`x86_64`, us-east) with Docker Compose + Caddy TLS.
*   **Role**: exposes MCP tools/resources only (`sql_query`, `generate_chart_data`, system prompt, schemas).

---

## Example flow

### User query

User: *"How much TON did I send to Binance last month?"*

### Step 1: intent analysis & schema lookup (Agent Lambda)
The Agent (Claude Haiku 4.5) receives the text in Lambda. It loads prompt/resource context via MCP and identifies necessary filters.

### Step 2: SQL generation
The Agent generates a precise Presto/Trino SQL query. It does not fetch rows to Python; it pushes the compute to the database engine.

### Step 3: tool execution (MCP -> Athena)
1. Lambda invokes MCP `sql_query` tool over HTTPS.
2. MCP executes the scoped query in Athena/Glue.
3. Using Partition Projection, Athena instantly locates `s3://.../data/transactions/job_id=user_123/`.
4. It scans only the relevant Parquet files instead of full history.
5. Aggregation remains on AWS side.

### Step 4: result processing
MCP returns a lightweight result to Lambda, and LangGraph continues local reasoning.

### Step 5: final response
The Agent interprets the number and generates a natural language response (or a JSON payload for the UI).

- Zero RAM load: the Python Lambda never loaded the transaction history. It only handled the final number.
- Cost effective: we scanned only one user's data instead of querying a full database.
- Safety: SQL guardrails are enforced in MCP and IAM permissions are scoped for Athena/Glue/S3 result paths.

---

## Project structure

```bash
.
├── backend/                # Python FastAPI Serverless Application
│   ├── agent.py            # LangGraph + Bedrock orchestration (AWS brain)
│   ├── mcp_client.py       # MCP HTTP client for tools/resources
│   ├── main.py             # FastAPI entry point and routes
│   ├── template.yaml       # AWS SAM Infrastructure definition
│   ├── requirements.txt    # Python dependencies
│   └── worker/             # Background worker logic for processing jobs
├── frontend/               # Next.js Web Application
│   ├── app/                # App Router pages and layouts
│   ├── components/         # Reusable React components
│   └── public/             # (empty) assets are served from S3
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
*   **McpBaseUrl**: public HTTPS URL of your MCP service (e.g. `https://mcp.example.com`).
*   **McpBearerToken**: shared bearer token for Lambda -> MCP authentication.
*   **McpTimeoutMs**: request timeout in milliseconds (default `20000`).
*   **McpRetryMax**: retry count for transient MCP failures (default `2`).

Recommended mapping for separate stacks:
*   **main stack (`tonpixo-main`)**: `McpBaseUrl=https://mcp-main.<your-domain>` and main token.
*   **dev stack (`tonpixo-dev`)**: `McpBaseUrl=https://mcp-dev.<your-domain>` and dev token.

These values are wired in `backend/template.yaml` as:
*   Lambda env vars: `MCP_BASE_URL`, `MCP_TIMEOUT_MS`, `MCP_RETRY_MAX`
*   Secret value: `MCP_BEARER_TOKEN` (inside `AppSecrets`)

**Note:** when asked if you want to save arguments to configuration file, say **Y**.

### 3. Subsequent deployments

For future updates, **`--guided` is not needed** — parameters are already saved in `samconfig.toml`.

**Build once** (both stacks share the same code):
```bash
sam build --use-container
```

**Deploy to each environment separately:**
```bash
sam deploy --config-env dev --resolve-image-repos --no-confirm-changeset
sam deploy --config-env main --resolve-image-repos --no-confirm-changeset
```

Or as a single one-liner (build once, deploy both):
```bash
sam build --use-container && sam deploy --config-env dev --resolve-image-repos --no-confirm-changeset && sam deploy --config-env main --resolve-image-repos --no-confirm-changeset
```

**Command breakdown:**
*   `sam build --use-container`: builds the Docker images. Only needs to run once since both stacks use the same code.
*   `--config-env main|dev`: picks the matching profile from `samconfig.toml` (`tonpixo-main` or `tonpixo-dev` stack and `DeploymentProfile`).
*   `--resolve-image-repos`: automatically creates and manages ECR repositories for your Docker images.
*   `--no-confirm-changeset`: deploys immediately without waiting for manual confirmation of the changeset.

### 4. Deploying the frontend

After the backend is deployed, SAM outputs two URLs per stack:

| Output | Description |
|--------|-------------|
| `ApiUrl` | API Gateway endpoint (e.g. `https://xxx.execute-api.region.amazonaws.com/Prod/`) |
| `FunctionUrl` | Lambda Function URL (e.g. `https://xxx.lambda-url.region.on.aws/`) |

You can view them at any time:
```bash
aws cloudformation describe-stacks --stack-name tonpixo-dev --query 'Stacks[0].Outputs' --output table
aws cloudformation describe-stacks --stack-name tonpixo-main --query 'Stacks[0].Outputs' --output table
```

> **⚠️ IMPORTANT: Always use the Lambda Function URL, NOT the API Gateway URL.**
>
> The backend uses AWS Lambda Web Adapter with `RESPONSE_STREAM` invoke mode for SSE streaming.
> API Gateway does **not** support response streaming — requests sent to the API Gateway URL
> will return **502 Bad Gateway** (which the browser masks as a CORS error).
> Only the Lambda Function URL supports streaming responses correctly.

#### Frontend environment variables

The frontend resolves the backend URL using the following priority (first match wins):

| Priority | Variable | When it's used |
|----------|----------|----------------|
| 1 | `window.__TONPIXO_BACKEND_CONFIG__` | Runtime config injected by `layout.tsx` (server-side) |
| 2 | `NEXT_PUBLIC_DEV_API_URL` / `NEXT_PUBLIC_MAIN_API_URL` | Auto-selected by hostname (`dev.*` → dev, `main.*` → main) |
| 3 | `NEXT_PUBLIC_API_URL` | Generic fallback for non-branch-specific hosting |
| 4 | `http://127.0.0.1:8000` | Localhost fallback (only on `localhost` / `127.0.0.1`) |

The same priority applies for the stream URL (`NEXT_PUBLIC_DEV_STREAM_URL`, `NEXT_PUBLIC_MAIN_STREAM_URL`, etc.).

#### Frontend assets

The backend template auto-creates a **shared** assets bucket in the **main** stack:
`tonpixo-assets-<account-id>-<region>`.
Deploy the **main** stack at least once to create this bucket before using uploads from dev.

Provide a single shared assets base URL for both dev and main:

```env
NEXT_PUBLIC_ASSETS_BASE_URL=https://tonpixo-assets-<account-id>-<region>.s3.<region>.amazonaws.com/assets
```

The frontend will resolve image URLs by prefixing paths like `images/preloader.webp` with this base URL.

#### Option A: AWS Amplify (recommended)

Set these as **app-level** environment variables in the Amplify console (or via CLI). The app auto-selects the correct URL by matching the hostname (`dev.*` → `DEV_*`, `main.*` → `MAIN_*`).

```env
# Required
AMPLIFY_MONOREPO_APP_ROOT=frontend

# Dev stack — use the FunctionUrl from tonpixo-dev stack output
NEXT_PUBLIC_DEV_API_URL=https://<dev-function-id>.lambda-url.<region>.on.aws
NEXT_PUBLIC_DEV_STREAM_URL=https://<dev-function-id>.lambda-url.<region>.on.aws

# Main/prod stack — use the FunctionUrl from tonpixo-main stack output
NEXT_PUBLIC_MAIN_API_URL=https://<main-function-id>.lambda-url.<region>.on.aws
NEXT_PUBLIC_MAIN_STREAM_URL=https://<main-function-id>.lambda-url.<region>.on.aws

# Shared assets bucket (dev + main)
NEXT_PUBLIC_ASSETS_BASE_URL=https://tonpixo-assets-<account-id>-<region>.s3.<region>.amazonaws.com/assets
```

To set via CLI:
```bash
aws amplify update-app --app-id <YOUR_AMPLIFY_APP_ID> \
  --environment-variables \
  "AMPLIFY_MONOREPO_APP_ROOT=frontend,\
   NEXT_PUBLIC_DEV_API_URL=https://<dev-function-id>.lambda-url.<region>.on.aws,\
   NEXT_PUBLIC_DEV_STREAM_URL=https://<dev-function-id>.lambda-url.<region>.on.aws,\
   NEXT_PUBLIC_MAIN_API_URL=https://<main-function-id>.lambda-url.<region>.on.aws,\
   NEXT_PUBLIC_MAIN_STREAM_URL=https://<main-function-id>.lambda-url.<region>.on.aws" \
  --region <region>
```

> **Note:** After updating env vars, you must trigger a new build for the changes to take effect:
> ```bash
> aws amplify start-job --app-id <APP_ID> --branch-name dev --job-type RELEASE --region <region>
> aws amplify start-job --app-id <APP_ID> --branch-name main --job-type RELEASE --region <region>
> ```

#### Option B: Self-hosted / Vercel

Create a `.env.local` file in the `frontend/` directory:

```env
# Point to whatever backend you want to use
NEXT_PUBLIC_API_URL=https://<function-id>.lambda-url.<region>.on.aws

# Shared assets bucket
NEXT_PUBLIC_ASSETS_BASE_URL=https://tonpixo-assets-<account-id>-<region>.s3.<region>.amazonaws.com/assets
```

#### Uploading assets

Use the backend presign endpoint to upload images directly to S3:

1. `POST /api/assets/presign` with JSON `{ "filename": "...", "content_type": "image/webp" }`.
2. POST the returned `upload` fields to the returned `upload.url`.
3. Use `assetUrl` in the frontend.

Optional bulk upload:
```bash
aws s3 sync /path/to/assets s3://tonpixo-assets-<account-id>-<region>/assets/
```

Then build and deploy:
```bash
cd frontend
npm run build
```

---

## MCP service requirements

The backend chat endpoints depend on external MCP service availability.

Before deploying/updating AWS backend stacks, verify MCP endpoints:

```bash
curl -f https://mcp-main.<your-domain>/healthz
curl -f https://mcp-dev.<your-domain>/healthz
curl -H "Authorization: Bearer <MAIN_TOKEN>" https://mcp-main.<your-domain>/v1/tools
curl -H "Authorization: Bearer <DEV_TOKEN>" https://mcp-dev.<your-domain>/v1/tools
```

Expected tools list includes:
- `sql_query`
- `generate_chart_data`

---

## Local development

### Backend

The backend uses **branch-aware env files** — it automatically detects your current Git branch and loads the corresponding file:

| Git branch | Env file loaded | Profile |
|------------|----------------|---------|
| `dev` / `development` | `.env.dev` | dev |
| `main` / `master` | `.env.main` | main |
| *(any other)* | `.env.local` → `.env` | fallback |

You can override the auto-detection by setting `TONPIXO_ENV=dev` or `TONPIXO_ENV=main`.

#### Setup steps

1.  Navigate to `backend/` and create a virtual environment:
    ```bash
    cd backend
    python3 -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```

2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3.  Create your env file (e.g. `.env.dev` for the `dev` branch):
    ```env
    # Telegram — use separate bots for dev/main to avoid webhook conflicts
    TELEGRAM_BOT_TOKEN=<your-bot-token-for-this-branch>

    # TON API — get a key from https://tonapi.io/
    TONAPI_KEY=<your-tonapi-key>

    # AWS — these are auto-set by SAM in Lambda, but needed locally
    AWS_DEFAULT_REGION=us-east-1
    JOBS_TABLE=tonpixo-dev-jobs
    USERS_TABLE=tonpixo-dev-users
    JOBS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/<account-id>/<queue-name>
    DATA_BUCKET=<your-data-bucket-name>

    # Langfuse (optional) — get keys from https://cloud.langfuse.com
    LANGFUSE_SECRET_KEY=sk-lf-...
    LANGFUSE_PUBLIC_KEY=pk-lf-...
    LANGFUSE_HOST=https://cloud.langfuse.com
    LANGFUSE_TRACING_ENVIRONMENT=development

    # MCP tool server (required for agent tools/prompts)
    # Use profile-specific endpoint/token:
    # - .env.dev  -> mcp-dev.<your-domain> + DEV token
    # - .env.main -> mcp-main.<your-domain> + MAIN token
    MCP_BASE_URL=https://mcp-dev.<your-domain>
    MCP_BEARER_TOKEN=<dev-bearer-token>
    MCP_TIMEOUT_MS=30000
    MCP_RETRY_MAX=2
    MCP_CACHE_TTL_SECONDS=900

    # Agent balanced controls (optimized for context retention and stable reasoning)
    AGENT_PROMPT_MODE=full            # lean | full
    AGENT_RECURSION_LIMIT=15
    AGENT_MODEL_MAX_TOKENS=2048
    AGENT_HISTORY_FETCH_LIMIT=15
    AGENT_HISTORY_MAX_MESSAGES=10
    AGENT_HISTORY_MAX_CHARS=24000
    AGENT_MESSAGE_MAX_CHARS=8000
    AGENT_QUESTION_MAX_CHARS=8000
    AGENT_RESOURCE_MAX_CHARS=32000

    # Optional startup validation (extra MCP call; keep off for lowest latency/cost)
    MCP_VALIDATE_TOOL_INVENTORY=0
    ```
    If MCP variables are omitted locally, `backend/mcp_client.py` now auto-discovers a sibling
    `../tonpixo-mcp` repo (or `TONPIXO_MCP_DIR`) and tries:
    - domain from `runtime/caddy.env` (`MCP_DEV_DOMAIN` / `MCP_MAIN_DOMAIN`)
    - local Docker ports (`127.0.0.1:8082` for dev, `127.0.0.1:8081` for main) when `runtime/<profile>.env` exists
    - fallback `127.0.0.1:${TONPIXO_MCP_LOCAL_PORT:-8080}` for single-process local MCP runs
    - bearer token from `runtime/<profile>.env` (`MCP_BEARER_TOKEN`)

    This fallback is local-only (disabled inside AWS Lambda).

    > **Tip:** The DynamoDB table names and SQS queue URL are printed in the CloudFormation stack outputs.
    > Run `aws cloudformation describe-stacks --stack-name tonpixo-dev` to find them.

4.  Run the local server:
    ```bash
    python main.py
    ```
    The server starts on `http://127.0.0.1:8080`. CORS middleware is automatically added when running locally (outside Lambda).

### Frontend

1.  Navigate to `frontend/` and install dependencies:
    ```bash
    cd frontend
    npm install
    ```

2.  Create `.env.local`:
    ```env
    # Points to local backend by default (http://localhost:8000)
    # Override if you want to connect to a deployed backend instead:
    # NEXT_PUBLIC_API_URL=https://<function-id>.lambda-url.<region>.on.aws
    ```

3.  Run the development server:
    ```bash
    npm run dev
    ```

Open [http://localhost:3000](http://localhost:3000) to see the app. Note that Telegram-specific features (Mini App SDK, `initData`, etc.) only work when opened through the Telegram client.

---

## License

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

* **Permitted:** personal use, educational use, testing, and contribution.
* **Prohibited:** any commercial use (selling the code, using it for a paid service, integration into a commercial product) without prior permission.

For commercial inquiries, please contact the author: [Telegram](https://t.me/petrovxyz).
