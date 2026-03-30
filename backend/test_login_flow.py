import traceback
from app.database import SessionLocal
from app import crud, auth, models, schemas

db = SessionLocal()
try:
    user = crud.get_user_by_username(db, username="admin1")
    print("User found:", user.username if user else None)
    
    if not user or not auth.verify_password("12345678", user.password_hash):
        print("Invalid password")
    else:
        print("Password verified")
        access_token = auth.create_access_token(data={"sub": user.username})
        print("Token created")
        
        # Manually validate response
        response_model = schemas.Token(
            access_token=access_token,
            token_type="bearer",
            user=schemas.User.model_validate(user)
        )
        print("Response validated successfully")
except Exception as e:
    print("CRASH!")
    traceback.print_exc()
finally:
    db.close()
