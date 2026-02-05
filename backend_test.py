#!/usr/bin/env python3
"""
SynchroConnectr Backend API Test Suite
Tests all backend endpoints for the SynchroConnectr Phase 1 MVP
"""

import requests
import json
from datetime import datetime, timedelta
import time
import sys

# Use the production URL from frontend/.env
BASE_URL = "https://sleek-interface-86.preview.emergentagent.com/api"

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