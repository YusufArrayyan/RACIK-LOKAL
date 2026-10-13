# Wadah untuk hosting (dipakai Hugging Face Spaces; juga cocok untuk Render atau Koyeb).
FROM python:3.13-slim

RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user . .

# Basis data dibuat ulang dari data contoh setiap kali wadah dijalankan.
ENV HOST=0.0.0.0 PORT=7860 RACIK_PROXY=1 RACIK_DB_PATH=/home/user/app/data/racik_lokal_v2.db
EXPOSE 7860
CMD ["python", "run.py"]
