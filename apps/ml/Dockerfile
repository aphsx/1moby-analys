FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# tabicl (required churn candidate) pulls in PyTorch. Install the CPU-only build
# first (~200MB) so pip doesn't resolve the default CUDA wheel (~2.5GB of NVIDIA
# libs that are dead weight on a CPU host like Railway). The trainer autodetects
# CUDA -> MPS -> CPU at runtime; on a GPU host rebuild with TORCH_VARIANT=cuda.
# Kept before requirements.txt so this large layer stays cached.
ARG TORCH_VARIANT=cpu
RUN if [ "$TORCH_VARIANT" = "cpu" ]; then \
      pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu ; \
    fi

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p models
RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]