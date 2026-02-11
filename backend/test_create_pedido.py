import requests
import json

BASE_URL = "http://localhost:8000"

def test_create_pedido():
    # We need a valid mayorista_id, sede_id, corte_id, tipo_corte_id
    # From previous checks: admin1 is ID 1
    # Let's try with ID 1 for everything as a fallback
    payload = {
        "mayorista_id": 1,
        "cliente_nombre": "Test Cliente",
        "sede_id": 1,
        "observaciones": "Test Observaciones",
        "detalles": [
            {
                "corte_id": 1,
                "tipo_corte_id": 1,
                "cantidad_kg": 5.5
            }
        ]
    }
    
    print(f"Sending request to {BASE_URL}/pedidos...")
    response = requests.post(f"{BASE_URL}/pedidos", json=payload)
    
    print(f"Status Code: {response.status_code}")
    try:
        print(f"Response: {json.dumps(response.json(), indent=2)}")
    except:
        print(f"Response Text: {response.text}")

if __name__ == "__main__":
    test_create_pedido()
