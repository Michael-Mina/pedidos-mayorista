from app import auth
try:
    p = "12345678"
    h = auth.get_password_hash(p)
    print(f"Hash: {h}")
    print(f"Verify: {auth.verify_password(p, h)}")
except Exception as e:
    print(f"Error: {e}")
