# TON History Mini App

A Telegram Mini App compatible web application to export TON transaction history to CSV.

## Tech Stack
- **Frontend**: Next.js, Tailwind CSS, FontAwesome.
- **Backend**: Python FastAPI, Pandas.

## Setup

### Prerequisites
- Node.js & npm
- Python 3.9+

### Installation

1.  **Backend Setup**:
    ```bash
    cd backend
    pip install -r requirements.txt
    ```

2.  **Frontend Setup**:
    ```bash
    cd frontend
    npm install
    ```

## Usage

1.  Start the backend:
    ```bash
    cd backend
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
    ```

2.  Start the frontend:
    ```bash
    cd frontend
    npm run dev
    ```

3.  Open `http://localhost:3000` (or your local IP) in your browser.
