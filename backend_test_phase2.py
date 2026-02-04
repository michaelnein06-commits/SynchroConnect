#!/usr/bin/env python3
"""
SynchroConnectr Phase 2 Backend API Test Suite
Tests all backend endpoints for the completely refactored SynchroConnectr Phase 2
"""

import requests
import json
from datetime import datetime, timedelta
import time
import sys
import os
from pymongo import MongoClient
from bson import ObjectId
import jwt

# Use the production URL from frontend/.env
BASE_URL = "https://app-evolution-60.preview.emergentagent.com/api"

# MongoDB connection for creating test user
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"

# JWT settings (from backend/.env)
JWT_SECRET = "synchroconnectr_secret_key_2025_super_secure_random_string"
JWT_ALGORITHM = "HS256"

class SynchroConnectrPhase2Tester:
    def __init__(self):
        self.base_url = BASE_URL
        self.test_user_id = None
        self.test_user_email = "test@test.com"
        self.auth_token = None
        self.test_contacts = []
        self.test_groups = []
        self.test_interactions = []
        self.test_drafts = []
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
        # MongoDB client for direct database operations
        try:
            self.mongo_client = MongoClient(MONGO_URL)
            self.db = self.mongo_client[DB_NAME]
            self.log("✅ Connected to MongoDB")
        except Exception as e:
            self.log(f"❌ Failed to connect to MongoDB: {str(e)}", "ERROR")
            sys.exit(1)
        
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def create_test_user_and_token(self):
        """Create a test user directly in MongoDB and generate JWT token"""
        self.log("Creating test user and JWT token...")
        try:
            # Create test user
            user_data = {
                "email": self.test_user_email,
                "name": "Test User",
                "google_picture": "https://example.com/test.jpg",
                "job": "Software Tester",
                "location": "San Francisco, CA",
                "phone": "+1-555-0123",
                "ui_language": "en",
                "default_draft_language": "English",
                "default_writing_style": "Hey! How have you been? Just wanted to catch up and see what you've been up to lately.",
                "notification_time": "09:00",
                "notifications_enabled": True,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            
            # Delete existing test user if exists
            self.db.users.delete_one({"email": self.test_user_email})
            
            # Insert new test user
            result = self.db.users.insert_one(user_data)
            self.test_user_id = str(result.inserted_id)
            
            # Generate JWT token
            token_data = {
                "user_id": self.test_user_id,
                "email": self.test_user_email,
                "exp": datetime.utcnow() + timedelta(hours=24)
            }
            self.auth_token = jwt.encode(token_data, JWT_SECRET, algorithm=JWT_ALGORITHM)
            
            # Set authorization header
            self.session.headers.update({
                'Authorization': f'Bearer {self.auth_token}'
            })
            
            self.log(f"✅ Created test user with ID: {self.test_user_id}")
            self.log(f"✅ Generated JWT token")
            return True
            
        except Exception as e:
            self.log(f"❌ Failed to create test user: {str(e)}", "ERROR")
            return False
    
    def test_api_health(self):
        """Test if API is accessible and returns version 2.0.0"""
        self.log("Testing API health...")
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                self.log(f"✅ API Health: {data}")
                
                # Verify version 2.0.0
                if data.get("version") == "2.0.0":
                    self.log("✅ Confirmed API version 2.0.0")
                    return True
                else:
                    self.log(f"❌ Expected version 2.0.0, got {data.get('version')}", "ERROR")
                    return False
            else:
                self.log(f"❌ API Health failed: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ API Health exception: {str(e)}", "ERROR")
            return False
    
    def test_profile_endpoints(self):
        """Test User Profile GET/PUT endpoints"""
        self.log("Testing User Profile endpoints...")
        
        try:
            # Test GET /api/profile
            response = self.session.get(f"{self.base_url}/profile")
            if response.status_code == 200:
                profile = response.json()
                self.log(f"✅ Retrieved user profile: {profile['name']}")
                
                # Verify profile fields
                assert 'id' in profile
                assert profile['email'] == self.test_user_email
                assert 'job' in profile
                assert 'location' in profile
                assert 'ui_language' in profile
                assert 'default_draft_language' in profile
                assert 'default_writing_style' in profile
                
            else:
                self.log(f"❌ Failed to get profile: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test PUT /api/profile
            update_data = {
                "job": "Senior Software Tester",
                "location": "Austin, TX",
                "phone": "+1-555-9999",
                "default_writing_style": "Hi there! Hope you're doing well. Would love to catch up soon!"
            }
            
            response = self.session.put(f"{self.base_url}/profile", json=update_data)
            if response.status_code == 200:
                updated_profile = response.json()
                self.log(f"✅ Updated user profile successfully")
                
                # Verify updates
                assert updated_profile['job'] == update_data['job']
                assert updated_profile['location'] == update_data['location']
                assert updated_profile['phone'] == update_data['phone']
                assert updated_profile['default_writing_style'] == update_data['default_writing_style']
                
                return True
            else:
                self.log(f"❌ Failed to update profile: {response.status_code} - {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Exception in profile test: {str(e)}", "ERROR")
            return False
    
    def test_contact_crud_new_schema(self):
        """Test Contact CRUD with new Phase 2 schema"""
        self.log("Testing Contact CRUD with new schema...")
        
        # Test contacts with new fields
        test_contacts_data = [
            {
                "name": "Sarah Johnson",
                "phone": "+1-555-0101",
                "email": "sarah.johnson@techcorp.com",
                "job": "Product Manager at TechCorp",
                "location": "San Francisco, CA",
                "academic_degree": "MBA from Stanford",
                "birthday": "1990-05-15",
                "hobbies": "Hiking, Photography, Cooking",
                "favorite_food": "Sushi",
                "how_we_met": "Met at TechCrunch Disrupt 2023",
                "pipeline_stage": "Monthly",
                "groups": [],
                "language": "English",
                "tone": "Casual",
                "example_message": "Hey Sarah! Hope you're crushing it at TechCorp. Would love to grab coffee soon!",
                "notes": "Working on AI product launch, loves hiking in Marin"
            },
            {
                "name": "Michael Chen",
                "phone": "+1-555-0102",
                "email": "michael.chen@startupxyz.com",
                "job": "Senior Software Engineer",
                "location": "Austin, TX",
                "academic_degree": "MS Computer Science from UT Austin",
                "birthday": "1988-12-03",
                "hobbies": "Machine Learning, Rock Climbing, Board Games",
                "favorite_food": "Thai food",
                "how_we_met": "Former colleague at previous company",
                "pipeline_stage": "Bi-Weekly",
                "groups": [],
                "language": "English",
                "tone": "Professional",
                "example_message": "Hi Michael, hope the new role is going well. Let's catch up over lunch!",
                "notes": "Building ML infrastructure, has two kids, recently moved to Austin"
            }
        ]
        
        created_contacts = []
        for contact_data in test_contacts_data:
            try:
                response = self.session.post(f"{self.base_url}/contacts", json=contact_data)
                if response.status_code == 200:
                    contact = response.json()
                    created_contacts.append(contact)
                    self.log(f"✅ Created contact: {contact['name']} (ID: {contact['id']})")
                    
                    # Verify new schema fields
                    assert 'id' in contact
                    assert 'user_id' in contact
                    assert contact['user_id'] == self.test_user_id
                    assert contact['location'] == contact_data['location']
                    assert contact['academic_degree'] == contact_data['academic_degree']
                    assert contact['hobbies'] == contact_data['hobbies']
                    assert contact['how_we_met'] == contact_data['how_we_met']
                    assert contact['example_message'] == contact_data['example_message']
                    assert 'next_due' in contact
                    assert 'target_interval_days' in contact
                    
                    # Verify removed fields don't exist
                    assert 'tags' not in contact  # Removed in Phase 2
                    assert 'last_met' not in contact  # Removed in Phase 2
                    
                else:
                    self.log(f"❌ Failed to create contact {contact_data['name']}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception creating contact {contact_data['name']}: {str(e)}", "ERROR")
                return False
        
        self.test_contacts = created_contacts
        
        # Test GET all contacts (user-scoped)
        try:
            response = self.session.get(f"{self.base_url}/contacts")
            if response.status_code == 200:
                contacts = response.json()
                self.log(f"✅ Retrieved {len(contacts)} user-scoped contacts")
                
                # Verify all contacts belong to current user
                for contact in contacts:
                    assert contact['user_id'] == self.test_user_id
                    
            else:
                self.log(f"❌ Failed to get contacts: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Exception getting contacts: {str(e)}", "ERROR")
            return False
        
        # Test GET individual contact
        if created_contacts:
            contact_id = created_contacts[0]['id']
            try:
                response = self.session.get(f"{self.base_url}/contacts/{contact_id}")
                if response.status_code == 200:
                    contact = response.json()
                    self.log(f"✅ Retrieved individual contact: {contact['name']}")
                    assert contact['id'] == contact_id
                    assert contact['user_id'] == self.test_user_id
                else:
                    self.log(f"❌ Failed to get contact {contact_id}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception getting contact {contact_id}: {str(e)}", "ERROR")
                return False
        
        # Test UPDATE contact with new fields
        if created_contacts:
            contact_id = created_contacts[0]['id']
            update_data = {
                "academic_degree": "PhD in Computer Science from MIT",
                "hobbies": "Hiking, Photography, Cooking, Rock Climbing",
                "how_we_met": "Met at TechCrunch Disrupt 2023 - she was presenting her AI product",
                "notes": "Recently promoted to Senior PM! Working on revolutionary AI product launch"
            }
            try:
                response = self.session.put(f"{self.base_url}/contacts/{contact_id}", json=update_data)
                if response.status_code == 200:
                    updated_contact = response.json()
                    self.log(f"✅ Updated contact: {updated_contact['name']}")
                    assert updated_contact['academic_degree'] == update_data['academic_degree']
                    assert updated_contact['hobbies'] == update_data['hobbies']
                    assert updated_contact['how_we_met'] == update_data['how_we_met']
                    assert updated_contact['notes'] == update_data['notes']
                else:
                    self.log(f"❌ Failed to update contact {contact_id}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception updating contact {contact_id}: {str(e)}", "ERROR")
                return False
        
        return True
    
    def test_interaction_history(self):
        """Test NEW Interaction History system"""
        self.log("Testing NEW Interaction History system...")
        
        if not self.test_contacts:
            self.log("❌ No test contacts available for interaction testing", "ERROR")
            return False
        
        contact = self.test_contacts[0]
        contact_id = contact['id']
        
        # Test interaction types
        interaction_types = [
            "Personal Meeting",
            "Phone Call", 
            "Email",
            "WhatsApp",
            "Other"
        ]
        
        created_interactions = []
        
        # Create interactions of different types
        for i, interaction_type in enumerate(interaction_types):
            interaction_data = {
                "interaction_type": interaction_type,
                "date": (datetime.utcnow() - timedelta(days=i*2)).isoformat(),
                "notes": f"Test {interaction_type.lower()} interaction - discussed project updates and future plans"
            }
            
            try:
                response = self.session.post(f"{self.base_url}/contacts/{contact_id}/interactions", json=interaction_data)
                if response.status_code == 200:
                    interaction = response.json()
                    created_interactions.append(interaction)
                    self.log(f"✅ Created {interaction_type} interaction")
                    
                    # Verify interaction structure
                    assert 'id' in interaction
                    assert interaction['contact_id'] == contact_id
                    assert interaction['user_id'] == self.test_user_id
                    assert interaction['interaction_type'] == interaction_type
                    assert interaction['date'] == interaction_data['date']
                    assert interaction['notes'] == interaction_data['notes']
                    
                else:
                    self.log(f"❌ Failed to create {interaction_type} interaction: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception creating {interaction_type} interaction: {str(e)}", "ERROR")
                return False
        
        self.test_interactions = created_interactions
        
        # Test GET interactions (should be sorted by date descending)
        try:
            response = self.session.get(f"{self.base_url}/contacts/{contact_id}/interactions")
            if response.status_code == 200:
                interactions = response.json()
                self.log(f"✅ Retrieved {len(interactions)} interactions for contact")
                
                # Verify sorting (most recent first)
                if len(interactions) > 1:
                    for i in range(len(interactions) - 1):
                        current_date = datetime.fromisoformat(interactions[i]['date'].replace('Z', '+00:00'))
                        next_date = datetime.fromisoformat(interactions[i+1]['date'].replace('Z', '+00:00'))
                        assert current_date >= next_date, "Interactions should be sorted by date descending"
                    self.log("✅ Interactions correctly sorted by date descending")
                
                # Verify all interactions belong to the contact and user
                for interaction in interactions:
                    assert interaction['contact_id'] == contact_id
                    assert interaction['user_id'] == self.test_user_id
                
            else:
                self.log(f"❌ Failed to get interactions: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Exception getting interactions: {str(e)}", "ERROR")
            return False
        
        # Test that logging interaction updates contact's last_contact_date
        try:
            # Get contact before interaction
            response = self.session.get(f"{self.base_url}/contacts/{contact_id}")
            original_contact = response.json()
            original_last_contact = original_contact.get('last_contact_date')
            
            # Log new interaction
            new_interaction_data = {
                "interaction_type": "Personal Meeting",
                "date": datetime.utcnow().isoformat(),
                "notes": "Coffee meeting to discuss new opportunities"
            }
            
            response = self.session.post(f"{self.base_url}/contacts/{contact_id}/interactions", json=new_interaction_data)
            if response.status_code == 200:
                # Check if contact's last_contact_date was updated
                time.sleep(1)  # Brief delay for database update
                response = self.session.get(f"{self.base_url}/contacts/{contact_id}")
                updated_contact = response.json()
                new_last_contact = updated_contact.get('last_contact_date')
                
                if new_last_contact != original_last_contact:
                    self.log("✅ Contact's last_contact_date updated after logging interaction")
                else:
                    self.log("⚠️ Contact's last_contact_date may not have updated")
            
        except Exception as e:
            self.log(f"❌ Exception testing contact update: {str(e)}", "ERROR")
            return False
        
        # Test DELETE interaction
        if created_interactions:
            interaction_to_delete = created_interactions[0]
            interaction_id = interaction_to_delete['id']
            
            try:
                response = self.session.delete(f"{self.base_url}/interactions/{interaction_id}")
                if response.status_code == 200:
                    self.log(f"✅ Deleted interaction {interaction_id}")
                else:
                    self.log(f"❌ Failed to delete interaction: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception deleting interaction: {str(e)}", "ERROR")
                return False
        
        return True
    
    def test_groups_with_contact_count(self):
        """Test Groups with contact_count and user-scoping"""
        self.log("Testing Groups with contact_count...")
        
        # Create test groups
        test_groups_data = [
            {
                "name": "Work Colleagues",
                "description": "People I work with professionally",
                "color": "#3B82F6"
            },
            {
                "name": "Close Friends",
                "description": "My closest personal friends",
                "color": "#10B981"
            },
            {
                "name": "Tech Network",
                "description": "Technology industry contacts",
                "color": "#8B5CF6"
            }
        ]
        
        created_groups = []
        for group_data in test_groups_data:
            try:
                response = self.session.post(f"{self.base_url}/groups", json=group_data)
                if response.status_code == 200:
                    group = response.json()
                    created_groups.append(group)
                    self.log(f"✅ Created group: {group['name']} (ID: {group['id']})")
                    
                    # Verify group structure
                    assert 'id' in group
                    assert 'user_id' in group
                    assert group['user_id'] == self.test_user_id
                    assert group['name'] == group_data['name']
                    assert group['description'] == group_data['description']
                    assert group['color'] == group_data['color']
                    
                else:
                    self.log(f"❌ Failed to create group {group_data['name']}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception creating group {group_data['name']}: {str(e)}", "ERROR")
                return False
        
        self.test_groups = created_groups
        
        # Test GET all groups (should include contact_count)
        try:
            response = self.session.get(f"{self.base_url}/groups")
            if response.status_code == 200:
                groups = response.json()
                self.log(f"✅ Retrieved {len(groups)} user-scoped groups")
                
                # Verify all groups belong to current user and have contact_count
                for group in groups:
                    assert group['user_id'] == self.test_user_id
                    assert 'contact_count' in group
                    self.log(f"Group '{group['name']}' has {group['contact_count']} contacts")
                
            else:
                self.log(f"❌ Failed to get groups: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Exception getting groups: {str(e)}", "ERROR")
            return False
        
        # Test moving contact to groups
        if self.test_contacts and created_groups:
            contact_id = self.test_contacts[0]['id']
            group_ids = [created_groups[0]['id'], created_groups[1]['id']]
            
            move_data = {"group_ids": group_ids}
            
            try:
                response = self.session.post(f"{self.base_url}/contacts/{contact_id}/move-to-groups", json=move_data)
                if response.status_code == 200:
                    updated_contact = response.json()
                    self.log(f"✅ Moved contact to groups: {group_ids}")
                    assert updated_contact['groups'] == group_ids
                else:
                    self.log(f"❌ Failed to move contact to groups: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception moving contact to groups: {str(e)}", "ERROR")
                return False
        
        # Test GET individual group (should include contacts array)
        if created_groups:
            group_id = created_groups[0]['id']
            try:
                response = self.session.get(f"{self.base_url}/groups/{group_id}")
                if response.status_code == 200:
                    group = response.json()
                    self.log(f"✅ Retrieved individual group: {group['name']}")
                    assert 'contacts' in group
                    assert 'contact_count' in group
                    assert group['contact_count'] == len(group['contacts'])
                    self.log(f"Group has {group['contact_count']} contacts")
                else:
                    self.log(f"❌ Failed to get group {group_id}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception getting group {group_id}: {str(e)}", "ERROR")
                return False
        
        return True
    
    def test_enhanced_ai_drafts(self):
        """Test Enhanced AI Draft Generation with interaction history"""
        self.log("Testing Enhanced AI Draft Generation...")
        
        if not self.test_contacts:
            self.log("❌ No test contacts available for AI draft testing", "ERROR")
            return False
        
        contact = self.test_contacts[0]  # Should have interactions from previous test
        contact_id = contact['id']
        
        try:
            response = self.session.post(f"{self.base_url}/drafts/generate/{contact_id}")
            if response.status_code == 200:
                draft = response.json()
                self.log(f"✅ Generated enhanced AI draft for {contact['name']}")
                self.log(f"Draft message: {draft['draft_message']}")
                
                # Verify draft structure
                assert 'id' in draft
                assert 'user_id' in draft
                assert draft['user_id'] == self.test_user_id
                assert 'contact_id' in draft
                assert 'contact_name' in draft
                assert 'draft_message' in draft
                assert 'status' in draft
                assert draft['status'] == 'pending'
                assert draft['contact_id'] == contact_id
                assert draft['contact_name'] == contact['name']
                
                # Check if draft uses contact's example_message style
                if contact.get('example_message'):
                    self.log("✅ Contact has example_message for tone override")
                
                # Check if draft is personalized
                contact_first_name = contact['name'].split()[0]
                if contact_first_name in draft['draft_message']:
                    self.log("✅ Draft appears to be personalized with contact name")
                
                self.test_drafts.append(draft)
                return True
            else:
                self.log(f"❌ Failed to generate AI draft: {response.status_code} - {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Exception generating AI draft: {str(e)}", "ERROR")
            return False
    
    def test_draft_management(self):
        """Test Draft management operations"""
        self.log("Testing Draft management...")
        
        # Generate a draft first if we don't have any
        if not self.test_drafts and self.test_contacts:
            self.test_enhanced_ai_drafts()
        
        if not self.test_drafts:
            self.log("❌ No test drafts available for draft management testing", "ERROR")
            return False
        
        try:
            # Test GET all drafts (user-scoped)
            response = self.session.get(f"{self.base_url}/drafts")
            if response.status_code == 200:
                drafts = response.json()
                self.log(f"✅ Retrieved {len(drafts)} pending drafts")
                
                # Verify all drafts belong to current user
                for draft in drafts:
                    assert draft['user_id'] == self.test_user_id
                    assert draft['status'] == 'pending'
                
            else:
                self.log(f"❌ Failed to get drafts: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test dismiss draft
            draft_to_dismiss = self.test_drafts[0]
            draft_id = draft_to_dismiss['id']
            
            response = self.session.put(f"{self.base_url}/drafts/{draft_id}/dismiss")
            if response.status_code == 200:
                self.log(f"✅ Dismissed draft {draft_id}")
            else:
                self.log(f"❌ Failed to dismiss draft: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test mark draft as sent
            if len(self.test_drafts) > 1 or len(self.test_contacts) > 1:
                # Generate another draft if needed
                if len(self.test_drafts) == 1:
                    contact_id = self.test_contacts[1]['id'] if len(self.test_contacts) > 1 else self.test_contacts[0]['id']
                    response = self.session.post(f"{self.base_url}/drafts/generate/{contact_id}")
                    if response.status_code == 200:
                        new_draft = response.json()
                        self.test_drafts.append(new_draft)
                
                if len(self.test_drafts) > 1:
                    draft_to_send = self.test_drafts[1]
                    draft_id = draft_to_send['id']
                    contact_id = draft_to_send['contact_id']
                    
                    # Get original contact data
                    contact_response = self.session.get(f"{self.base_url}/contacts/{contact_id}")
                    if contact_response.status_code == 200:
                        original_contact = contact_response.json()
                        original_last_contact = original_contact.get('last_contact_date')
                        
                        # Mark draft as sent
                        response = self.session.put(f"{self.base_url}/drafts/{draft_id}/sent")
                        if response.status_code == 200:
                            self.log(f"✅ Marked draft {draft_id} as sent")
                            
                            # Verify contact's last_contact_date was updated
                            time.sleep(1)  # Brief delay for database update
                            updated_contact_response = self.session.get(f"{self.base_url}/contacts/{contact_id}")
                            if updated_contact_response.status_code == 200:
                                updated_contact = updated_contact_response.json()
                                new_last_contact = updated_contact.get('last_contact_date')
                                
                                if new_last_contact != original_last_contact:
                                    self.log("✅ Contact's last_contact_date updated after marking draft as sent")
                                else:
                                    self.log("⚠️ Contact's last_contact_date may not have updated")
                        else:
                            self.log(f"❌ Failed to mark draft as sent: {response.status_code} - {response.text}", "ERROR")
                            return False
            
            return True
            
        except Exception as e:
            self.log(f"❌ Exception in draft management test: {str(e)}", "ERROR")
            return False
    
    def test_pipeline_management(self):
        """Test Pipeline management"""
        self.log("Testing Pipeline management...")
        
        if not self.test_contacts:
            self.log("❌ No test contacts available for pipeline testing", "ERROR")
            return False
        
        contact = self.test_contacts[0]
        contact_id = contact['id']
        
        # Test moving through different pipeline stages
        pipeline_stages = ["Weekly", "Bi-Weekly", "Monthly", "Quarterly", "Annually"]
        
        for stage in pipeline_stages:
            try:
                move_data = {"pipeline_stage": stage}
                response = self.session.post(f"{self.base_url}/contacts/{contact_id}/move-pipeline", json=move_data)
                
                if response.status_code == 200:
                    updated_contact = response.json()
                    self.log(f"✅ Moved contact to {stage} pipeline")
                    
                    # Verify pipeline stage updated
                    assert updated_contact['pipeline_stage'] == stage
                    
                    # Verify target_interval_days is correct
                    expected_intervals = {
                        "Weekly": 7,
                        "Bi-Weekly": 14,
                        "Monthly": 30,
                        "Quarterly": 90,
                        "Annually": 365
                    }
                    assert updated_contact['target_interval_days'] == expected_intervals[stage]
                    
                else:
                    self.log(f"❌ Failed to move contact to {stage}: {response.status_code} - {response.text}", "ERROR")
                    return False
                    
            except Exception as e:
                self.log(f"❌ Exception moving contact to {stage}: {str(e)}", "ERROR")
                return False
        
        return True
    
    def test_morning_briefing(self):
        """Test Morning briefing endpoint (user-scoped)"""
        self.log("Testing Morning briefing endpoint...")
        
        try:
            response = self.session.get(f"{self.base_url}/morning-briefing")
            if response.status_code == 200:
                briefing_contacts = response.json()
                self.log(f"✅ Morning briefing returned {len(briefing_contacts)} contacts")
                
                # Verify all contacts belong to current user
                for contact in briefing_contacts:
                    assert contact['user_id'] == self.test_user_id
                
                return True
            else:
                self.log(f"❌ Failed to get morning briefing: {response.status_code} - {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Exception in morning briefing test: {str(e)}", "ERROR")
            return False
    
    def cleanup_test_data(self):
        """Clean up test data"""
        self.log("Cleaning up test data...")
        
        # Delete test contacts
        for contact in self.test_contacts:
            try:
                response = self.session.delete(f"{self.base_url}/contacts/{contact['id']}")
                if response.status_code == 200:
                    self.log(f"✅ Deleted test contact: {contact['name']}")
                else:
                    self.log(f"⚠️ Failed to delete contact {contact['name']}: {response.status_code}")
            except Exception as e:
                self.log(f"⚠️ Exception deleting contact {contact['name']}: {str(e)}")
        
        # Delete test groups
        for group in self.test_groups:
            try:
                response = self.session.delete(f"{self.base_url}/groups/{group['id']}")
                if response.status_code == 200:
                    self.log(f"✅ Deleted test group: {group['name']}")
                else:
                    self.log(f"⚠️ Failed to delete group {group['name']}: {response.status_code}")
            except Exception as e:
                self.log(f"⚠️ Exception deleting group {group['name']}: {str(e)}")
        
        # Delete test user from MongoDB
        try:
            if self.test_user_id:
                self.db.users.delete_one({"_id": ObjectId(self.test_user_id)})
                self.log(f"✅ Deleted test user from MongoDB")
        except Exception as e:
            self.log(f"⚠️ Exception deleting test user: {str(e)}")
        
        # Close MongoDB connection
        try:
            self.mongo_client.close()
            self.log("✅ Closed MongoDB connection")
        except Exception as e:
            self.log(f"⚠️ Exception closing MongoDB: {str(e)}")
    
    def run_all_tests(self):
        """Run all Phase 2 backend tests"""
        self.log("=" * 70)
        self.log("STARTING SYNCHROCONNECTR PHASE 2 BACKEND API TESTS")
        self.log("=" * 70)
        
        test_results = {}
        
        # Setup: Create test user and token
        if not self.create_test_user_and_token():
            self.log("❌ Failed to create test user. Stopping tests.", "ERROR")
            return {}
        
        # Test API Health
        test_results['api_health'] = self.test_api_health()
        
        if not test_results['api_health']:
            self.log("❌ API is not accessible. Stopping tests.", "ERROR")
            self.cleanup_test_data()
            return test_results
        
        # Run all tests
        test_results['profile_endpoints'] = self.test_profile_endpoints()
        test_results['contact_crud_new_schema'] = self.test_contact_crud_new_schema()
        test_results['interaction_history'] = self.test_interaction_history()
        test_results['groups_with_contact_count'] = self.test_groups_with_contact_count()
        test_results['enhanced_ai_drafts'] = self.test_enhanced_ai_drafts()
        test_results['draft_management'] = self.test_draft_management()
        test_results['pipeline_management'] = self.test_pipeline_management()
        test_results['morning_briefing'] = self.test_morning_briefing()
        
        # Cleanup
        self.cleanup_test_data()
        
        # Summary
        self.log("=" * 70)
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 70)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{test_name.replace('_', ' ').title()}: {status}")
            if result:
                passed += 1
        
        self.log("=" * 70)
        self.log(f"OVERALL: {passed}/{total} tests passed")
        
        if passed == total:
            self.log("🎉 ALL PHASE 2 TESTS PASSED!")
        else:
            self.log("⚠️ Some tests failed. Check logs above for details.")
        
        return test_results

if __name__ == "__main__":
    tester = SynchroConnectrPhase2Tester()
    results = tester.run_all_tests()
    
    # Exit with appropriate code
    all_passed = all(results.values()) if results else False
    sys.exit(0 if all_passed else 1)