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

# --- Pipeline Stage Configuration ---
class PipelineStageConfig(BaseModel):
    name: str
    interval_days: int  # Base interval in days
    randomize: bool = False  # Whether to add randomization
    random_variation: int = 0  # Days to add/subtract randomly (e.g., 2 means ±2 days)
    color: str = "#6366F1"  # Stage color
    enabled: bool = True

# Default pipeline stages
DEFAULT_PIPELINE_STAGES = [
    {"name": "Weekly", "interval_days": 7, "randomize": False, "random_variation": 0, "color": "#8B5CF6", "enabled": True},
    {"name": "Bi-Weekly", "interval_days": 14, "randomize": False, "random_variation": 0, "color": "#06B6D4", "enabled": True},
    {"name": "Monthly", "interval_days": 30, "randomize": False, "random_variation": 0, "color": "#10B981", "enabled": True},
    {"name": "Quarterly", "interval_days": 90, "randomize": False, "random_variation": 0, "color": "#F59E0B", "enabled": True},
    {"name": "Annually", "interval_days": 365, "randomize": False, "random_variation": 0, "color": "#EC4899", "enabled": True},
]

# --- User Model (Google-only auth) ---
class User(BaseModel):
    email: str
    name: str
    google_picture: Optional[str] = None
    # Profile fields (matching Contact Card style)
    job: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    # App settings
    ui_language: str = "en"  # en, de
    default_draft_language: str = "English"
    default_writing_style: str = "Hey! How have you been? Just wanted to catch up and see what you've been up to lately."
    notification_time: str = "09:00"
    notifications_enabled: bool = True
    # Morning Briefing settings
    morning_briefing_enabled: bool = True
    morning_briefing_time: str = "08:00"
    # Custom pipeline stages
    pipeline_stages: List[dict] = Field(default_factory=lambda: DEFAULT_PIPELINE_STAGES.copy())
    bio: Optional[str] = None
    profile_picture: Optional[str] = None  # base64 image
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    job: Optional[str] = None
    location: Optional[str] = None
    phone: Optional[str] = None
    ui_language: Optional[str] = None
    default_draft_language: Optional[str] = None
    default_writing_style: Optional[str] = None
    notification_time: Optional[str] = None
    notifications_enabled: Optional[bool] = None
    morning_briefing_enabled: Optional[bool] = None
    morning_briefing_time: Optional[str] = None
    pipeline_stages: Optional[List[dict]] = None
    bio: Optional[str] = None
    profile_picture: Optional[str] = None

# --- Contact Model (Updated with new fields) ---
class ContactCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    job: Optional[str] = None  # Job Title
    location: Optional[str] = None
    academic_degree: Optional[str] = None
    birthday: Optional[str] = None
    # Personal details
    hobbies: Optional[str] = None
    favorite_food: Optional[str] = None
    how_we_met: Optional[str] = None  # Kennengelernt
    # Pipeline & Groups
    pipeline_stage: str = "Monthly"  # Weekly, Bi-Weekly, Monthly, Quarterly, Annually
    groups: List[str] = []  # List of group IDs
    # Communication preferences
    language: str = "English"
    tone: str = "Casual"  # Casual, Professional, Friendly
    example_message: Optional[str] = None  # Individual AI tone override
    conversation_screenshots: List[str] = []  # Up to 3 base64 screenshots for AI style learning
    # Notes
    notes: Optional[str] = None
    # Calculated fields
    last_contact_date: Optional[str] = None
    # Profile picture
    profile_picture: Optional[str] = None  # base64 image
    device_contact_id: Optional[str] = None

class Contact(BaseModel):
    user_id: str  # Owner of this contact
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    job: Optional[str] = None  # Job Title
    location: Optional[str] = None
    academic_degree: Optional[str] = None
    birthday: Optional[str] = None
    # Personal details
    hobbies: Optional[str] = None
    favorite_food: Optional[str] = None
    how_we_met: Optional[str] = None  # Kennengelernt
    # Pipeline & Groups
    pipeline_stage: str = "Monthly"  # Weekly, Bi-Weekly, Monthly, Quarterly, Annually
    groups: List[str] = []  # List of group IDs
    # Communication preferences
    language: str = "English"
    tone: str = "Casual"  # Casual, Professional, Friendly
    example_message: Optional[str] = None  # Individual AI tone override
    conversation_screenshots: List[str] = []  # Up to 3 base64 screenshots for AI style learning
    # Notes
    notes: Optional[str] = None
    # Calculated fields
    last_contact_date: Optional[str] = None
    next_due: Optional[str] = None
    target_interval_days: int = 30
    # Profile picture
    profile_picture: Optional[str] = None  # base64 image
    device_contact_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    job: Optional[str] = None
    location: Optional[str] = None
    academic_degree: Optional[str] = None
    birthday: Optional[str] = None
    hobbies: Optional[str] = None
    favorite_food: Optional[str] = None
    how_we_met: Optional[str] = None
    pipeline_stage: Optional[str] = None
    groups: Optional[List[str]] = None
    language: Optional[str] = None
    tone: Optional[str] = None
    example_message: Optional[str] = None
    conversation_screenshots: Optional[List[str]] = None  # Up to 3 base64 screenshots
    notes: Optional[str] = None
    last_contact_date: Optional[str] = None
    profile_picture: Optional[str] = None
    device_contact_id: Optional[str] = None

class MovePipelineRequest(BaseModel):
    pipeline_stage: str

class MoveToGroupRequest(BaseModel):
    group_ids: List[str]

# --- Interaction History Model ---
class InteractionType:
    PERSONAL_MEETING = "Personal Meeting"
    PHONE_CALL = "Phone Call"
    EMAIL = "Email"
    WHATSAPP = "WhatsApp"
    OTHER = "Other"

class Interaction(BaseModel):
    contact_id: str
    user_id: str
    interaction_type: str  # Personal Meeting, Phone Call, Email, WhatsApp, Other
    date: str
    notes: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class InteractionCreate(BaseModel):
    interaction_type: str
    date: str
    notes: Optional[str] = None

# --- Group Model ---
class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#6366F1"  # Default indigo color
    profile_picture: Optional[str] = None

class Group(BaseModel):
    user_id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#6366F1"  # Default indigo color
    profile_picture: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    profile_picture: Optional[str] = None

# --- Draft Model ---
class Draft(BaseModel):
    user_id: str
    contact_id: str
    contact_name: str
    draft_message: str
    status: str = "pending"  # pending, sent, dismissed
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

# ============ Utility Functions ============
async def calculate_target_interval_async(pipeline_stage: str, user_id: str = None) -> int:
    """Convert pipeline stage to days based on user's custom pipeline settings"""
    # Default intervals for backward compatibility
    default_intervals = {
        "New": 0,
        "Weekly": 7,
        "Bi-Weekly": 14,
        "Monthly": 30,
        "Quarterly": 90,
        "Annually": 365
    }
    
    # If no user_id, use defaults
    if not user_id:
        return default_intervals.get(pipeline_stage, 30)
    
    # Try to get user's custom pipeline stages
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user and user.get('pipeline_stages'):
            for stage in user['pipeline_stages']:
                if stage.get('name') == pipeline_stage:
                    return stage.get('interval_days', 30)
    except:
        pass
    
    return default_intervals.get(pipeline_stage, 30)

def calculate_target_interval(pipeline_stage: str) -> int:
    """Convert pipeline stage to days. 'New' stage has no interval (returns 0)
    Note: This is a sync version for backward compatibility. Use calculate_target_interval_async when possible."""
    intervals = {
        "New": 0,  # New contacts have no countdown
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
        last_contact_date_str = datetime.utcnow().isoformat()
    
    try:
        last_contact = datetime.fromisoformat(last_contact_date_str.replace('Z', '+00:00'))
    except:
        last_contact = datetime.utcnow()
    
    random_factor = random.randint(-5, 5)
    next_due = last_contact + timedelta(days=target_interval_days + random_factor)
    return next_due.isoformat()

async def generate_ai_draft(contact: dict, user_settings: dict, interaction_history: list) -> str:
    """Generate personalized message draft using AI with full context and priority-based style learning
    
    Style Priority:
    1. Conversation screenshots (if available) - highest priority, AI visually analyzes them
    2. Example message text
    3. Tone setting (casual/professional/friendly) - ONLY if no screenshots AND no example text
    
    Context Priority:
    1. Interaction history
    2. Personal details (hobbies, food, how we met)
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        
        # Get style sources
        conversation_screenshots = contact.get('conversation_screenshots', [])
        example_message = contact.get('example_message')
        tone = contact.get('tone', 'Casual')
        
        # Build comprehensive context from contact card
        context_parts = []
        
        # Basic info
        if contact.get('name'):
            context_parts.append(f"Contact Name: {contact['name']}")
        if contact.get('job'):
            context_parts.append(f"Job: {contact['job']}")
        if contact.get('location'):
            context_parts.append(f"Location: {contact['location']}")
        if contact.get('academic_degree'):
            context_parts.append(f"Education: {contact['academic_degree']}")
        
        # Personal details - IMPORTANT for context
        if contact.get('hobbies'):
            context_parts.append(f"Hobbies/Interests: {contact['hobbies']}")
        if contact.get('favorite_food'):
            context_parts.append(f"Favorite Food: {contact['favorite_food']}")
        if contact.get('how_we_met'):
            context_parts.append(f"How we met: {contact['how_we_met']}")
        if contact.get('birthday'):
            context_parts.append(f"Birthday: {contact['birthday']}")
        
        # Notes - can contain important context
        if contact.get('notes'):
            context_parts.append(f"Personal Notes: {contact['notes']}")
        
        # Interaction history - PRIMARY context source
        if interaction_history:
            history_str = "\n".join([
                f"  - {h.get('date', 'Unknown')}: {h.get('interaction_type', 'Unknown')} - {h.get('notes', 'No notes')}"
                for h in interaction_history[:5]
            ])
            context_parts.append(f"RECENT INTERACTION HISTORY (very important!):\n{history_str}")
        
        context = "\n".join(context_parts)
        
        # Determine language
        draft_language = contact.get('language') or user_settings.get('default_draft_language', 'English')
        
        # Determine if we have custom style references
        has_screenshots = bool(conversation_screenshots) and len(conversation_screenshots) > 0
        has_example = bool(example_message) and len(example_message.strip()) > 0
        
        # Build the prompt based on what we have
        if has_screenshots:
            # Priority 1: Use screenshots - AI will analyze them
            style_instruction = """
CRITICAL - ANALYZE THE SCREENSHOT(S) I PROVIDED:
Look carefully at the conversation screenshot(s). Pay attention to:
1. HOW I ADDRESS THIS PERSON - Look for nicknames like "babe", "honey", "dude", "Schatz", etc.
2. The greeting style (casual "hey", formal "Hello", etc.)
3. The language used (formal/informal, slang, etc.)
4. Emojis or special characters
5. Message length and structure

YOU MUST USE THE EXACT SAME NICKNAMES AND STYLE FROM THE SCREENSHOTS.
If I call them "babe" → you call them "babe"
If I use casual German slang → you use casual German slang
COPY MY COMMUNICATION PATTERN EXACTLY."""
        elif has_example:
            # Priority 2: Use example text
            style_instruction = f"""
CRITICAL - MIMIC THIS EXAMPLE MESSAGE STYLE:
Here is exactly how I write to this person:
"{example_message}"

YOU MUST copy this style exactly:
- Same greeting pattern
- Same level of formality
- Same nicknames if any
- Same language/slang style
Write as if I wrote it myself."""
        else:
            # Priority 3: Use tone setting only
            style_instruction = f"""
STYLE SETTING: {tone}
- Casual: Relaxed, friendly ("Hey!", "What's up?", informal)
- Professional: Polite, business-appropriate ("Hello", formal)
- Friendly: Warm, personal, enthusiastic"""
        
        # Build the full prompt
        prompt = f"""Write a personalized reconnection message to {contact.get('name', 'this person')}.

===== CONTACT INFORMATION (use this for context) =====
{context}

===== WRITING STYLE INSTRUCTIONS =====
{style_instruction}

===== REQUIREMENTS =====
- Language: {draft_language}
- Length: 2-3 sentences maximum
- Make it personal - reference specific things from the contact info or interaction history
- The message should feel like a natural continuation of our relationship
- If there's recent interaction history, reference something from it

IMPORTANT: Write ONLY the message. No quotes, no explanation, no "Here's a message:" - just the message itself as if I'm typing it to send."""
        
        # Initialize chat
        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"draft_{contact.get('_id', 'unknown')}_{datetime.utcnow().timestamp()}",
            system_message="You are an expert at writing personal messages. You carefully analyze images and text to mimic the exact communication style shown. You write natural, authentic messages that sound like they came from the user, not an AI."
        ).with_model("openai", "gpt-4.1")
        
        # Prepare file contents if we have screenshots
        file_contents = []
        if has_screenshots:
            for screenshot in conversation_screenshots[:3]:
                # Remove the data:image/...;base64, prefix if present
                if screenshot.startswith('data:'):
                    # Extract just the base64 part
                    base64_data = screenshot.split(',')[1] if ',' in screenshot else screenshot
                else:
                    base64_data = screenshot
                
                file_contents.append(ImageContent(image_base64=base64_data))
        
        # Send message with or without images
        if file_contents:
            user_message = UserMessage(text=prompt, file_contents=file_contents)
        else:
            user_message = UserMessage(text=prompt)
        
        response = await chat.send_message(user_message)
        
        # Clean up the response
        result = response.strip()
        # Remove any quotes that might have been added
        if result.startswith('"') and result.endswith('"'):
            result = result[1:-1]
        if result.startswith("'") and result.endswith("'"):
            result = result[1:-1]
        
        return result
    except Exception as e:
        logging.error(f"Error generating AI draft: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return f"Hey {contact.get('name', 'there')}! It's been a while - would love to catch up soon. How have you been?"

# ============ Auth Helpers ============
from auth import create_access_token, get_current_user

# ============ Google OAuth Config ============
EMERGENT_AUTH_URL = "https://auth.emergentagent.com"
EMERGENT_SESSION_API = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# ============ API Routes ============

@api_router.get("/")
async def root():
    return {"message": "SynchroConnectr API", "version": "2.0.0"}

# ============ Auth Routes (Google-only) ============

class GoogleAuthRequest(BaseModel):
    session_id: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

@api_router.post("/auth/google", response_model=Token)
async def google_auth(auth_data: GoogleAuthRequest):
    """Sign in or sign up with Google (only auth method)"""
    try:
        async with httpx.AsyncClient() as http_client:
            response = await http_client.get(
                EMERGENT_SESSION_API,
                headers={"X-Session-ID": auth_data.session_id}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to validate Google session")
            
            session_data = response.json()
        
        google_email = session_data.get("email")
        google_name = session_data.get("name", "")
        google_picture = session_data.get("picture", "")
        
        if not google_email:
            raise HTTPException(status_code=400, detail="Could not get email from Google")
        
        # Check if user exists
        user = await db.users.find_one({"email": google_email})
        
        if user:
            user_id = str(user["_id"])
            # Update Google picture if changed
            await db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {
                    "google_picture": google_picture,
                    "updated_at": datetime.utcnow().isoformat()
                }}
            )
        else:
            # New user - create account
            user_dict = {
                "email": google_email,
                "name": google_name,
                "google_picture": google_picture,
                "ui_language": "en",
                "default_draft_language": "English",
                "default_writing_style": "Hey! How have you been? Just wanted to catch up and see what you've been up to lately.",
                "notification_time": "09:00",
                "notifications_enabled": True,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            
            result = await db.users.insert_one(user_dict)
            user_id = str(result.inserted_id)
        
        # Create token
        access_token = create_access_token(data={"user_id": user_id, "email": google_email})
        
        # Get updated user data
        updated_user = await db.users.find_one({"_id": ObjectId(user_id)})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "email": google_email,
                "name": updated_user.get("name", google_name),
                "picture": updated_user.get("google_picture", google_picture),
                "ui_language": updated_user.get("ui_language", "en"),
                "default_draft_language": updated_user.get("default_draft_language", "English")
            }
        }
        
    except httpx.HTTPError as e:
        raise HTTPException(status_code=500, detail=f"Network error: {str(e)}")
    except Exception as e:
        logging.error(f"Google auth error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return serialize_doc(user)

# ============ User Profile Routes ============

@api_router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's profile"""
    user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
    if not user:
        # Return default profile if user not found in database
        # This happens for users who logged in but didn't have a profile created yet
        default_profile = {
            "id": current_user["user_id"],
            "email": current_user.get("email", ""),
            "pipeline_stages": [
                {"name": "Weekly", "interval_days": 7, "randomize": False, "random_variation": 0, "color": "#8B5CF6", "enabled": True},
                {"name": "Bi-Weekly", "interval_days": 14, "randomize": False, "random_variation": 0, "color": "#06B6D4", "enabled": True},
                {"name": "Monthly", "interval_days": 30, "randomize": False, "random_variation": 0, "color": "#10B981", "enabled": True},
                {"name": "Quarterly", "interval_days": 90, "randomize": False, "random_variation": 0, "color": "#F59E0B", "enabled": True},
                {"name": "Annually", "interval_days": 365, "randomize": False, "random_variation": 0, "color": "#EC4899", "enabled": True},
            ],
            "morning_briefing_enabled": True,
            "morning_briefing_time": "08:00",
        }
        return default_profile
    return serialize_doc(user)

@api_router.put("/profile")
async def update_profile(profile_update: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update current user's profile"""
    update_data = {k: v for k, v in profile_update.dict().items() if v is not None}
    update_data['updated_at'] = datetime.utcnow().isoformat()
    
    # Use upsert to create profile if it doesn't exist
    await db.users.update_one(
        {"_id": ObjectId(current_user["user_id"])},
        {"$set": update_data},
        upsert=True
    )
    
    updated_user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
    return serialize_doc(updated_user)

# ============ Contact Routes ============

@api_router.post("/contacts", response_model=dict)
async def create_contact(contact: ContactCreate, current_user: dict = Depends(get_current_user)):
    contact_dict = contact.dict()
    contact_dict['user_id'] = current_user["user_id"]
    
    # For "New" pipeline stage, don't set last_contact_date or next_due
    # This ensures new contacts have no countdown until they're assigned to a real pipeline
    if contact_dict['pipeline_stage'] == 'New':
        contact_dict['target_interval_days'] = 0
        contact_dict['next_due'] = None
        contact_dict['last_contact_date'] = None
    else:
        # Calculate initial next_due for non-New contacts
        if not contact_dict.get('last_contact_date'):
            contact_dict['last_contact_date'] = datetime.utcnow().isoformat()
        
        contact_dict['target_interval_days'] = calculate_target_interval(contact_dict['pipeline_stage'])
        contact_dict['next_due'] = calculate_next_due_with_random_factor(
            contact_dict['last_contact_date'],
            contact_dict['target_interval_days']
        )
    
    result = await db.contacts.insert_one(contact_dict)
    contact_dict['id'] = str(result.inserted_id)
    if '_id' in contact_dict:
        del contact_dict['_id']
    
    return contact_dict

@api_router.get("/contacts", response_model=List[dict])
async def get_contacts(current_user: dict = Depends(get_current_user)):
    contacts = await db.contacts.find({"user_id": current_user["user_id"]}).to_list(1000)
    return [serialize_doc(c) for c in contacts]

@api_router.get("/contacts/{contact_id}", response_model=dict)
async def get_contact(contact_id: str, current_user: dict = Depends(get_current_user)):
    try:
        contact = await db.contacts.find_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        return serialize_doc(contact)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/contacts/{contact_id}", response_model=dict)
async def update_contact(contact_id: str, contact_update: ContactUpdate, current_user: dict = Depends(get_current_user)):
    try:
        update_data = {k: v for k, v in contact_update.dict().items() if v is not None}
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        # Recalculate next_due if pipeline_stage or last_contact_date changed
        if 'pipeline_stage' in update_data or 'last_contact_date' in update_data:
            existing = await db.contacts.find_one({
                "_id": ObjectId(contact_id),
                "user_id": current_user["user_id"]
            })
            if existing:
                pipeline_stage = update_data.get('pipeline_stage', existing.get('pipeline_stage', 'Monthly'))
                last_contact = update_data.get('last_contact_date', existing.get('last_contact_date'))
                
                target_interval = calculate_target_interval(pipeline_stage)
                update_data['target_interval_days'] = target_interval
                update_data['next_due'] = calculate_next_due_with_random_factor(last_contact, target_interval)
        
        result = await db.contacts.update_one(
            {"_id": ObjectId(contact_id), "user_id": current_user["user_id"]},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        updated_contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        return serialize_doc(updated_contact)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, current_user: dict = Depends(get_current_user)):
    try:
        # Also delete related interactions
        await db.interactions.delete_many({"contact_id": contact_id})
        # Also delete related drafts
        await db.drafts.delete_many({"contact_id": contact_id})
        
        result = await db.contacts.delete_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Contact not found")
        return {"message": "Contact deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/contacts")
async def delete_all_contacts(current_user: dict = Depends(get_current_user)):
    """Delete all contacts for the current user"""
    try:
        # Get all contact IDs for this user
        contacts = await db.contacts.find({"user_id": current_user["user_id"]}).to_list(10000)
        contact_ids = [str(c["_id"]) for c in contacts]
        
        # Delete all related interactions
        await db.interactions.delete_many({"user_id": current_user["user_id"]})
        
        # Delete all related drafts
        await db.drafts.delete_many({"user_id": current_user["user_id"]})
        
        # Delete all contacts
        result = await db.contacts.delete_many({"user_id": current_user["user_id"]})
        
        return {"message": f"Deleted {result.deleted_count} contacts", "deleted_count": result.deleted_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/contacts/{contact_id}/move-pipeline")
async def move_pipeline(contact_id: str, request: MovePipelineRequest, current_user: dict = Depends(get_current_user)):
    """Move contact to different pipeline stage and recalculate next_due"""
    try:
        existing = await db.contacts.find_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
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

@api_router.post("/contacts/{contact_id}/move-to-groups")
async def move_to_groups(contact_id: str, request: MoveToGroupRequest, current_user: dict = Depends(get_current_user)):
    """Update contact's group assignments"""
    try:
        existing = await db.contacts.find_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
        if not existing:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        await db.contacts.update_one(
            {"_id": ObjectId(contact_id)},
            {"$set": {
                "groups": request.group_ids,
                "updated_at": datetime.utcnow().isoformat()
            }}
        )
        
        updated_contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
        return serialize_doc(updated_contact)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ Interaction History Routes ============

@api_router.post("/contacts/{contact_id}/interactions", response_model=dict)
async def log_interaction(contact_id: str, interaction: InteractionCreate, current_user: dict = Depends(get_current_user)):
    """Log a new interaction with a contact"""
    try:
        # Verify contact exists and belongs to user
        contact = await db.contacts.find_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        interaction_dict = {
            "contact_id": contact_id,
            "user_id": current_user["user_id"],
            "interaction_type": interaction.interaction_type,
            "date": interaction.date,
            "notes": interaction.notes,
            "created_at": datetime.utcnow().isoformat()
        }
        
        result = await db.interactions.insert_one(interaction_dict)
        interaction_dict['id'] = str(result.inserted_id)
        if '_id' in interaction_dict:
            del interaction_dict['_id']
        
        # Update contact's last_contact_date and recalculate next_due
        target_interval = contact.get('target_interval_days', 30)
        next_due = calculate_next_due_with_random_factor(interaction.date, target_interval)
        
        await db.contacts.update_one(
            {"_id": ObjectId(contact_id)},
            {"$set": {
                "last_contact_date": interaction.date,
                "next_due": next_due,
                "updated_at": datetime.utcnow().isoformat()
            }}
        )
        
        return interaction_dict
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/contacts/{contact_id}/interactions", response_model=List[dict])
async def get_interactions(contact_id: str, current_user: dict = Depends(get_current_user)):
    """Get all interactions for a contact (sorted by date descending)"""
    try:
        # Verify contact exists and belongs to user
        contact = await db.contacts.find_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        interactions = await db.interactions.find({
            "contact_id": contact_id,
            "user_id": current_user["user_id"]
        }).sort("date", -1).to_list(100)
        
        return [serialize_doc(i) for i in interactions]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/interactions/{interaction_id}")
async def delete_interaction(interaction_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an interaction"""
    try:
        result = await db.interactions.delete_one({
            "_id": ObjectId(interaction_id),
            "user_id": current_user["user_id"]
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Interaction not found")
        return {"message": "Interaction deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ Group Routes ============

@api_router.post("/groups", response_model=dict)
async def create_group(group: GroupCreate, current_user: dict = Depends(get_current_user)):
    """Create a new group"""
    group_dict = group.dict()
    group_dict['user_id'] = current_user["user_id"]
    
    result = await db.groups.insert_one(group_dict)
    group_dict['id'] = str(result.inserted_id)
    if '_id' in group_dict:
        del group_dict['_id']
    return group_dict

@api_router.get("/groups", response_model=List[dict])
async def get_groups(current_user: dict = Depends(get_current_user)):
    """Get all groups for the current user"""
    groups = await db.groups.find({"user_id": current_user["user_id"]}).to_list(1000)
    
    # For each group, get the count of contacts
    result = []
    for g in groups:
        group_data = serialize_doc(g)
        contact_count = await db.contacts.count_documents({
            "user_id": current_user["user_id"],
            "groups": group_data["id"]
        })
        group_data["contact_count"] = contact_count
        result.append(group_data)
    
    return result

@api_router.get("/groups/{group_id}", response_model=dict)
async def get_group(group_id: str, current_user: dict = Depends(get_current_user)):
    try:
        group = await db.groups.find_one({
            "_id": ObjectId(group_id),
            "user_id": current_user["user_id"]
        })
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")
        
        group_data = serialize_doc(group)
        
        # Get contacts in this group
        contacts = await db.contacts.find({
            "user_id": current_user["user_id"],
            "groups": group_id
        }).to_list(1000)
        
        group_data["contacts"] = [serialize_doc(c) for c in contacts]
        group_data["contact_count"] = len(contacts)
        
        return group_data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/groups/{group_id}", response_model=dict)
async def update_group(group_id: str, group_update: GroupUpdate, current_user: dict = Depends(get_current_user)):
    try:
        update_data = {k: v for k, v in group_update.dict().items() if v is not None}
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        result = await db.groups.update_one(
            {"_id": ObjectId(group_id), "user_id": current_user["user_id"]},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Group not found")
        
        updated_group = await db.groups.find_one({"_id": ObjectId(group_id)})
        return serialize_doc(updated_group)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    try:
        # Remove this group from all contacts
        await db.contacts.update_many(
            {"user_id": current_user["user_id"], "groups": group_id},
            {"$pull": {"groups": group_id}}
        )
        
        result = await db.groups.delete_one({
            "_id": ObjectId(group_id),
            "user_id": current_user["user_id"]
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Group not found")
        return {"message": "Group deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ Draft Routes ============

@api_router.post("/drafts/generate/{contact_id}", response_model=dict)
async def generate_draft(contact_id: str, current_user: dict = Depends(get_current_user)):
    """Generate AI-powered message draft for a contact"""
    try:
        contact = await db.contacts.find_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        # Get user settings (handle case where user might not exist)
        user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
        if user:
            user_settings = {
                "default_writing_style": user.get("default_writing_style", "Hey! How have you been?"),
                "default_draft_language": user.get("default_draft_language", "English")
            }
        else:
            user_settings = {
                "default_writing_style": "Hey! How have you been?",
                "default_draft_language": "English"
            }
        
        # Get interaction history
        interactions = await db.interactions.find({
            "contact_id": contact_id,
            "user_id": current_user["user_id"]
        }).sort("date", -1).to_list(5)
        
        # Generate draft
        contact_serialized = serialize_doc(contact)
        draft_message = await generate_ai_draft(contact_serialized, user_settings, interactions)
        
        # Save draft
        draft_dict = {
            'user_id': current_user["user_id"],
            'contact_id': contact_id,
            'contact_name': contact.get('name', 'Unknown'),
            'draft_message': draft_message,
            'status': 'pending',
            'created_at': datetime.utcnow().isoformat()
        }
        
        result = await db.drafts.insert_one(draft_dict)
        draft_dict['id'] = str(result.inserted_id)
        if '_id' in draft_dict:
            del draft_dict['_id']
        
        return draft_dict
    except Exception as e:
        logging.error(f"Error generating draft: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/drafts", response_model=List[dict])
async def get_drafts(current_user: dict = Depends(get_current_user)):
    """Get all pending drafts"""
    drafts = await db.drafts.find({
        "user_id": current_user["user_id"],
        "status": "pending"
    }).to_list(100)
    return [serialize_doc(d) for d in drafts]

@api_router.put("/drafts/{draft_id}/dismiss")
async def dismiss_draft(draft_id: str, current_user: dict = Depends(get_current_user)):
    """Dismiss a draft"""
    try:
        result = await db.drafts.update_one(
            {"_id": ObjectId(draft_id), "user_id": current_user["user_id"]},
            {"$set": {"status": "dismissed"}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Draft not found")
        return {"message": "Draft dismissed"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/drafts/{draft_id}/sent")
async def mark_draft_sent(draft_id: str, current_user: dict = Depends(get_current_user)):
    """Mark draft as sent and update contact's last_contact_date"""
    try:
        draft = await db.drafts.find_one({
            "_id": ObjectId(draft_id),
            "user_id": current_user["user_id"]
        })
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

@api_router.delete("/drafts/{draft_id}")
async def delete_draft(draft_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a single draft"""
    try:
        result = await db.drafts.delete_one({
            "_id": ObjectId(draft_id),
            "user_id": current_user["user_id"]
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Draft not found")
        return {"message": "Draft deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/drafts")
async def delete_all_drafts(current_user: dict = Depends(get_current_user)):
    """Delete all drafts for the current user"""
    try:
        result = await db.drafts.delete_many({"user_id": current_user["user_id"]})
        return {"message": f"Deleted {result.deleted_count} drafts", "deleted_count": result.deleted_count}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ Morning Briefing Route ============

@api_router.get("/morning-briefing", response_model=List[dict])
async def get_morning_briefing(current_user: dict = Depends(get_current_user)):
    """Get contacts due today or overdue"""
    today = datetime.utcnow().isoformat()
    contacts = await db.contacts.find({
        "user_id": current_user["user_id"],
        "next_due": {"$lte": today}
    }).to_list(100)
    return [serialize_doc(c) for c in contacts]

# ============ Include Router & Middleware ============

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
