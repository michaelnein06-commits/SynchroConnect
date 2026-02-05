from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import RedirectResponse
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

# Google Calendar imports
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build

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

# Google Calendar Configuration
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', 'YOUR_GOOGLE_CLIENT_ID_HERE')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', 'YOUR_GOOGLE_CLIENT_SECRET_HERE')
GOOGLE_REDIRECT_URI = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:8001/api/google-calendar/callback')
GOOGLE_CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
]

def is_google_calendar_configured():
    """Check if Google Calendar credentials are properly configured"""
    return (
        GOOGLE_CLIENT_ID != 'YOUR_GOOGLE_CLIENT_ID_HERE' and 
        GOOGLE_CLIENT_SECRET != 'YOUR_GOOGLE_CLIENT_SECRET_HERE' and
        GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
    )

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

# --- Calendar Event Model ---
class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    participants: List[str] = []  # List of contact IDs
    reminder_minutes: int = 30  # Reminder before event in minutes
    color: str = "#5D3FD3"  # Event color
    all_day: bool = False
    recurring: Optional[str] = None  # none, daily, weekly, monthly, yearly
    google_event_id: Optional[str] = None  # For Google Calendar sync

class CalendarEvent(BaseModel):
    user_id: str
    title: str
    description: Optional[str] = None
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    participants: List[str] = []  # List of contact IDs
    reminder_minutes: int = 30
    color: str = "#5D3FD3"
    all_day: bool = False
    recurring: Optional[str] = None
    google_event_id: Optional[str] = None
    synced_to_google: bool = False
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    participants: Optional[List[str]] = None
    reminder_minutes: Optional[int] = None
    color: Optional[str] = None
    all_day: Optional[bool] = None
    recurring: Optional[str] = None

# ============ Utility Functions ============
async def calculate_target_interval_async(pipeline_stage: str, user_id: str = None, apply_randomization: bool = True) -> int:
    """Convert pipeline stage to days based on user's custom pipeline settings with randomization support"""
    # Default intervals for backward compatibility
    default_intervals = {
        "New": 0,
        "Daily": 1,
        "Weekly": 7,
        "Bi-Weekly": 14,
        "Monthly": 30,
        "Quarterly": 90,
        "Annually": 365
    }
    
    # If no user_id, use defaults
    if not user_id:
        print(f"No user_id provided, using default for {pipeline_stage}")
        return default_intervals.get(pipeline_stage, 30)
    
    # Try to get user's custom pipeline stages
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user and user.get('pipeline_stages'):
            print(f"Found user pipeline_stages: {[s.get('name') for s in user['pipeline_stages']]}")
            for stage in user['pipeline_stages']:
                if stage.get('name') == pipeline_stage:
                    base_interval = stage.get('interval_days', 30)
                    
                    # Apply randomization if enabled and requested
                    if apply_randomization and stage.get('randomize', False):
                        variation = stage.get('random_variation', 0)
                        if variation > 0:
                            random_offset = random.randint(-variation, variation)
                            final_interval = max(1, base_interval + random_offset)  # Ensure at least 1 day
                            print(f"Applied randomization to {pipeline_stage}: base={base_interval}, variation=±{variation}, offset={random_offset}, final={final_interval}")
                            return final_interval
                    
                    print(f"Found custom interval for {pipeline_stage}: {base_interval} days (no randomization)")
                    return base_interval
            print(f"Pipeline stage {pipeline_stage} not found in user's custom stages, checking defaults")
        else:
            print(f"User found but no pipeline_stages, checking defaults")
    except Exception as e:
        print(f"Error getting user pipeline stages: {e}")
    
    # Return default for known stages, or 30 for unknown
    result = default_intervals.get(pipeline_stage, 30)
    print(f"Using default interval for {pipeline_stage}: {result} days")
    return result

def calculate_target_interval(pipeline_stage: str) -> int:
    """Convert pipeline stage to days. 'New' stage has no interval (returns 0)
    Note: This is a sync version for backward compatibility. Use calculate_target_interval_async when possible."""
    intervals = {
        "New": 0,  # New contacts have no countdown
        "Daily": 1,
        "Weekly": 7,
        "Bi-Weekly": 14,
        "Monthly": 30,
        "Quarterly": 90,
        "Annually": 365
    }
    return intervals.get(pipeline_stage, 30)

def calculate_next_due_with_random_factor(last_contact_date_str: str, target_interval_days: int) -> str:
    """Calculate next due date with optional random factor
    Random factor is proportional to interval: 
    - Short intervals (<=7 days): no random factor
    - Medium intervals (8-30 days): ±1-2 days
    - Long intervals (>30 days): ±3-5 days
    """
    if not last_contact_date_str:
        last_contact_date_str = datetime.utcnow().isoformat()
    
    try:
        last_contact = datetime.fromisoformat(last_contact_date_str.replace('Z', '+00:00'))
    except:
        last_contact = datetime.utcnow()
    
    # Calculate proportional random factor based on interval length
    if target_interval_days <= 7:
        random_factor = 0  # No randomness for daily/weekly
    elif target_interval_days <= 30:
        random_factor = random.randint(-1, 1)  # Slight variance for bi-weekly/monthly
    else:
        random_factor = random.randint(-3, 3)  # More variance for quarterly/annually
    
    # Ensure we never go negative total days
    total_days = max(target_interval_days + random_factor, 1)
    next_due = last_contact + timedelta(days=total_days)
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

@api_router.post("/contacts/move-to-new")
async def move_contacts_to_new(stage_name: str = None, current_user: dict = Depends(get_current_user)):
    """Move all contacts with a specific pipeline_stage to 'New' stage"""
    if not stage_name:
        raise HTTPException(status_code=400, detail="stage_name is required")
    
    # Move all contacts with this pipeline_stage to "New"
    result = await db.contacts.update_many(
        {
            "user_id": current_user["user_id"],
            "pipeline_stage": stage_name
        },
        {
            "$set": {
                "pipeline_stage": "New",
                "next_due": None
            }
        }
    )
    
    return {"message": f"Moved {result.modified_count} contacts to 'New' stage", "count": result.modified_count}

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
        
        # Use async version to get custom interval from user's settings
        target_interval = await calculate_target_interval_async(request.pipeline_stage, current_user["user_id"])
        
        # For pipeline moves, use TODAY as base date (not last_contact_date)
        # This ensures the countdown starts fresh from now
        today = datetime.utcnow().isoformat()
        next_due = calculate_next_due_with_random_factor(today, target_interval)
        
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

@api_router.post("/morning-briefing/generate")
async def generate_ai_briefing(current_user: dict = Depends(get_current_user)):
    """Generate AI-written morning briefing for all contacts due today or overdue"""
    try:
        today = datetime.utcnow()
        today_iso = today.isoformat()
        
        # Get user profile for name
        user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
        user_name = user.get('name', 'there') if user else 'there'
        
        # Get all contacts for this user
        all_contacts = await db.contacts.find({
            "user_id": current_user["user_id"],
            "pipeline_stage": {"$ne": "New"}  # Exclude New contacts
        }).to_list(500)
        
        # Categorize contacts
        overdue_contacts = []
        due_today_contacts = []
        due_this_week_contacts = []
        birthdays_today = []
        upcoming_birthdays = []
        
        for contact in all_contacts:
            # Check due dates
            if contact.get('next_due'):
                due_date = datetime.fromisoformat(contact['next_due'].replace('Z', '+00:00'))
                days_until = (due_date - today).days
                
                if days_until < 0:
                    overdue_contacts.append({**contact, 'days_overdue': abs(days_until)})
                elif days_until <= 1:
                    due_today_contacts.append(contact)
                elif days_until <= 7:
                    due_this_week_contacts.append({**contact, 'days_until': days_until})
            
            # Check birthdays
            if contact.get('birthday'):
                try:
                    bday = datetime.fromisoformat(contact['birthday'].replace('Z', '+00:00'))
                    bday_this_year = bday.replace(year=today.year)
                    days_to_bday = (bday_this_year - today).days
                    
                    if days_to_bday == 0:
                        birthdays_today.append(contact)
                    elif 0 < days_to_bday <= 7:
                        upcoming_birthdays.append({**contact, 'days_until': days_to_bday})
                except:
                    pass
        
        # Build context for AI
        briefing_context = f"""Today's date: {today.strftime('%A, %B %d, %Y')}
        
OVERDUE CONTACTS ({len(overdue_contacts)} people need attention):
"""
        for c in overdue_contacts[:10]:
            briefing_context += f"- {c.get('name', 'Unknown')}: {c.get('days_overdue', 0)} days overdue, {c.get('pipeline_stage', 'Unknown')} frequency"
            if c.get('job'): briefing_context += f", works as {c['job']}"
            if c.get('hobbies'): briefing_context += f", enjoys {c['hobbies']}"
            briefing_context += "\n"
        
        briefing_context += f"\nDUE TODAY ({len(due_today_contacts)} people to reach out to):\n"
        for c in due_today_contacts[:10]:
            briefing_context += f"- {c.get('name', 'Unknown')}: {c.get('pipeline_stage', 'Unknown')} contact"
            if c.get('job'): briefing_context += f", works as {c['job']}"
            briefing_context += "\n"
        
        briefing_context += f"\nCOMING UP THIS WEEK ({len(due_this_week_contacts)} people):\n"
        for c in due_this_week_contacts[:10]:
            briefing_context += f"- {c.get('name', 'Unknown')}: due in {c.get('days_until', '?')} days\n"
        
        if birthdays_today:
            briefing_context += f"\n🎂 BIRTHDAYS TODAY:\n"
            for c in birthdays_today:
                briefing_context += f"- {c.get('name', 'Unknown')}'s birthday is TODAY!\n"
        
        if upcoming_birthdays:
            briefing_context += f"\n🎁 UPCOMING BIRTHDAYS:\n"
            for c in upcoming_birthdays[:5]:
                briefing_context += f"- {c.get('name', 'Unknown')} in {c.get('days_until', '?')} days\n"
        
        # Get today's calendar events
        today_date = today.strftime("%Y-%m-%d")
        today_events = await db.calendar_events.find({
            "user_id": current_user["user_id"],
            "date": today_date
        }).sort("start_time", 1).to_list(20)
        
        # Get this week's calendar events
        week_end = (today + timedelta(days=7)).strftime("%Y-%m-%d")
        week_events = await db.calendar_events.find({
            "user_id": current_user["user_id"],
            "date": {"$gt": today_date, "$lte": week_end}
        }).sort("date", 1).to_list(20)
        
        if today_events:
            briefing_context += f"\n📅 TODAY'S APPOINTMENTS ({len(today_events)} scheduled):\n"
            for event in today_events:
                time_str = event.get('start_time', '')
                briefing_context += f"- {time_str}: {event.get('title', 'Untitled')}"
                if event.get('participants'):
                    # Get participant names
                    participant_names = []
                    for pid in event['participants'][:3]:
                        try:
                            contact = await db.contacts.find_one({"_id": ObjectId(pid)})
                            if contact:
                                participant_names.append(contact.get('name', 'Unknown'))
                        except:
                            pass
                    if participant_names:
                        briefing_context += f" (with {', '.join(participant_names)})"
                briefing_context += "\n"
        
        if week_events:
            briefing_context += f"\n📆 UPCOMING THIS WEEK ({len(week_events)} events):\n"
            for event in week_events[:5]:
                briefing_context += f"- {event.get('date', '')}: {event.get('title', 'Untitled')}\n"
        
        # Generate AI briefing
        prompt = f"""Write a warm, motivating morning briefing for {user_name} about their contact management for today.

{briefing_context}

Write a personalized morning briefing that:
1. Greets them warmly based on the time of day
2. Summarizes what's important today (overdue contacts, due today, birthdays)
3. Suggests 2-3 priority contacts to reach out to first
4. Gives a brief tip for maintaining relationships
5. Ends with an encouraging note

Keep it friendly, helpful, and motivating. Use emojis sparingly. Maximum 200 words."""

        chat = LlmChat(
            api_key=os.environ.get('EMERGENT_LLM_KEY', ''),
            session_id=f"briefing_{current_user['user_id']}_{today.timestamp()}",
            system_message="You are a friendly personal relationship coach helping someone stay connected with their network."
        ).with_model("openai", "gpt-4.1")
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        return {
            "briefing": response.strip(),
            "stats": {
                "overdue_count": len(overdue_contacts),
                "due_today_count": len(due_today_contacts),
                "due_this_week_count": len(due_this_week_contacts),
                "birthdays_today": len(birthdays_today),
                "upcoming_birthdays": len(upcoming_birthdays),
                "today_events_count": len(today_events),
                "week_events_count": len(week_events)
            },
            "today_events": [serialize_doc(e) for e in today_events],
            "week_events": [serialize_doc(e) for e in week_events],
            "generated_at": today.isoformat()
        }
    except Exception as e:
        logging.error(f"Error generating AI briefing: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

# ============ Calendar Event Routes ============

@api_router.post("/calendar-events", response_model=dict)
async def create_calendar_event(event: CalendarEventCreate, current_user: dict = Depends(get_current_user)):
    """Create a new calendar event and optionally add to participant's interaction history"""
    try:
        event_dict = event.dict()
        event_dict['user_id'] = current_user["user_id"]
        event_dict['synced_to_google'] = False
        event_dict['created_at'] = datetime.utcnow().isoformat()
        event_dict['updated_at'] = datetime.utcnow().isoformat()
        
        result = await db.calendar_events.insert_one(event_dict)
        event_dict['id'] = str(result.inserted_id)
        if '_id' in event_dict:
            del event_dict['_id']
        
        # Add to interaction history for each participant (as a future/scheduled meeting)
        if event.participants:
            for contact_id in event.participants:
                try:
                    # Verify contact exists
                    contact = await db.contacts.find_one({
                        "_id": ObjectId(contact_id),
                        "user_id": current_user["user_id"]
                    })
                    if contact:
                        interaction_dict = {
                            "contact_id": contact_id,
                            "user_id": current_user["user_id"],
                            "interaction_type": "Scheduled Meeting",
                            "date": event.date,
                            "notes": f"📅 {event.title}" + (f" - {event.description}" if event.description else ""),
                            "calendar_event_id": event_dict['id'],
                            "created_at": datetime.utcnow().isoformat()
                        }
                        await db.interactions.insert_one(interaction_dict)
                except Exception as e:
                    logging.warning(f"Could not add interaction for contact {contact_id}: {e}")
        
        return event_dict
    except Exception as e:
        logging.error(f"Error creating calendar event: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/calendar-events", response_model=List[dict])
async def get_calendar_events(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all calendar events, optionally filtered by date range"""
    try:
        query = {"user_id": current_user["user_id"]}
        
        if start_date and end_date:
            query["date"] = {"$gte": start_date, "$lte": end_date}
        elif start_date:
            query["date"] = {"$gte": start_date}
        elif end_date:
            query["date"] = {"$lte": end_date}
        
        events = await db.calendar_events.find(query).sort("date", 1).to_list(500)
        
        # Enrich with participant details
        result = []
        for event in events:
            event_data = serialize_doc(event)
            if event_data.get('participants'):
                participant_details = []
                for contact_id in event_data['participants']:
                    try:
                        contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
                        if contact:
                            participant_details.append({
                                "id": str(contact["_id"]),
                                "name": contact.get("name", "Unknown"),
                                "profile_picture": contact.get("profile_picture")
                            })
                    except:
                        pass
                event_data['participant_details'] = participant_details
            result.append(event_data)
        
        return result
    except Exception as e:
        logging.error(f"Error fetching calendar events: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/calendar-events/today", response_model=List[dict])
async def get_today_events(current_user: dict = Depends(get_current_user)):
    """Get today's calendar events"""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return await get_calendar_events(start_date=today, end_date=today, current_user=current_user)

@api_router.get("/calendar-events/week", response_model=List[dict])
async def get_week_events(current_user: dict = Depends(get_current_user)):
    """Get this week's calendar events"""
    today = datetime.utcnow()
    week_start = today.strftime("%Y-%m-%d")
    week_end = (today + timedelta(days=7)).strftime("%Y-%m-%d")
    return await get_calendar_events(start_date=week_start, end_date=week_end, current_user=current_user)

@api_router.get("/calendar-events/{event_id}", response_model=dict)
async def get_calendar_event(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific calendar event"""
    try:
        event = await db.calendar_events.find_one({
            "_id": ObjectId(event_id),
            "user_id": current_user["user_id"]
        })
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        event_data = serialize_doc(event)
        
        # Enrich with participant details
        if event_data.get('participants'):
            participant_details = []
            for contact_id in event_data['participants']:
                try:
                    contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
                    if contact:
                        participant_details.append({
                            "id": str(contact["_id"]),
                            "name": contact.get("name", "Unknown"),
                            "profile_picture": contact.get("profile_picture")
                        })
                except:
                    pass
            event_data['participant_details'] = participant_details
        
        return event_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.put("/calendar-events/{event_id}", response_model=dict)
async def update_calendar_event(event_id: str, event_update: CalendarEventUpdate, current_user: dict = Depends(get_current_user)):
    """Update a calendar event"""
    try:
        update_data = {k: v for k, v in event_update.dict().items() if v is not None}
        update_data['updated_at'] = datetime.utcnow().isoformat()
        
        result = await db.calendar_events.update_one(
            {"_id": ObjectId(event_id), "user_id": current_user["user_id"]},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Event not found")
        
        updated_event = await db.calendar_events.find_one({"_id": ObjectId(event_id)})
        return serialize_doc(updated_event)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/calendar-events/{event_id}")
async def delete_calendar_event(event_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a calendar event"""
    try:
        # Also delete related interactions
        await db.interactions.delete_many({"calendar_event_id": event_id})
        
        result = await db.calendar_events.delete_one({
            "_id": ObjectId(event_id),
            "user_id": current_user["user_id"]
        })
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Event not found")
        return {"message": "Event deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/calendar-events/by-date/{date}", response_model=List[dict])
async def get_events_by_date(date: str, current_user: dict = Depends(get_current_user)):
    """Get all events for a specific date (day view)"""
    try:
        events = await db.calendar_events.find({
            "user_id": current_user["user_id"],
            "date": date
        }).sort("start_time", 1).to_list(100)
        
        result = []
        for event in events:
            event_data = serialize_doc(event)
            if event_data.get('participants'):
                participant_details = []
                for contact_id in event_data['participants']:
                    try:
                        contact = await db.contacts.find_one({"_id": ObjectId(contact_id)})
                        if contact:
                            participant_details.append({
                                "id": str(contact["_id"]),
                                "name": contact.get("name", "Unknown"),
                                "profile_picture": contact.get("profile_picture")
                            })
                    except:
                        pass
                event_data['participant_details'] = participant_details
            result.append(event_data)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.get("/contacts/{contact_id}/calendar-events", response_model=List[dict])
async def get_contact_calendar_events(contact_id: str, current_user: dict = Depends(get_current_user)):
    """Get all calendar events for a specific contact (their logbook/future meetings)"""
    try:
        # Verify contact exists
        contact = await db.contacts.find_one({
            "_id": ObjectId(contact_id),
            "user_id": current_user["user_id"]
        })
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        events = await db.calendar_events.find({
            "user_id": current_user["user_id"],
            "participants": contact_id
        }).sort("date", -1).to_list(100)
        
        return [serialize_doc(e) for e in events]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ Google Calendar Integration (MOCKED until credentials provided) ============

class GoogleCalendarTokenUpdate(BaseModel):
    access_token: str
    refresh_token: str

@api_router.get("/google-calendar/status")
async def get_google_calendar_status(current_user: dict = Depends(get_current_user)):
    """Check Google Calendar integration status"""
    is_configured = is_google_calendar_configured()
    
    # Check if user has connected their Google Calendar
    user_tokens = await db.google_calendar_tokens.find_one({"user_id": current_user["user_id"]})
    is_connected = user_tokens is not None and user_tokens.get("access_token") is not None
    
    return {
        "is_configured": is_configured,
        "is_connected": is_connected,
        "message": "Google Calendar Credentials not configured" if not is_configured else (
            "Connected to Google Calendar" if is_connected else "Not connected - click to authorize"
        ),
        "setup_instructions": None if is_configured else {
            "step1": "Go to https://console.cloud.google.com/apis/credentials",
            "step2": "Create or select a project",
            "step3": "Enable 'Google Calendar API'",
            "step4": "Create OAuth 2.0 credentials (Web application)",
            "step5": "Add redirect URI: YOUR_BACKEND_URL/api/google-calendar/callback",
            "step6": "Copy Client ID and Client Secret to backend/.env file"
        }
    }

@api_router.get("/google-calendar/auth-url")
async def get_google_calendar_auth_url(current_user: dict = Depends(get_current_user)):
    """Get the Google OAuth authorization URL"""
    if not is_google_calendar_configured():
        raise HTTPException(
            status_code=400, 
            detail="Google Calendar is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env"
        )
    
    try:
        # Create OAuth flow
        client_config = {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_REDIRECT_URI]
            }
        }
        
        flow = Flow.from_client_config(
            client_config,
            scopes=GOOGLE_CALENDAR_SCOPES,
            redirect_uri=GOOGLE_REDIRECT_URI
        )
        
        auth_url, state = flow.authorization_url(
            prompt='consent',
            access_type='offline',
            include_granted_scopes='true'
        )
        
        # Store state for verification
        await db.google_calendar_states.update_one(
            {"user_id": current_user["user_id"]},
            {"$set": {
                "user_id": current_user["user_id"],
                "state": state,
                "created_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        
        return {"auth_url": auth_url, "state": state}
    except Exception as e:
        logging.error(f"Error creating Google auth URL: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/google-calendar/callback")
async def google_calendar_callback(code: str, state: str):
    """Handle Google OAuth callback"""
    if not is_google_calendar_configured():
        raise HTTPException(status_code=400, detail="Google Calendar is not configured")
    
    try:
        # Find user by state
        state_record = await db.google_calendar_states.find_one({"state": state})
        if not state_record:
            raise HTTPException(status_code=400, detail="Invalid or expired state")
        
        user_id = state_record["user_id"]
        
        # Create OAuth flow and exchange code for tokens
        client_config = {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [GOOGLE_REDIRECT_URI]
            }
        }
        
        flow = Flow.from_client_config(
            client_config,
            scopes=GOOGLE_CALENDAR_SCOPES,
            redirect_uri=GOOGLE_REDIRECT_URI
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        # Store tokens
        await db.google_calendar_tokens.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "access_token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "token_expiry": credentials.expiry.isoformat() if credentials.expiry else None,
                "scopes": list(credentials.scopes) if credentials.scopes else [],
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        
        # Clean up state
        await db.google_calendar_states.delete_one({"state": state})
        
        # Redirect to success page or app
        return RedirectResponse(url="/settings?google_calendar=connected")
        
    except Exception as e:
        logging.error(f"Google Calendar callback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def get_google_calendar_service(user_id: str):
    """Get authenticated Google Calendar service for a user"""
    if not is_google_calendar_configured():
        return None
    
    token_record = await db.google_calendar_tokens.find_one({"user_id": user_id})
    if not token_record:
        return None
    
    try:
        credentials = Credentials(
            token=token_record.get("access_token"),
            refresh_token=token_record.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
            scopes=token_record.get("scopes", GOOGLE_CALENDAR_SCOPES)
        )
        
        # Refresh if expired
        if credentials.expired and credentials.refresh_token:
            credentials.refresh(GoogleRequest())
            # Update stored tokens
            await db.google_calendar_tokens.update_one(
                {"user_id": user_id},
                {"$set": {
                    "access_token": credentials.token,
                    "token_expiry": credentials.expiry.isoformat() if credentials.expiry else None,
                    "updated_at": datetime.utcnow().isoformat()
                }}
            )
        
        service = build('calendar', 'v3', credentials=credentials)
        return service
    except Exception as e:
        logging.error(f"Error getting Google Calendar service: {e}")
        return None

@api_router.post("/google-calendar/sync-to-google/{event_id}")
async def sync_event_to_google(event_id: str, current_user: dict = Depends(get_current_user)):
    """Sync a local event to Google Calendar"""
    if not is_google_calendar_configured():
        raise HTTPException(status_code=400, detail="Google Calendar is not configured")
    
    service = await get_google_calendar_service(current_user["user_id"])
    if not service:
        raise HTTPException(status_code=401, detail="Google Calendar not connected. Please authorize first.")
    
    try:
        # Get local event
        event = await db.calendar_events.find_one({
            "_id": ObjectId(event_id),
            "user_id": current_user["user_id"]
        })
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Convert to Google Calendar format
        google_event = {
            'summary': event.get('title', 'Untitled'),
            'description': event.get('description', ''),
            'location': event.get('location', ''),
            'start': {
                'dateTime': f"{event['date']}T{event.get('start_time', '09:00')}:00",
                'timeZone': 'Europe/Berlin',
            },
            'end': {
                'dateTime': f"{event['date']}T{event.get('end_time', event.get('start_time', '10:00'))}:00",
                'timeZone': 'Europe/Berlin',
            },
        }
        
        if event.get('all_day'):
            google_event['start'] = {'date': event['date']}
            google_event['end'] = {'date': event['date']}
        
        # Create or update in Google Calendar
        if event.get('google_event_id'):
            # Update existing
            result = service.events().update(
                calendarId='primary',
                eventId=event['google_event_id'],
                body=google_event
            ).execute()
        else:
            # Create new
            result = service.events().insert(
                calendarId='primary',
                body=google_event
            ).execute()
            
            # Store Google event ID
            await db.calendar_events.update_one(
                {"_id": ObjectId(event_id)},
                {"$set": {
                    "google_event_id": result['id'],
                    "synced_to_google": True,
                    "updated_at": datetime.utcnow().isoformat()
                }}
            )
        
        return {"success": True, "google_event_id": result['id'], "message": "Event synced to Google Calendar"}
    except Exception as e:
        logging.error(f"Error syncing to Google Calendar: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/google-calendar/import-from-google")
async def import_from_google_calendar(
    days_ahead: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Import events from Google Calendar"""
    if not is_google_calendar_configured():
        raise HTTPException(status_code=400, detail="Google Calendar is not configured")
    
    service = await get_google_calendar_service(current_user["user_id"])
    if not service:
        raise HTTPException(status_code=401, detail="Google Calendar not connected. Please authorize first.")
    
    try:
        now = datetime.utcnow()
        time_min = now.isoformat() + 'Z'
        time_max = (now + timedelta(days=days_ahead)).isoformat() + 'Z'
        
        # Fetch events from Google Calendar
        events_result = service.events().list(
            calendarId='primary',
            timeMin=time_min,
            timeMax=time_max,
            maxResults=100,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        google_events = events_result.get('items', [])
        imported_count = 0
        
        for g_event in google_events:
            # Check if already imported
            existing = await db.calendar_events.find_one({
                "user_id": current_user["user_id"],
                "google_event_id": g_event['id']
            })
            
            if existing:
                continue
            
            # Parse date/time
            start = g_event.get('start', {})
            end = g_event.get('end', {})
            
            if 'dateTime' in start:
                date = start['dateTime'][:10]
                start_time = start['dateTime'][11:16]
                end_time = end.get('dateTime', start['dateTime'])[11:16]
                all_day = False
            else:
                date = start.get('date', datetime.utcnow().strftime('%Y-%m-%d'))
                start_time = '00:00'
                end_time = '23:59'
                all_day = True
            
            # Create local event
            event_dict = {
                "user_id": current_user["user_id"],
                "title": g_event.get('summary', 'Untitled'),
                "description": g_event.get('description', ''),
                "date": date,
                "start_time": start_time,
                "end_time": end_time,
                "all_day": all_day,
                "participants": [],
                "reminder_minutes": 30,
                "color": "#4285F4",  # Google Blue
                "google_event_id": g_event['id'],
                "synced_to_google": True,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            
            await db.calendar_events.insert_one(event_dict)
            imported_count += 1
        
        return {
            "success": True,
            "imported_count": imported_count,
            "message": f"Imported {imported_count} events from Google Calendar"
        }
    except Exception as e:
        logging.error(f"Error importing from Google Calendar: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/google-calendar/disconnect")
async def disconnect_google_calendar(current_user: dict = Depends(get_current_user)):
    """Disconnect Google Calendar integration"""
    await db.google_calendar_tokens.delete_one({"user_id": current_user["user_id"]})
    return {"success": True, "message": "Google Calendar disconnected"}

# ============ Push Notification Endpoints ============

class PushTokenUpdate(BaseModel):
    push_token: str
    device_type: str = "unknown"  # ios, android, web

class ReminderCreate(BaseModel):
    event_id: str
    reminder_time: str  # ISO datetime when to send reminder
    title: str
    body: str

@api_router.post("/push-token")
async def register_push_token(token_data: PushTokenUpdate, current_user: dict = Depends(get_current_user)):
    """Register or update push notification token for user"""
    try:
        await db.push_tokens.update_one(
            {"user_id": current_user["user_id"], "push_token": token_data.push_token},
            {"$set": {
                "user_id": current_user["user_id"],
                "push_token": token_data.push_token,
                "device_type": token_data.device_type,
                "updated_at": datetime.utcnow().isoformat()
            }},
            upsert=True
        )
        return {"success": True, "message": "Push token registered"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.delete("/push-token/{push_token}")
async def remove_push_token(push_token: str, current_user: dict = Depends(get_current_user)):
    """Remove push notification token"""
    await db.push_tokens.delete_one({
        "user_id": current_user["user_id"],
        "push_token": push_token
    })
    return {"success": True, "message": "Push token removed"}

@api_router.get("/reminders/pending")
async def get_pending_reminders(current_user: dict = Depends(get_current_user)):
    """Get all pending reminders for today's and upcoming events"""
    try:
        now = datetime.utcnow()
        today = now.strftime("%Y-%m-%d")
        
        # Get events for today and tomorrow
        events = await db.calendar_events.find({
            "user_id": current_user["user_id"],
            "date": {"$gte": today, "$lte": (now + timedelta(days=1)).strftime("%Y-%m-%d")}
        }).to_list(50)
        
        reminders = []
        for event in events:
            event_datetime_str = f"{event['date']}T{event.get('start_time', '09:00')}:00"
            try:
                event_datetime = datetime.fromisoformat(event_datetime_str)
                reminder_minutes = event.get('reminder_minutes', 30)
                reminder_time = event_datetime - timedelta(minutes=reminder_minutes)
                
                if reminder_time > now:
                    reminders.append({
                        "event_id": str(event["_id"]),
                        "title": event.get("title", "Termin"),
                        "body": f"In {reminder_minutes} Minuten: {event.get('title', 'Termin')}",
                        "reminder_time": reminder_time.isoformat(),
                        "event_time": event_datetime.isoformat()
                    })
            except Exception as e:
                logging.warning(f"Could not parse event datetime: {e}")
                continue
        
        return reminders
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/reminders/schedule")
async def schedule_reminder(reminder: ReminderCreate, current_user: dict = Depends(get_current_user)):
    """Schedule a reminder for an event"""
    try:
        reminder_dict = reminder.dict()
        reminder_dict["user_id"] = current_user["user_id"]
        reminder_dict["status"] = "pending"
        reminder_dict["created_at"] = datetime.utcnow().isoformat()
        
        result = await db.reminders.insert_one(reminder_dict)
        return {"success": True, "reminder_id": str(result.inserted_id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

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
