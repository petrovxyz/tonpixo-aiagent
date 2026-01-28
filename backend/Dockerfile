# AWS Lambda Web Adapter for FastAPI Streaming
# Using regular Python image with Lambda Web Adapter extension
FROM public.ecr.aws/docker/library/python:3.11-slim-bullseye

# Install Lambda Web Adapter extension for response streaming
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

# Install system dependencies for matplotlib and build tools
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy function code
COPY *.py ./
COPY labels/ ./labels/

# Set matplotlib to use non-interactive backend and /tmp for cache
ENV MPLBACKEND=Agg
ENV MPLCONFIGDIR=/tmp/matplotlib

# Lambda Web Adapter listens on port 8080 by default
ENV PORT=8080

# Run FastAPI with uvicorn
CMD ["python", "main.py"]
