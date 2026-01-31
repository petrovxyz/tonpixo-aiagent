FROM public.ecr.aws/docker/library/python:3.11-slim

# Install system dependencies
RUN apt-get update && \
    apt-get install -y gcc g++ make cmake libcurl4-openssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /var/task

# Install lambda runtime interface client
RUN pip install awslambdaric

# Copy requirements and install dependencies
COPY worker/requirements.txt ./
RUN pip install -r requirements.txt

# Copy labels
COPY labels/ ./labels/

# Copy function code
COPY worker/*.py ./

# Set the CMD to your handler
CMD [ "worker.lambda_handler" ]

# Set the ENTRYPOINT to the RIC
ENTRYPOINT [ "python", "-m", "awslambdaric" ]
