import os
import sys

import uvicorn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import init_db  # noqa: E402
from app.seed_data import seed_database  # noqa: E402


def main():
    port = int(os.environ.get("PORT", "8000"))
    print("RACIK-LOKAL: racik formula pangan lokal dan pemeriksa klaim label")
    print("Menyiapkan basis data dan data contoh...")
    init_db()
    seed_database()
    print(f"Buka http://127.0.0.1:{port} di peramban. Dokumentasi API: http://127.0.0.1:{port}/docs")
    print("Tekan Ctrl+C untuk berhenti.")
    # Di server (Railway dan sejenisnya) pakai HOST=0.0.0.0 dan RACIK_PROXY=1 agar alamat https dari proxy dikenali,
    # sehingga cookie sesi ditandai Secure.
    di_belakang_proxy = os.environ.get("RACIK_PROXY") == "1"
    uvicorn.run("app.main:app", host=os.environ.get("HOST", "127.0.0.1"), port=port,
                reload=os.environ.get("RACIK_RELOAD") == "1",
                proxy_headers=di_belakang_proxy, forwarded_allow_ips="*" if di_belakang_proxy else None)


if __name__ == "__main__":
    main()
