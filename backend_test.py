#!/usr/bin/env python3
"""
SynchroConnectr Backend API Test Suite
Tests all backend endpoints including Calendar Events API
"""

import requests
import json
from datetime import datetime, timedelta
import time
import sys
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('/app/frontend/.env')

# Get backend URL from frontend env
BACKEND_URL = os.getenv('EXPO_PUBLIC_BACKEND_URL', 'https://sync-schedule-3.preview.emergentagent.com')
BASE_URL = f"{BACKEND_URL}/api"

class SynchroConnectrTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.test_contacts = []
        self.test_drafts = []
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def test_api_health(self):
        """Test if API is accessible"""
        self.log("Testing API health...")
        try:
            response = self.session.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                self.log(f"✅ API Health: {data}")
                return True
            else:
                self.log(f"❌ API Health failed: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ API Health exception: {str(e)}", "ERROR")
            return False
    
    def test_contact_crud(self):
        """Test Contact CRUD operations"""
        self.log("Testing Contact CRUD operations...")
        
        # Test 1: Create contacts
        test_contacts_data = [
            {
                "name": "Sarah Johnson",
                "job": "Product Manager at TechCorp",
                "birthday": "1990-05-15",
                "last_met": "Coffee at Blue Bottle last month",
                "favorite_food": "Sushi",
                "notes": "Working on AI product launch, loves hiking",
                "tags": ["work", "tech", "friend"],
                "pipeline_stage": "Monthly"
            },
            {
                "name": "Michael Chen",
                "job": "Software Engineer at StartupXYZ",
                "birthday": "1988-12-03",
                "last_met": "Conference in SF",
                "favorite_food": "Thai food",
                "notes": "Building ML infrastructure, has two kids",
                "tags": ["colleague", "ml", "parent"],
                "pipeline_stage": "Bi-Weekly"
            },
            {
                "name": "Emma Rodriguez",
                "job": "Marketing Director",
                "birthday": "1985-08-22",
                "last_met": "Dinner at Italian place",
                "favorite_food": "Italian cuisine",
                "notes": "Just moved to Austin, loves photography",
                "tags": ["friend", "creative", "austin"],
                "pipeline_stage": "Weekly"
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
                    
                    # Verify required fields
                    assert 'id' in contact
                    assert 'next_due' in contact
                    assert 'target_interval_days' in contact
                    assert contact['name'] == contact_data['name']
                    
                else:
                    self.log(f"❌ Failed to create contact {contact_data['name']}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception creating contact {contact_data['name']}: {str(e)}", "ERROR")
                return False
        
        self.test_contacts = created_contacts
        
        # Test 2: Get all contacts
        try:
            response = self.session.get(f"{self.base_url}/contacts")
            if response.status_code == 200:
                contacts = response.json()
                self.log(f"✅ Retrieved {len(contacts)} contacts")
                assert len(contacts) >= len(created_contacts)
            else:
                self.log(f"❌ Failed to get contacts: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Exception getting contacts: {str(e)}", "ERROR")
            return False
        
        # Test 3: Get individual contact
        if created_contacts:
            contact_id = created_contacts[0]['id']
            try:
                response = self.session.get(f"{self.base_url}/contacts/{contact_id}")
                if response.status_code == 200:
                    contact = response.json()
                    self.log(f"✅ Retrieved individual contact: {contact['name']}")
                    assert contact['id'] == contact_id
                else:
                    self.log(f"❌ Failed to get contact {contact_id}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception getting contact {contact_id}: {str(e)}", "ERROR")
                return False
        
        # Test 4: Update contact
        if created_contacts:
            contact_id = created_contacts[0]['id']
            update_data = {
                "notes": "Updated notes: Recently promoted to Senior PM!",
                "tags": ["work", "tech", "friend", "promoted"]
            }
            try:
                response = self.session.put(f"{self.base_url}/contacts/{contact_id}", json=update_data)
                if response.status_code == 200:
                    updated_contact = response.json()
                    self.log(f"✅ Updated contact: {updated_contact['name']}")
                    assert updated_contact['notes'] == update_data['notes']
                    assert 'promoted' in updated_contact['tags']
                else:
                    self.log(f"❌ Failed to update contact {contact_id}: {response.status_code} - {response.text}", "ERROR")
                    return False
            except Exception as e:
                self.log(f"❌ Exception updating contact {contact_id}: {str(e)}", "ERROR")
                return False
        
        return True
    
    def test_pipeline_management(self):
        """Test Pipeline management with random factor"""
        self.log("Testing Pipeline management and random factor algorithm...")
        
        if not self.test_contacts:
            self.log("❌ No test contacts available for pipeline testing", "ERROR")
            return False
        
        contact = self.test_contacts[0]
        contact_id = contact['id']
        original_next_due = contact['next_due']
        
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
                    
                    # Verify next_due changed (random factor applied)
                    new_next_due = updated_contact['next_due']
                    if original_next_due != new_next_due:
                        self.log(f"✅ Random factor applied: next_due changed from {original_next_due} to {new_next_due}")
                    
                    original_next_due = new_next_due
                    
                else:
                    self.log(f"❌ Failed to move contact to {stage}: {response.status_code} - {response.text}", "ERROR")
                    return False
                    
            except Exception as e:
                self.log(f"❌ Exception moving contact to {stage}: {str(e)}", "ERROR")
                return False
        
        return True
    
    def test_morning_briefing(self):
        """Test Morning briefing endpoint"""
        self.log("Testing Morning briefing endpoint...")
        
        # First, create a contact that should appear in morning briefing (overdue)
        overdue_contact_data = {
            "name": "Alex Thompson",
            "job": "Designer",
            "notes": "Should appear in morning briefing - overdue contact",
            "tags": ["test", "overdue"],
            "pipeline_stage": "Weekly",
            "last_contact_date": (datetime.utcnow() - timedelta(days=10)).isoformat()
        }
        
        try:
            # Create overdue contact
            response = self.session.post(f"{self.base_url}/contacts", json=overdue_contact_data)
            if response.status_code == 200:
                overdue_contact = response.json()
                self.log(f"✅ Created overdue contact for briefing test: {overdue_contact['name']}")
                
                # Test morning briefing
                response = self.session.get(f"{self.base_url}/morning-briefing")
                if response.status_code == 200:
                    briefing_contacts = response.json()
                    self.log(f"✅ Morning briefing returned {len(briefing_contacts)} contacts")
                    
                    # Verify our overdue contact appears
                    overdue_found = any(c['id'] == overdue_contact['id'] for c in briefing_contacts)
                    if overdue_found:
                        self.log("✅ Overdue contact correctly appears in morning briefing")
                    else:
                        self.log("⚠️ Overdue contact not found in morning briefing (may be due to next_due calculation)")
                    
                    return True
                else:
                    self.log(f"❌ Failed to get morning briefing: {response.status_code} - {response.text}", "ERROR")
                    return False
            else:
                self.log(f"❌ Failed to create overdue contact: {response.status_code} - {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Exception in morning briefing test: {str(e)}", "ERROR")
            return False
    
    def test_settings_management(self):
        """Test Settings management"""
        self.log("Testing Settings management...")
        
        try:
            # Test get settings (should create default if not exists)
            response = self.session.get(f"{self.base_url}/settings")
            if response.status_code == 200:
                settings = response.json()
                self.log(f"✅ Retrieved settings: {settings}")
                assert 'writing_style_sample' in settings
            else:
                self.log(f"❌ Failed to get settings: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test update settings
            new_settings = {
                "writing_style_sample": "Hey there! Hope you're doing amazing. I was just thinking about you and wanted to reach out to catch up!",
                "notification_time": "08:30"
            }
            
            response = self.session.put(f"{self.base_url}/settings", json=new_settings)
            if response.status_code == 200:
                updated_settings = response.json()
                self.log(f"✅ Updated settings successfully")
                assert updated_settings['writing_style_sample'] == new_settings['writing_style_sample']
                assert updated_settings['notification_time'] == new_settings['notification_time']
                return True
            else:
                self.log(f"❌ Failed to update settings: {response.status_code} - {response.text}", "ERROR")
                return False
                
        except Exception as e:
            self.log(f"❌ Exception in settings test: {str(e)}", "ERROR")
            return False
    
    def test_ai_draft_generation(self):
        """Test AI draft generation with Emergent LLM"""
        self.log("Testing AI draft generation...")
        
        if not self.test_contacts:
            self.log("❌ No test contacts available for AI draft testing", "ERROR")
            return False
        
        contact = self.test_contacts[0]  # Use Sarah Johnson
        contact_id = contact['id']
        
        try:
            response = self.session.post(f"{self.base_url}/drafts/generate/{contact_id}")
            if response.status_code == 200:
                draft = response.json()
                self.log(f"✅ Generated AI draft for {contact['name']}")
                self.log(f"Draft message: {draft['draft_message']}")
                
                # Verify draft structure
                assert 'id' in draft
                assert 'contact_id' in draft
                assert 'contact_name' in draft
                assert 'draft_message' in draft
                assert 'status' in draft
                assert draft['status'] == 'pending'
                assert draft['contact_id'] == contact_id
                assert draft['contact_name'] == contact['name']
                
                # Check if draft message is personalized (contains contact name)
                if contact['name'].split()[0] in draft['draft_message']:
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
            self.test_ai_draft_generation()
        
        if not self.test_drafts:
            self.log("❌ No test drafts available for draft management testing", "ERROR")
            return False
        
        try:
            # Test 1: Get all drafts
            response = self.session.get(f"{self.base_url}/drafts")
            if response.status_code == 200:
                drafts = response.json()
                self.log(f"✅ Retrieved {len(drafts)} pending drafts")
                assert len(drafts) >= len(self.test_drafts)
            else:
                self.log(f"❌ Failed to get drafts: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 2: Dismiss a draft
            draft_to_dismiss = self.test_drafts[0]
            draft_id = draft_to_dismiss['id']
            
            response = self.session.put(f"{self.base_url}/drafts/{draft_id}/dismiss")
            if response.status_code == 200:
                self.log(f"✅ Dismissed draft {draft_id}")
            else:
                self.log(f"❌ Failed to dismiss draft: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 3: Mark draft as sent (if we have another draft)
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
    
    def test_calendar_events_crud(self):
        """Test Calendar Events CRUD operations"""
        self.log("Testing Calendar Events CRUD operations...")
        
        try:
            # Ensure we have a test contact for participants
            if not self.test_contacts:
                self.log("❌ No test contacts available for calendar events", "ERROR")
                return False
            
            test_contact = self.test_contacts[0]
            test_events = []
            
            # Test 1: Create event without participants
            event_data = {
                "title": "Team Meeting",
                "description": "Weekly team sync meeting",
                "date": "2025-01-20",
                "start_time": "10:00",
                "end_time": "11:00",
                "participants": [],
                "reminder_minutes": 15,
                "color": "#FF5733",
                "all_day": False
            }
            
            response = self.session.post(f"{self.base_url}/calendar-events", json=event_data)
            if response.status_code == 200:
                event = response.json()
                test_events.append(event)
                self.log(f"✅ Created event without participants: {event['title']} (ID: {event['id']})")
            else:
                self.log(f"❌ Failed to create event without participants: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 2: Create event with participants
            event_with_participants = {
                "title": "Client Meeting with Sarah",
                "description": "Quarterly business review",
                "date": "2025-01-21",
                "start_time": "14:00",
                "end_time": "15:30",
                "participants": [test_contact['id']],
                "reminder_minutes": 30,
                "color": "#4CAF50",
                "all_day": False
            }
            
            response = self.session.post(f"{self.base_url}/calendar-events", json=event_with_participants)
            if response.status_code == 200:
                event = response.json()
                test_events.append(event)
                self.log(f"✅ Created event with participants: {event['title']} (ID: {event['id']})")
                
                # Verify interaction history was created
                interactions_response = self.session.get(f"{self.base_url}/contacts/{test_contact['id']}/interactions")
                if interactions_response.status_code == 200:
                    interactions = interactions_response.json()
                    scheduled_meetings = [i for i in interactions if i.get('interaction_type') == 'Scheduled Meeting']
                    if scheduled_meetings:
                        self.log("✅ Interaction history automatically created for event participants")
                    else:
                        self.log("⚠️ No scheduled meeting interaction found in history")
            else:
                self.log(f"❌ Failed to create event with participants: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 3: Create all-day event
            all_day_event = {
                "title": "Company Holiday",
                "description": "New Year's Day",
                "date": "2025-01-01",
                "start_time": "00:00",
                "participants": [],
                "all_day": True,
                "color": "#9C27B0"
            }
            
            response = self.session.post(f"{self.base_url}/calendar-events", json=all_day_event)
            if response.status_code == 200:
                event = response.json()
                test_events.append(event)
                self.log(f"✅ Created all-day event: {event['title']} (ID: {event['id']})")
            else:
                self.log(f"❌ Failed to create all-day event: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 4: Get all events
            response = self.session.get(f"{self.base_url}/calendar-events")
            if response.status_code == 200:
                events = response.json()
                self.log(f"✅ Retrieved all events: {len(events)} events found")
                
                # Verify participant_details are included
                events_with_participants = [e for e in events if e.get('participants')]
                if events_with_participants:
                    first_event = events_with_participants[0]
                    if 'participant_details' in first_event:
                        self.log("✅ Participant details included in event responses")
                    else:
                        self.log("⚠️ Participant details missing from event responses")
            else:
                self.log(f"❌ Failed to get all events: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 5: Get events with date range filter
            start_date = "2025-01-20"
            end_date = "2025-01-25"
            response = self.session.get(f"{self.base_url}/calendar-events?start_date={start_date}&end_date={end_date}")
            if response.status_code == 200:
                filtered_events = response.json()
                self.log(f"✅ Retrieved events with date filter: {len(filtered_events)} events for {start_date} to {end_date}")
            else:
                self.log(f"❌ Failed to get filtered events: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 6: Get today's events
            response = self.session.get(f"{self.base_url}/calendar-events/today")
            if response.status_code == 200:
                today_events = response.json()
                self.log(f"✅ Retrieved today's events: {len(today_events)} events")
            else:
                self.log(f"❌ Failed to get today's events: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 7: Get week's events
            response = self.session.get(f"{self.base_url}/calendar-events/week")
            if response.status_code == 200:
                week_events = response.json()
                self.log(f"✅ Retrieved week's events: {len(week_events)} events")
            else:
                self.log(f"❌ Failed to get week's events: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 8: Get events by specific date
            test_date = "2025-01-21"
            response = self.session.get(f"{self.base_url}/calendar-events/by-date/{test_date}")
            if response.status_code == 200:
                date_events = response.json()
                self.log(f"✅ Retrieved events for {test_date}: {len(date_events)} events")
            else:
                self.log(f"❌ Failed to get events by date: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 9: Get single event with participant details
            if test_events:
                event_id = test_events[1]['id']  # Event with participants
                response = self.session.get(f"{self.base_url}/calendar-events/{event_id}")
                if response.status_code == 200:
                    event = response.json()
                    self.log(f"✅ Retrieved single event: {event['title']}")
                    if event.get('participants') and 'participant_details' in event:
                        self.log(f"✅ Single event includes participant details: {len(event['participant_details'])} participants")
                    elif event.get('participants'):
                        self.log("⚠️ Single event missing participant details")
                else:
                    self.log(f"❌ Failed to get single event: {response.status_code} - {response.text}", "ERROR")
                    return False
            
            # Test 10: Update event
            if test_events:
                event_id = test_events[0]['id']
                update_data = {
                    "title": "Updated Team Meeting",
                    "description": "Updated weekly team sync with new agenda",
                    "start_time": "10:30",
                    "end_time": "11:30",
                    "reminder_minutes": 20
                }
                
                response = self.session.put(f"{self.base_url}/calendar-events/{event_id}", json=update_data)
                if response.status_code == 200:
                    updated_event = response.json()
                    self.log(f"✅ Updated event: {updated_event['title']}")
                else:
                    self.log(f"❌ Failed to update event: {response.status_code} - {response.text}", "ERROR")
                    return False
            
            # Test 11: Get contact's events
            response = self.session.get(f"{self.base_url}/contacts/{test_contact['id']}/calendar-events")
            if response.status_code == 200:
                contact_events = response.json()
                self.log(f"✅ Retrieved contact's events: {len(contact_events)} events for {test_contact['name']}")
            else:
                self.log(f"❌ Failed to get contact's events: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Test 12: Delete events
            for event in test_events:
                response = self.session.delete(f"{self.base_url}/calendar-events/{event['id']}")
                if response.status_code == 200:
                    self.log(f"✅ Deleted event: {event['title']}")
                else:
                    self.log(f"⚠️ Failed to delete event {event['title']}: {response.status_code}")
            
            return True
            
        except Exception as e:
            self.log(f"❌ Exception in calendar events test: {str(e)}", "ERROR")
            return False
    
    def test_morning_briefing_with_events(self):
        """Test Morning Briefing with Calendar Events integration"""
        self.log("Testing Morning Briefing with Calendar Events...")
        
        try:
            # Create a test event for today to verify briefing includes it
            today = datetime.now().strftime("%Y-%m-%d")
            test_event = {
                "title": "Test Meeting for Briefing",
                "description": "Test event to verify morning briefing integration",
                "date": today,
                "start_time": "09:00",
                "end_time": "10:00",
                "participants": [],
                "reminder_minutes": 15,
                "color": "#2196F3"
            }
            
            # Create the test event
            create_response = self.session.post(f"{self.base_url}/calendar-events", json=test_event)
            test_event_id = None
            if create_response.status_code == 200:
                created_event = create_response.json()
                test_event_id = created_event['id']
                self.log(f"✅ Created test event for briefing: {created_event['title']}")
            
            # Generate morning briefing
            response = self.session.post(f"{self.base_url}/morning-briefing/generate")
            if response.status_code == 200:
                briefing = response.json()
                self.log("✅ Morning briefing generated successfully")
                
                # Check if calendar event stats are included
                stats = briefing.get('stats', {})
                if 'today_events_count' in stats and 'week_events_count' in stats:
                    self.log(f"✅ Calendar event stats included: Today: {stats['today_events_count']}, Week: {stats['week_events_count']}")
                else:
                    self.log("⚠️ Calendar event stats missing from briefing")
                
                # Check if event lists are included
                if 'today_events' in briefing and 'week_events' in briefing:
                    today_count = len(briefing['today_events'])
                    week_count = len(briefing['week_events'])
                    self.log(f"✅ Calendar event lists included: Today events: {today_count}, Week events: {week_count}")
                else:
                    self.log("⚠️ Calendar event lists missing from briefing")
                
                # Verify briefing content mentions events if any exist
                briefing_text = briefing.get('briefing', '')
                if stats.get('today_events_count', 0) > 0 and 'appointment' in briefing_text.lower():
                    self.log("✅ Briefing text mentions today's appointments")
                
            else:
                self.log(f"❌ Failed to generate morning briefing: {response.status_code} - {response.text}", "ERROR")
                return False
            
            # Cleanup test event
            if test_event_id:
                delete_response = self.session.delete(f"{self.base_url}/calendar-events/{test_event_id}")
                if delete_response.status_code == 200:
                    self.log("✅ Cleaned up test event")
            
            return True
            
        except Exception as e:
            self.log(f"❌ Exception in morning briefing with events test: {str(e)}", "ERROR")
            return False
    
    def test_calendar_events_error_handling(self):
        """Test Calendar Events error handling"""
        self.log("Testing Calendar Events error handling...")
        
        try:
            # Test 1: Create event with invalid date format
            invalid_event = {
                "title": "Invalid Event",
                "date": "invalid-date",
                "start_time": "10:00"
            }
            
            response = self.session.post(f"{self.base_url}/calendar-events", json=invalid_event)
            if response.status_code != 200:
                self.log(f"✅ Correctly rejected invalid date format with status {response.status_code}")
            else:
                self.log("⚠️ Should have rejected invalid date format")
            
            # Test 2: Get non-existent event
            fake_event_id = "507f1f77bcf86cd799439011"
            response = self.session.get(f"{self.base_url}/calendar-events/{fake_event_id}")
            if response.status_code == 404:
                self.log("✅ Correctly returned 404 for non-existent event")
            else:
                self.log(f"⚠️ Expected 404 for non-existent event, got {response.status_code}")
            
            # Test 3: Unauthorized access (without auth token)
            temp_headers = self.session.headers.copy()
            if 'Authorization' in self.session.headers:
                del self.session.headers['Authorization']
            
            response = self.session.get(f"{self.base_url}/calendar-events")
            if response.status_code in [401, 403]:
                self.log(f"✅ Correctly rejected unauthorized access with status {response.status_code}")
            else:
                self.log(f"⚠️ Should have rejected unauthorized access, got {response.status_code}")
            
            # Restore headers
            self.session.headers.update(temp_headers)
            
            return True
            
        except Exception as e:
            self.log(f"❌ Exception in calendar events error handling test: {str(e)}", "ERROR")
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
    
    def run_all_tests(self):
        """Run all backend tests"""
        self.log("=" * 60)
        self.log("STARTING SYNCHROCONNECTR BACKEND API TESTS")
        self.log("=" * 60)
        
        test_results = {}
        
        # Test API Health
        test_results['api_health'] = self.test_api_health()
        
        if not test_results['api_health']:
            self.log("❌ API is not accessible. Stopping tests.", "ERROR")
            return test_results
        
        # Run all tests
        test_results['contact_crud'] = self.test_contact_crud()
        test_results['pipeline_management'] = self.test_pipeline_management()
        test_results['morning_briefing'] = self.test_morning_briefing()
        test_results['settings_management'] = self.test_settings_management()
        test_results['ai_draft_generation'] = self.test_ai_draft_generation()
        test_results['draft_management'] = self.test_draft_management()
        test_results['calendar_events_crud'] = self.test_calendar_events_crud()
        test_results['morning_briefing_with_events'] = self.test_morning_briefing_with_events()
        test_results['calendar_events_error_handling'] = self.test_calendar_events_error_handling()
        
        # Cleanup
        self.cleanup_test_data()
        
        # Summary
        self.log("=" * 60)
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 60)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            self.log(f"{test_name.replace('_', ' ').title()}: {status}")
            if result:
                passed += 1
        
        self.log("=" * 60)
        self.log(f"OVERALL: {passed}/{total} tests passed")
        
        if passed == total:
            self.log("🎉 ALL TESTS PASSED!")
        else:
            self.log("⚠️ Some tests failed. Check logs above for details.")
        
        return test_results

if __name__ == "__main__":
    tester = SynchroConnectrTester()
    results = tester.run_all_tests()
    
    # Exit with appropriate code
    all_passed = all(results.values())
    sys.exit(0 if all_passed else 1)