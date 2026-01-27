# AWS Lambda Python 3.11 base image
FROM public.ecr.aws/lambda/python:3.11

# Install system dependencies for matplotlib and build tools
RUN yum install -y mesa-libGL gcc-c++ && yum clean all

# Copy requirements and install Python dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy function code
COPY *.py ${LAMBDA_TASK_ROOT}/
COPY labels/ ${LAMBDA_TASK_ROOT}/labels/

# Set matplotlib to use non-interactive backend and /tmp for cache
ENV MPLBACKEND=Agg
ENV MPLCONFIGDIR=/tmp/matplotlib

# Set the CMD to your handler
CMD [ "main.handler" ]
