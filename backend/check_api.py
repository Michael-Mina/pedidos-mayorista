import requests
import json

try:
    print("Fetching Categories...")
    r = requests.get("http://localhost:8000/categorias")
    print(f"Status: {r.status_code}")
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print(f"Error: {e}")
