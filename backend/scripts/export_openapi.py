import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.main import app

spec = app.openapi()
out_path = Path(__file__).resolve().parent.parent.parent / "docs" / "openapi.json"
out_path.parent.mkdir(parents=True, exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(spec, f, indent=2)

print(f"Exported OpenAPI spec to: {out_path}")
print("Registered paths:")
for p in spec["paths"]:
    print(f"  {p}")
