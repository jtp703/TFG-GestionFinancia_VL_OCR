# Imagen base oficial de RunPod con PyTorch 2.1.0 + CUDA 11.8 + Python 3.10
# PyTorch preinstalado evita conflictos con la instalación manual
FROM runpod/pytorch:2.2.1-py3.10-cuda12.1.1-devel-ubuntu22.04

WORKDIR /app

# Instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el handler
COPY handler.py .

# RunPod arranca el worker ejecutando handler.py directamente
CMD ["python", "-u", "handler.py"]
