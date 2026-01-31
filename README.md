# Tonpixo AI Agent

**Tonpixo** is an autonomous, serverless AI agent that transforms natural language into complex SQL queries for The Open Network (TON) blockchain data.

Tonpixo utilizes **Claude Haiku 4.5** LLM to dynamically analyze addresses transaction history, Jettons (tokens), and NFTs on TON. It treats blockchain data not as a static feed, but as a queryable Data Lake.

---

## 🚀 Key features

* **Natural language interface:** ask questions like *"How much TON did I swapped to USDT last month?"*.
* **Deep analytics:** the agent generates and executes optimized **SQL (Presto)** queries directly against your data.
* **Visualizations:** automatically generates charts (bar, line, pie) based on SQL results.
* **Context awareness:** remembers conversation history and user facts using hybrid memory persistence (DynamoDB).
* **Enterprise-grade performance:** processes thousands of transactions in seconds using a columnar storage format (Parquet) and distributed query engine (Athena).

---

## Tech stack
- **Frontend**: Next.js 14, Tailwind CSS, TypeScript, FontAwesome.
- **Backend**: Python FastAPI, LangChain, AWS (DynamoDB, Athena, SQS, Bedrock), Pandas.
- **Database**: AWS DynamoDB.
- **Queue**: AWS SQS.

---

## Local development setup

Follow these steps to run the application locally on your machine.

### Prerequisites
- **Node.js**: v18 or higher
- **Python**: v3.9 or higher
- **AWS CLI**: configured with credentials that have access to the project's DynamoDB tables and SQS queues.
  ```bash
  aws configure
  ```

### 1. Backend setup

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Create and activate a virtual environment:
    ```bash
    # macOS/Linux
    python3 -m venv venv
    source venv/bin/activate

    # Windows
    python -m venv venv
    .\venv\Scripts\activate
    ```

3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Environment variables**:
    Ensure you have a `.env` file in the `backend/` directory. This file should contain:
    - `TELEGRAM_BOT_TOKEN`: your Telegram Bot Token
    - `TONAPI_KEY`: API key for TonApi.io
    - `AWS_DEFAULT_REGION`: e.g., us-east-1
    - `JOBS_TABLE`: name of the DynamoDB table for jobs
    - `USERS_TABLE`: name of the DynamoDB table for users
    - `JOBS_QUEUE_URL`: URL of the SQS queue
    - `LANGFUSE_...`: Langfuse tracing keys (optional for local dev)

5.  Run the backend server:
    ```bash
    # Runs on port 8000 with hot reload
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ```
    The API should now be accessible at `http://localhost:8000`.

### 2. Frontend setup

1.  Open a new terminal and navigate to the frontend directory:
    ```bash
    cd frontend
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  **Environment variables**:
    Ensure you have a `.env.local` file in the `frontend/` directory with the following content:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:8000
    ```

4.  Run the development server:
    ```bash
    npm run dev
    ```

5.  Open your browser to [http://localhost:3000](http://localhost:3000).

### 3. Usage & testing

-   **Authentication**: when running locally on `localhost:3000`, the app detects it is not inside Telegram and uses a **mock user** automatically. This allows you to test the full flow without needing to deploy to Telegram.
-   **Chat & analysis**: you can start new scans and chat with the agent. The backend will process these using the configured AWS credentials.
-   **Favicon/icons**: if resources are missing locally, placeholders may be used.

## Troubleshooting

-   **"Access Denied" or auth errors**: ensure your backend is running on port 8000. If running on a different port, update `frontend/.env.local`.
-   **AWS permissions**: if scans fail or history doesn't load, check your local AWS credentials (`~/.aws/credentials`) and ensure your IAM user has permission to read/write to the DynamoDB tables and SQS queues defined in `.env`.
-   **Database errors**: if the backend logs "Could not save to DynamoDB", check your internet connection and VPN/Firewall settings blocking AWS.
