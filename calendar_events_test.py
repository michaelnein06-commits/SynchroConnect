#!/usr/bin/env python3
"""
Calendar Events API Testing - Focused test for Calendar Events endpoints only
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

class CalendarEventsTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })
        self.auth_token = None
        self.test_contact_id = None
        
    def log(self, message, level="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {level}: {message}")
        
    def authenticate(self):
        """Create test JWT token for authentication"""
        self.log("Creating test JWT token...")
        try:
            import jwt
            from datetime import datetime, timedelta
            
            # Use the same JWT settings as the backend
            JWT_SECRET = "synchroconnectr_secret_key_2025_super_secure_random_string"
            JWT_ALGORITHM = "HS256"
            
            # Create test user data with valid ObjectId
            test_user_data = {
                "user_id": "507f1f77bcf86cd799439011",  # Valid ObjectId format
                "email": "test@example.com",
                "exp": datetime.utcnow() + timedelta(hours=24)
            }
            
            # Create token
            self.auth_token = jwt.encode(test_user_data, JWT_SECRET, algorithm=JWT_ALGORITHM)
            
            # Add auth header to session
            self.session.headers.update({
                'Authorization': f'Bearer {self.auth_token}'
            })
            self.log(f"✅ Test JWT token created: {self.auth_token[:20]}...")
            return True
                
        except Exception as e:
            self.log(f"❌ Authentication exception: {str(e)}", "ERROR")
            return False
            
    def create_test_contact(self):
        """Create a test contact for calendar events"""
        try:
            contact_data = {
                "name": "Sarah Johnson",
                "phone": "+1-555-0123",
                "email": "sarah.johnson@example.com",
                "job": "Marketing Director",
                "location": "San Francisco, CA",
                "pipeline_stage": "Monthly"
            }
            
            response = self.session.post(f"{self.base_url}/contacts", json=contact_data)
            if response.status_code == 200:
                contact = response.json()
                self.test_contact_id = contact['id']
                self.log(f"✅ Created test contact: {contact['name']} (ID: {self.test_contact_id})")
                return True
            else:
                self.log(f"❌ Failed to create test contact: {response.status_code} - {response.text}", "ERROR")
                return False
        except Exception as e:
            self.log(f"❌ Exception creating test contact: {str(e)}", "ERROR")
            return False
            
    def run_calendar_tests(self):
        """Run comprehensive Calendar Events API tests"""
        self.log("🚀 Starting Calendar Events API Testing...")
        self.log("=" * 60)
        
        test_results = []
        
        # Test 1: Create event without participants
        try:
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
                test_results.append(("✅", "Create Event (No Participants)", f"Event ID: {event['id']}"))
                event_id_1 = event['id']
            else:
                test_results.append(("❌", "Create Event (No Participants)", f"Status {response.status_code}: {response.text}"))
                return test_results
        except Exception as e:
            test_results.append(("❌", "Create Event (No Participants)", f"Exception: {str(e)}"))
            return test_results
            
        # Test 2: Create event with participants
        try:
            event_with_participants = {
                "title": "Client Meeting with Sarah",
                "description": "Quarterly business review",
                "date": "2025-01-21",
                "start_time": "14:00",
                "end_time": "15:30",
                "participants": [self.test_contact_id],
                "reminder_minutes": 30,
                "color": "#4CAF50",
                "all_day": False
            }
            
            response = self.session.post(f"{self.base_url}/calendar-events", json=event_with_participants)
            if response.status_code == 200:
                event = response.json()
                test_results.append(("✅", "Create Event (With Participants)", f"Event ID: {event['id']}"))
                event_id_2 = event['id']
                
                # Verify interaction history was created
                interactions_response = self.session.get(f"{self.base_url}/contacts/{self.test_contact_id}/interactions")
                if interactions_response.status_code == 200:
                    interactions = interactions_response.json()
                    scheduled_meetings = [i for i in interactions if i.get('interaction_type') == 'Scheduled Meeting']
                    if scheduled_meetings:
                        test_results.append(("✅", "Auto-Create Interaction History", f"Found {len(scheduled_meetings)} scheduled meeting(s)"))
                    else:
                        test_results.append(("⚠️", "Auto-Create Interaction History", "No scheduled meeting interactions found"))
            else:
                test_results.append(("❌", "Create Event (With Participants)", f"Status {response.status_code}: {response.text}"))
                return test_results
        except Exception as e:
            test_results.append(("❌", "Create Event (With Participants)", f"Exception: {str(e)}"))
            return test_results
            
        # Test 3: Get all events
        try:
            response = self.session.get(f"{self.base_url}/calendar-events")
            if response.status_code == 200:
                events = response.json()
                test_results.append(("✅", "Get All Events", f"Retrieved {len(events)} events"))
                
                # Verify participant_details are included
                events_with_participants = [e for e in events if e.get('participants')]
                if events_with_participants and 'participant_details' in events_with_participants[0]:
                    test_results.append(("✅", "Participant Details Included", "Found participant_details in events"))
                else:
                    test_results.append(("⚠️", "Participant Details Included", "participant_details missing from events"))
            else:
                test_results.append(("❌", "Get All Events", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Get All Events", f"Exception: {str(e)}"))
            
        # Test 4: Get events with date range filter
        try:
            start_date = "2025-01-20"
            end_date = "2025-01-25"
            response = self.session.get(f"{self.base_url}/calendar-events?start_date={start_date}&end_date={end_date}")
            if response.status_code == 200:
                filtered_events = response.json()
                test_results.append(("✅", "Get Events (Date Range)", f"Retrieved {len(filtered_events)} events for {start_date} to {end_date}"))
            else:
                test_results.append(("❌", "Get Events (Date Range)", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Get Events (Date Range)", f"Exception: {str(e)}"))
            
        # Test 5: Get today's events
        try:
            response = self.session.get(f"{self.base_url}/calendar-events/today")
            if response.status_code == 200:
                today_events = response.json()
                test_results.append(("✅", "Get Today's Events", f"Retrieved {len(today_events)} events for today"))
            else:
                test_results.append(("❌", "Get Today's Events", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Get Today's Events", f"Exception: {str(e)}"))
            
        # Test 6: Get week's events
        try:
            response = self.session.get(f"{self.base_url}/calendar-events/week")
            if response.status_code == 200:
                week_events = response.json()
                test_results.append(("✅", "Get Week's Events", f"Retrieved {len(week_events)} events for this week"))
            else:
                test_results.append(("❌", "Get Week's Events", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Get Week's Events", f"Exception: {str(e)}"))
            
        # Test 7: Get events by specific date
        try:
            test_date = "2025-01-21"
            response = self.session.get(f"{self.base_url}/calendar-events/by-date/{test_date}")
            if response.status_code == 200:
                date_events = response.json()
                test_results.append(("✅", "Get Events by Date", f"Retrieved {len(date_events)} events for {test_date}"))
            else:
                test_results.append(("❌", "Get Events by Date", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Get Events by Date", f"Exception: {str(e)}"))
            
        # Test 8: Get single event with participant details
        try:
            response = self.session.get(f"{self.base_url}/calendar-events/{event_id_2}")
            if response.status_code == 200:
                event = response.json()
                test_results.append(("✅", "Get Single Event", f"Retrieved event: {event['title']}"))
                
                if event.get('participants') and 'participant_details' in event:
                    test_results.append(("✅", "Single Event Participant Details", f"Found {len(event['participant_details'])} participant details"))
                elif event.get('participants'):
                    test_results.append(("⚠️", "Single Event Participant Details", "participant_details missing from single event"))
            else:
                test_results.append(("❌", "Get Single Event", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Get Single Event", f"Exception: {str(e)}"))
            
        # Test 9: Update event
        try:
            update_data = {
                "title": "Updated Team Meeting",
                "description": "Updated weekly team sync with new agenda",
                "start_time": "10:30",
                "end_time": "11:30",
                "reminder_minutes": 20
            }
            
            response = self.session.put(f"{self.base_url}/calendar-events/{event_id_1}", json=update_data)
            if response.status_code == 200:
                updated_event = response.json()
                test_results.append(("✅", "Update Event", f"Updated event: {updated_event['title']}"))
            else:
                test_results.append(("❌", "Update Event", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Update Event", f"Exception: {str(e)}"))
            
        # Test 10: Get contact's events
        try:
            response = self.session.get(f"{self.base_url}/contacts/{self.test_contact_id}/calendar-events")
            if response.status_code == 200:
                contact_events = response.json()
                test_results.append(("✅", "Get Contact Events", f"Retrieved {len(contact_events)} events for contact"))
            else:
                test_results.append(("❌", "Get Contact Events", f"Status {response.status_code}: {response.text}"))
        except Exception as e:
            test_results.append(("❌", "Get Contact Events", f"Exception: {str(e)}"))
            
        # Test 11: Morning briefing with events
        try:
            # Create a test event for today
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
            
            create_response = self.session.post(f"{self.base_url}/calendar-events", json=test_event)
            test_event_id = None
            if create_response.status_code == 200:
                created_event = create_response.json()
                test_event_id = created_event['id']
            
            # Generate morning briefing
            response = self.session.post(f"{self.base_url}/morning-briefing/generate")
            if response.status_code == 200:
                briefing = response.json()
                stats = briefing.get('stats', {})
                
                # Check if calendar event stats are included
                if 'today_events_count' in stats and 'week_events_count' in stats:
                    test_results.append(("✅", "Morning Briefing Event Stats", f"Today: {stats['today_events_count']}, Week: {stats['week_events_count']}"))
                else:
                    test_results.append(("⚠️", "Morning Briefing Event Stats", "Event stats missing from briefing"))
                    
                # Check if event lists are included
                if 'today_events' in briefing and 'week_events' in briefing:
                    today_count = len(briefing['today_events'])
                    week_count = len(briefing['week_events'])
                    test_results.append(("✅", "Morning Briefing Event Lists", f"Today events: {today_count}, Week events: {week_count}"))
                else:
                    test_results.append(("⚠️", "Morning Briefing Event Lists", "Event lists missing from briefing"))
            else:
                test_results.append(("❌", "Morning Briefing Generation", f"Status {response.status_code}: {response.text}"))
                
            # Cleanup test event
            if test_event_id:
                self.session.delete(f"{self.base_url}/calendar-events/{test_event_id}")
                
        except Exception as e:
            test_results.append(("❌", "Morning Briefing with Events", f"Exception: {str(e)}"))
            
        # Test 12: Delete events
        try:
            response = self.session.delete(f"{self.base_url}/calendar-events/{event_id_1}")
            if response.status_code == 200:
                test_results.append(("✅", "Delete Event 1", "Event deleted successfully"))
            else:
                test_results.append(("⚠️", "Delete Event 1", f"Status {response.status_code}"))
                
            response = self.session.delete(f"{self.base_url}/calendar-events/{event_id_2}")
            if response.status_code == 200:
                test_results.append(("✅", "Delete Event 2", "Event deleted successfully"))
            else:
                test_results.append(("⚠️", "Delete Event 2", f"Status {response.status_code}"))
        except Exception as e:
            test_results.append(("❌", "Delete Events", f"Exception: {str(e)}"))
            
        return test_results
        
    def cleanup(self):
        """Clean up test data"""
        if self.test_contact_id:
            try:
                response = self.session.delete(f"{self.base_url}/contacts/{self.test_contact_id}")
                if response.status_code == 200:
                    self.log("✅ Cleaned up test contact")
                else:
                    self.log(f"⚠️ Failed to cleanup test contact: {response.status_code}")
            except Exception as e:
                self.log(f"⚠️ Exception during cleanup: {str(e)}")
                
    def run_all_tests(self):
        """Run all calendar events tests"""
        self.log("🚀 Starting Calendar Events API Testing...")
        self.log(f"Backend URL: {self.base_url}")
        self.log("=" * 60)
        
        # Authenticate
        if not self.authenticate():
            self.log("❌ Authentication failed - cannot proceed with tests")
            return False
            
        # Create test contact
        if not self.create_test_contact():
            self.log("❌ Failed to create test contact - cannot proceed with tests")
            return False
            
        # Run tests
        test_results = self.run_calendar_tests()
        
        # Cleanup
        self.cleanup()
        
        # Print results
        self.log("\n" + "=" * 60)
        self.log("📊 CALENDAR EVENTS TEST RESULTS")
        self.log("=" * 60)
        
        passed = 0
        failed = 0
        
        for status, test_name, details in test_results:
            print(f"{status} {test_name}: {details}")
            if status == "✅":
                passed += 1
            elif status == "❌":
                failed += 1
                
        total = passed + failed
        self.log(f"\n📈 Results: {passed} passed, {failed} failed out of {total} tests")
        
        if failed == 0:
            self.log("🎉 ALL CALENDAR EVENTS TESTS PASSED!")
            return True
        else:
            self.log(f"⚠️  {failed} tests failed - see details above")
            return False

if __name__ == "__main__":
    tester = CalendarEventsTester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)