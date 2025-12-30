from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import random
from bson import ObjectId
from emergentintegrations.llm.chat import LlmChat, UserMessage
import jwt
from passlib.context import CryptContext
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Auth setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key')
JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 10080))

# Helper to convert ObjectId to string
def serialize_doc(doc):
    if doc and '_id' in doc:
        doc['id'] = str(doc['_id'])
        del doc['_id']
    return doc

# ============ Models ============
class Contact(BaseModel):
    name: str
    job: Optional[str] = None
    birthday: Optional[str] = None
    last_met: Optional[str] = None
    favorite_food: Optional[str] = None
    notes: Optional[str] = None
    tags: List[str] = []
    groups: List[str] = []  # Groups like "University", "Work", "Tennis Club"
    pipeline_stage: str = "Monthly"  # Weekly, Bi-Weekly, Monthly, Quarterly, Annually
    last_contact_date: Optional[str] = None
    next_due: Optional[str] = None
    target_interval_days: int = 30
    phone: Optional[str] = None
    email: Optional[str] = None
    profile_picture: Optional[str] = None  # base64 image
    language: Optional[str] = "English"  # Communication language
    tone: Optional[str] = "Casual"  # Communication tone: Casual, Professional, Friendly
    device_contact_id: Optional[str] = None  # ID from phone contacts for syncing
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    job: Optional[str] = None
    birthday: Optional[str] = None
    last_met: Optional[str] = None
    favorite_food: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    groups: Optional[List[str]] = None
    pipeline_stage: Optional[str] = None
    last_contact_date: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    profile_picture: Optional[str] = None
    language: Optional[str] = None
    tone: Optional[str] = None
    device_contact_id: Optional[str] = None

class MovePipelineRequest(BaseModel):
    pipeline_stage: str

class Draft(BaseModel):
    contact_id: str
    contact_name: str
    draft_message: str
    status: str = "pending"  # pending, sent, dismissed
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class Settings(BaseModel):
    writing_style_sample: str = "Hey! How have you been? Just wanted to catch up and see what you've been up to lately."
    notification_time: str = "09:00"

# ============ Utility Functions ============
def calculate_target_interval(pipeline_stage: str) -> int:
    """Convert pipeline stage to days"""
    intervals = {
        "Weekly": 7,
        "Bi-Weekly": 14,
        "Monthly": 30,
        "Quarterly": 90,
        "Annually": 365
    }
    return intervals.get(pipeline_stage, 30)

def calculate_next_due_with_random_factor(last_contact_date_str: str, target_interval_days: int) -> str:
    """Calculate next due date with random factor (-5 to +5 days)"""
    if not last_contact_date_str:
        # If no last contact, use today as base
        last_contact_date_str = datetime.utcnow().isoformat()
    
    try:
        last_contact = datetime.fromisoformat(last_contact_date_str.replace('Z', '+00:00'))
    except:
        last_contact = datetime.utcnow()
    
    random_factor = random.randint(-5, 5)
    next_due = last_contact + timedelta(days=target_interval_days + random_factor)
    return next_due.isoformat()

async def generate_ai_draft(contact: dict, writing_style: str) -> str:
    """Generate personalized message draft using AI"""
    try:
        chat = LlmChat(
            api_key=os.environ['EMERGENT_LLM_KEY'],
            session_id=f"draft_{contact.get('id', 'unknown')}",
            system_message="You are helping write reconnection messages. Write casual, warm messages that sound natural and personal."
        ).with_model("openai", "gpt-5.1")
        
        context_parts = []
        if contact.get('name'):
            context_parts.append(f"Contact: {contact['name']}")
        if contact.get('job'):
            context_parts.append(f"Job: {contact['job']}")
        if contact.get('favorite_food'):
            context_parts.append(f"Favorite Food: {contact['favorite_food']}")
        if contact.get('notes'):
            context_parts.append(f"Notes: {contact['notes']}")
        if contact.get('last_met'):
            context_parts.append(f"Last Met: {contact['last_met']}")
        
        context = "\n".join(context_parts)
        
        prompt = f"""Write a brief, warm reconnection message to {contact.get('name', 'this person')}.

Context:
{context}

User's writing style example:
"{writing_style}"

Write a short, casual message (2-3 sentences) that:
- Feels natural and personal
- References something from the context if available
- Mimics the user's writing style
- Suggests catching up

Just write the message, no extra explanation."""
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        return response.strip()
    except Exception as e:
        logging.error(f"Error generating AI draft: {str(e)}")
        # Fallback message
        return f"Hey {contact.get('name', 'there')}! It's been a while - would love to catch up soon. How have you been?"

# ============ API Routes ============

from auth import hash_password, verify_password, create_access_token, get_current_user

# Auth Models
class UserSignup(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

@api_router.get("/")
async def root():
    return {"message": "SynchroConnectr API", "version": "1.0.0"}

# Auth Routes
@api_router.post("/auth/signup", response_model=Token)
async def signup(user_data: UserSignup):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_password = hash_password(user_data.password)
    user_dict = {
        "email": user_data.email,
        "name": user_data.name,
        "password": hashed_password,
        "created_at": datetime.utcnow().isoformat(),
        "has_imported_contacts": False
    }
    
    result = await db.users.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # Create token
    access_token = create_access_token(data={"user_id": user_id, "email": user_data.email})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user_id, "email": user_data.email, "name": user_data.name, "has_imported_contacts": False}
    }

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    # Find user
    user = await db.users.find_one({"email": user_data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Verify password
    if not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    
    # Create token
    access_token = create_access_token(data={"user_id": user_id, "email": user["email"]})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user_id,
            "email": user["email"],
            "name": user.get("name", ""),
            "has_imported_contacts": user.get("has_imported_contacts", False)
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "has_imported_contacts": user.get("has_imported_contacts", False)
    }

@api_router.put("/auth/update-import-status")
async def update_import_status(current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": ObjectId(current_user["user_id"])},
        {"$set": {"has_imported_contacts": True}}
    )
    return {"message": "Import status updated"}

# Contact Routes
@api_router.post("/contacts", response_model=dict)
async def create_contact(contact: Contact):
    contact_dict = contact.dict()
    
    # Calculate initial next_due
    if not contact_dict.get('last_contact_date'):
        contact_dict['last_contact_date'] = datetime.utcnow().isoformat()
    
    contact_dict['target_interval_days'] = calculate_target_interval(contact_dict['pipeline_stage'])
    contact_dict['next_due'] = calculate_next_due_with_random_factor(
        contact_dict['last_contact_date'],
        contact_dict['target_interval_days']
    )
    
    result = await db.contacts.insert_one(contact_dict)
    contact_dict['id'] = str(result.inserted_id)
    del contact_dict['_id']
    
    return contact_dict

@api_router.get("/contacts", response_model=List[dict])
async def get_contacts():
    contacts = await db.contacts.find().to_list(1000)
    return [serialize_doc(c) for c in contacts]

@api_router.get("/contacts/{contact_id}", response_model=dict)
async def get_contact(contact_id: str):
    try:
        contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        return serialize_doc(contact)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/contacts/{contact_id}", response_model=dict)
async def update_contact(contact_id: str, contact_update: ContactUpdate):
    try:
        update_data = {k: v for k, v in contact_update.dict().items() if v is not None}
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        # Recalculate next_due if pipeline_stage or last_contact_date changed
        if 'pipeline_stage' in update_data or 'last_contact_date' in update_data:
            existing = await db.contacts.find_one({"_id": ObjectId(contact_id)})
            if existing:
                pipeline_stage = update_data.get('pipeline_stage', existing.get('pipeline_stage', 'Monthly'))
                last_contact = update_data.get('last_contact_date', existing.get('last_contact_date'))
                
                target_interval = calculate_target_interval(pipeline_stage)
                update_data['target_interval_days'] = target_interval
                update_data['next_due'] = calculate_next_due_with_random_factor(last_contact, target_interval)
        
        result = await db.contacts.update_one(
            {"_id": ObjectId(contact_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        updated_contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        return serialize_doc(updated_contact)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    try:
        result = await db.contacts.delete_one({"_id": ObjectId(contact_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Contact not found")
        return {"message": "Contact deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/contacts")
async def delete_all_contacts():
    """Delete all contacts - use with caution!"""
    try:
        result = await db.contacts.delete_many({})
        return {"message": f"Deleted {result.deleted_count} contacts successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/contacts/{contact_id}/move-pipeline")
async def move_pipeline(contact_id: str, request: MovePipelineRequest):
    """Move contact to different pipeline stage and recalculate next_due"""
    try:
        existing = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        target_interval = calculate_target_interval(request.pipeline_stage)
        last_contact = existing.get('last_contact_date', datetime.utcnow().isoformat())
        next_due = calculate_next_due_with_random_factor(last_contact, target_interval)
        
        update_data = {
            'pipeline_stage': request.pipeline_stage,
            'target_interval_days': target_interval,
            'next_due': next_due,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        await db.contacts.update_one(
            {"_id": ObjectId(contact_id)},
            {"$set": update_data}
        )
        
        updated_contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        return serialize_doc(updated_contact)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Morning Briefing Route
@api_router.get("/morning-briefing", response_model=List[dict])
async def get_morning_briefing():
    """Get contacts due today or overdue"""
    today = datetime.utcnow().isoformat()
    contacts = await db.contacts.find({"next_due": {"$lte": today}}).to_list(100)
    return [serialize_doc(c) for c in contacts]

# Draft Routes
@api_router.post("/drafts/generate/{contact_id}", response_model=dict)
async def generate_draft(contact_id: str):
    """Generate AI-powered message draft for a contact"""
    try:
        contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        # Get writing style from settings
        settings = await db.settings.find_one({})
        writing_style = settings.get('writing_style_sample', '') if settings else "Hey! How have you been?"
        
        # Generate draft
        contact_serialized = serialize_doc(contact)
        draft_message = await generate_ai_draft(contact_serialized, writing_style)
        
        # Save draft
        draft_dict = {
            'contact_id': contact_id,
            'contact_name': contact.get('name', 'Unknown'),
            'draft_message': draft_message,
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat()
        }
        
        result = await db.drafts.insert_one(draft_dict)
        draft_dict['id'] = str(result.inserted_id)
        del draft_dict['_id']
        
        return draft_dict
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/drafts", response_model=List[dict])
async def get_drafts():
    """Get all pending drafts"""
    drafts = await db.drafts.find({"status": "pending"}).to_list(100)
    return [serialize_doc(d) for d in drafts]

@api_router.put("/drafts/{draft_id}/dismiss")
async def dismiss_draft(draft_id: str):
    """Dismiss a draft"""
    try:
        result = await db.drafts.update_one(
            {"_id": ObjectId(draft_id)},
            {"$set": {"status": "dismissed"}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Draft not found")
        return {"message": "Draft dismissed"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/drafts/{draft_id}/sent")
async def mark_draft_sent(draft_id: str):
    """Mark draft as sent and update contact's last_contact_date"""
    try:
        draft = await db.drafts.find_one({"_id": ObjectId(draft_id)})
        if not draft:
            raise HTTPException(status_code=404, detail="Draft not found")
        
        # Update draft status
        await db.drafts.update_one(
            {"_id": ObjectId(draft_id)},
            {"$set": {"status": "sent"}}
        )
        
        # Update contact's last_contact_date and recalculate next_due
        contact_id = draft['contact_id']
        contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        if contact:
            today = datetime.utcnow().isoformat()
            target_interval = contact.get('target_interval_days', 30)
            next_due = calculate_next_due_with_random_factor(today, target_interval)
            
            await db.contacts.update_one(
                {"_id": ObjectId(contact_id)},
                {"$set": {
                    'last_contact_date': today,
                    'next_due': next_due,
                    'updated_at': today
                }}
            )
        
        return {"message": "Draft marked as sent"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Group Model
class Group(BaseModel):
    name: str
    description: Optional[str] = None
    profile_picture: Optional[str] = None  # base64 image
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    profile_picture: Optional[str] = None

# Groups Routes
@api_router.post("/groups", response_model=dict)
async def create_group(group: Group):
    """Create a new group"""
    group_dict = group.dict()
    result = await db.groups.insert_one(group_dict)
    group_dict['id'] = str(result.inserted_id)
    del group_dict['_id']
    return group_dict

@api_router.get("/groups", response_model=List[dict])
async def get_groups():
    """Get all groups"""
    groups = await db.groups.find().to_list(1000)
    return [serialize_doc(g) for g in groups]

@api_router.get("/groups/{group_id}", response_model=dict)
async def get_group(group_id: str):
    try:
        group = await db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        return serialize_doc(group)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/groups/{group_id}", response_model=dict)
async def update_group(group_id: str, group_update: GroupUpdate):
    try:
        update_data = {k: v for k, v in group_update.dict().items() if v is not None}
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        result = await db.groups.update_one(
            {"_id": ObjectId(group_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Group not found")
        
        updated_group = await db.groups.find_one({"_id": ObjectId(group_id)})
        return serialize_doc(updated_group)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str):
    try:
        result = await db.groups.delete_one({"_id": ObjectId(group_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Group not found")
        return {"message": "Group deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Settings Routes
@api_router.get("/settings", response_model=Settings)
async def get_settings():
    """Get user settings"""
    settings = await db.settings.find_one({})
    if not settings:
        # Create default settings
        default_settings = Settings().dict()
        await db.settings.insert_one(default_settings)
        return Settings()
    return Settings(**settings)

@api_router.put("/settings", response_model=Settings)
async def update_settings(settings: Settings):
    """Update user settings"""
    settings_dict = settings.dict()
    await db.settings.update_one(
        {},
        {"$set": settings_dict},
        upsert=True
    )
    return settings

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
