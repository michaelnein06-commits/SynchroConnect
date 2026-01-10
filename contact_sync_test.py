#!/usr/bin/env python3
"""
Backend API Test Suite for SynchroConnectr Contact Synchronization
Tests the device_contact_id field functionality for bidirectional sync
"""

import asyncio
import aiohttp
import json
from datetime import datetime
import sys
import os

# Use internal backend URL for testing
BACKEND_URL = "http://localhost:8001/api"

class ContactSyncTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.session = None
        self.auth_token = None
        self.test_contacts = []
        
    async def setup(self):
        """Initialize HTTP session"""
        self.session = aiohttp.ClientSession()
        
    async def cleanup(self):
        """Clean up resources and test data"""
        if self.session:
            # Clean up test contacts
            if self.auth_token:
                await self.delete_all_test_contacts()
            await self.session.close()
            
    async def authenticate(self):
        """Authenticate using test Google auth flow"""
        print("🔐 Authenticating with Google auth...")
        
        auth_data = {"session_id": "test"}
        
        try:
            async with self.session.post(
                f"{self.base_url}/auth/google",
                json=auth_data,
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    self.auth_token = data["access_token"]
                    print(f"✅ Authentication successful")
                    return True
                else:
                    error_text = await response.text()
                    print(f"❌ Authentication failed: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            return False
            
    def get_auth_headers(self):
        """Get authorization headers"""
        if not self.auth_token:
            raise Exception("Not authenticated")
        return {"Authorization": f"Bearer {self.auth_token}"}
        
    async def delete_all_test_contacts(self):
        """Delete all contacts for cleanup"""
        try:
            async with self.session.delete(
                f"{self.base_url}/contacts",
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"🧹 Cleaned up {data.get('deleted_count', 0)} contacts")
        except Exception as e:
            print(f"⚠️ Cleanup error: {str(e)}")
            
    async def test_contact_crud_with_device_id(self):
        """Test 1: Contact CRUD with device_contact_id field"""
        print("\n📱 Test 1: Contact CRUD with device_contact_id field")
        
        # Test 1a: Create contact WITH device_contact_id (simulating imported from device)
        print("  1a. Creating contact WITH device_contact_id...")
        contact_with_device = {
            "name": "John Smith",
            "phone": "+1234567890",
            "email": "john.smith@example.com",
            "device_contact_id": "device_123456",
            "pipeline_stage": "Monthly",
            "job": "Software Engineer",
            "location": "San Francisco"
        }
        
        try:
            async with self.session.post(
                f"{self.base_url}/contacts",
                json=contact_with_device,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    created_contact = await response.json()
                    contact_id_1 = created_contact["id"]
                    self.test_contacts.append(contact_id_1)
                    
                    if created_contact.get("device_contact_id") == "device_123456":
                        print("    ✅ Contact created with device_contact_id")
                    else:
                        print(f"    ❌ device_contact_id not saved correctly: {created_contact.get('device_contact_id')}")
                        return False
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to create contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error creating contact: {str(e)}")
            return False
            
        # Test 1b: Create contact WITHOUT device_contact_id (simulating app-created)
        print("  1b. Creating contact WITHOUT device_contact_id...")
        contact_without_device = {
            "name": "Jane Doe",
            "phone": "+0987654321",
            "email": "jane.doe@example.com",
            "pipeline_stage": "Weekly",
            "job": "Product Manager"
        }
        
        try:
            async with self.session.post(
                f"{self.base_url}/contacts",
                json=contact_without_device,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    created_contact = await response.json()
                    contact_id_2 = created_contact["id"]
                    self.test_contacts.append(contact_id_2)
                    
                    if created_contact.get("device_contact_id") is None:
                        print("    ✅ Contact created without device_contact_id")
                    else:
                        print(f"    ❌ Unexpected device_contact_id: {created_contact.get('device_contact_id')}")
                        return False
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to create contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error creating contact: {str(e)}")
            return False
            
        # Test 1c: Update contact to ADD device_contact_id (simulating linking)
        print("  1c. Updating contact to ADD device_contact_id...")
        update_data = {
            "device_contact_id": "device_789012"
        }
        
        try:
            async with self.session.put(
                f"{self.base_url}/contacts/{contact_id_2}",
                json=update_data,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    updated_contact = await response.json()
                    
                    if updated_contact.get("device_contact_id") == "device_789012":
                        print("    ✅ Contact updated with device_contact_id")
                    else:
                        print(f"    ❌ device_contact_id not updated correctly: {updated_contact.get('device_contact_id')}")
                        return False
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to update contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error updating contact: {str(e)}")
            return False
            
        # Test 1d: Verify device_contact_id persists on GET
        print("  1d. Verifying device_contact_id persists on GET...")
        
        try:
            async with self.session.get(
                f"{self.base_url}/contacts/{contact_id_1}",
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    contact = await response.json()
                    
                    if contact.get("device_contact_id") == "device_123456":
                        print("    ✅ device_contact_id persisted correctly")
                    else:
                        print(f"    ❌ device_contact_id not persisted: {contact.get('device_contact_id')}")
                        return False
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to get contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error getting contact: {str(e)}")
            return False
            
        return True
        
    async def test_contact_creation_for_sync(self):
        """Test 2: Contact Creation for Sync"""
        print("\n🔄 Test 2: Contact Creation for Sync")
        
        print("  2a. Creating contact with all sync-relevant fields...")
        sync_contact = {
            "name": "Michael Johnson",
            "phone": "+1555123456",
            "email": "michael.johnson@company.com",
            "device_contact_id": "sync_device_001",
            "pipeline_stage": "Bi-Weekly",
            "job": "Marketing Director",
            "location": "New York",
            "birthday": "1985-06-15",
            "hobbies": "Photography, Hiking",
            "how_we_met": "Conference networking event"
        }
        
        try:
            async with self.session.post(
                f"{self.base_url}/contacts",
                json=sync_contact,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    created_contact = await response.json()
                    contact_id = created_contact["id"]
                    self.test_contacts.append(contact_id)
                    
                    # Verify all fields are saved correctly
                    expected_fields = {
                        "name": "Michael Johnson",
                        "phone": "+1555123456", 
                        "email": "michael.johnson@company.com",
                        "device_contact_id": "sync_device_001",
                        "pipeline_stage": "Bi-Weekly",
                        "job": "Marketing Director",
                        "location": "New York",
                        "birthday": "1985-06-15",
                        "hobbies": "Photography, Hiking",
                        "how_we_met": "Conference networking event"
                    }
                    
                    all_correct = True
                    for field, expected_value in expected_fields.items():
                        actual_value = created_contact.get(field)
                        if actual_value != expected_value:
                            print(f"    ❌ Field {field}: expected '{expected_value}', got '{actual_value}'")
                            all_correct = False
                    
                    if all_correct:
                        print("    ✅ All sync fields saved correctly")
                    else:
                        return False
                        
                    # Test 2b: Verify contact can be retrieved with all fields
                    print("  2b. Verifying contact retrieval with all fields...")
                    
                    async with self.session.get(
                        f"{self.base_url}/contacts/{contact_id}",
                        headers=self.get_auth_headers()
                    ) as get_response:
                        if get_response.status == 200:
                            retrieved_contact = await get_response.json()
                            
                            # Check that device_contact_id and other sync fields are present
                            sync_fields_present = all([
                                retrieved_contact.get("device_contact_id") == "sync_device_001",
                                retrieved_contact.get("name") == "Michael Johnson",
                                retrieved_contact.get("phone") == "+1555123456",
                                retrieved_contact.get("email") == "michael.johnson@company.com"
                            ])
                            
                            if sync_fields_present:
                                print("    ✅ Contact retrieved with all sync fields")
                                return True
                            else:
                                print("    ❌ Some sync fields missing on retrieval")
                                return False
                        else:
                            error_text = await get_response.text()
                            print(f"    ❌ Failed to retrieve contact: {get_response.status} - {error_text}")
                            return False
                            
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to create sync contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error in sync contact creation: {str(e)}")
            return False
            
    async def test_contact_update_for_sync(self):
        """Test 3: Contact Update for Sync"""
        print("\n🔄 Test 3: Contact Update for Sync")
        
        # First create a contact to update
        print("  3a. Creating base contact for update tests...")
        base_contact = {
            "name": "Sarah Wilson",
            "phone": "+1444555666",
            "email": "sarah.wilson@email.com",
            "pipeline_stage": "Monthly"
        }
        
        try:
            async with self.session.post(
                f"{self.base_url}/contacts",
                json=base_contact,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    created_contact = await response.json()
                    contact_id = created_contact["id"]
                    self.test_contacts.append(contact_id)
                    print("    ✅ Base contact created")
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to create base contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error creating base contact: {str(e)}")
            return False
            
        # Test 3b: Update contact fields (phone, email, birthday, job)
        print("  3b. Updating contact fields...")
        update_data = {
            "phone": "+1999888777",
            "email": "sarah.wilson.updated@email.com", 
            "birthday": "1990-03-22",
            "job": "Data Scientist"
        }
        
        try:
            async with self.session.put(
                f"{self.base_url}/contacts/{contact_id}",
                json=update_data,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    updated_contact = await response.json()
                    
                    # Verify updates
                    updates_correct = all([
                        updated_contact.get("phone") == "+1999888777",
                        updated_contact.get("email") == "sarah.wilson.updated@email.com",
                        updated_contact.get("birthday") == "1990-03-22",
                        updated_contact.get("job") == "Data Scientist"
                    ])
                    
                    if updates_correct:
                        print("    ✅ Contact fields updated successfully")
                    else:
                        print("    ❌ Some fields not updated correctly")
                        return False
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to update contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error updating contact: {str(e)}")
            return False
            
        # Test 3c: Update contact to link it (add device_contact_id)
        print("  3c. Linking contact by adding device_contact_id...")
        link_data = {
            "device_contact_id": "linked_device_999"
        }
        
        try:
            async with self.session.put(
                f"{self.base_url}/contacts/{contact_id}",
                json=link_data,
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    linked_contact = await response.json()
                    
                    if linked_contact.get("device_contact_id") == "linked_device_999":
                        print("    ✅ Contact linked with device_contact_id")
                    else:
                        print(f"    ❌ Linking failed: {linked_contact.get('device_contact_id')}")
                        return False
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to link contact: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error linking contact: {str(e)}")
            return False
            
        # Test 3d: Verify updates persist
        print("  3d. Verifying updates persist...")
        
        try:
            async with self.session.get(
                f"{self.base_url}/contacts/{contact_id}",
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    final_contact = await response.json()
                    
                    # Check all updates persisted
                    persistence_check = all([
                        final_contact.get("phone") == "+1999888777",
                        final_contact.get("email") == "sarah.wilson.updated@email.com",
                        final_contact.get("birthday") == "1990-03-22", 
                        final_contact.get("job") == "Data Scientist",
                        final_contact.get("device_contact_id") == "linked_device_999"
                    ])
                    
                    if persistence_check:
                        print("    ✅ All updates persisted correctly")
                        return True
                    else:
                        print("    ❌ Some updates did not persist")
                        return False
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to verify persistence: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error verifying persistence: {str(e)}")
            return False
            
    async def test_contact_query_for_sync_matching(self):
        """Test 4: Contact Query for Sync Matching"""
        print("\n🔍 Test 4: Contact Query for Sync Matching")
        
        # Create test contacts with different combinations
        print("  4a. Creating test contacts with different field combinations...")
        
        test_contacts_data = [
            {
                "name": "Contact A - Has Phone & Device ID",
                "phone": "+1111111111",
                "device_contact_id": "device_A_001",
                "pipeline_stage": "Weekly"
            },
            {
                "name": "Contact B - Has Email, No Device ID", 
                "email": "contactb@example.com",
                "pipeline_stage": "Monthly"
            },
            {
                "name": "Contact C - Name Only, No Device ID",
                "pipeline_stage": "Quarterly"
            }
        ]
        
        created_contact_ids = []
        
        for i, contact_data in enumerate(test_contacts_data):
            try:
                async with self.session.post(
                    f"{self.base_url}/contacts",
                    json=contact_data,
                    headers=self.get_auth_headers()
                ) as response:
                    if response.status == 200:
                        created_contact = await response.json()
                        created_contact_ids.append(created_contact["id"])
                        self.test_contacts.append(created_contact["id"])
                        print(f"    ✅ Created test contact {i+1}")
                    else:
                        error_text = await response.text()
                        print(f"    ❌ Failed to create test contact {i+1}: {response.status} - {error_text}")
                        return False
            except Exception as e:
                print(f"    ❌ Error creating test contact {i+1}: {str(e)}")
                return False
                
        # Test 4b: GET all contacts and verify all fields are returned for sync matching
        print("  4b. Retrieving all contacts and verifying sync fields...")
        
        try:
            async with self.session.get(
                f"{self.base_url}/contacts",
                headers=self.get_auth_headers()
            ) as response:
                if response.status == 200:
                    all_contacts = await response.json()
                    
                    # Find our test contacts
                    test_contacts_found = [c for c in all_contacts if c["id"] in created_contact_ids]
                    
                    if len(test_contacts_found) != 3:
                        print(f"    ❌ Expected 3 test contacts, found {len(test_contacts_found)}")
                        return False
                        
                    # Verify Contact A has phone and device_contact_id
                    contact_a = next((c for c in test_contacts_found if "Contact A" in c["name"]), None)
                    if contact_a:
                        if (contact_a.get("phone") == "+1111111111" and 
                            contact_a.get("device_contact_id") == "device_A_001"):
                            print("    ✅ Contact A: phone and device_contact_id correct")
                        else:
                            print(f"    ❌ Contact A fields incorrect: phone={contact_a.get('phone')}, device_id={contact_a.get('device_contact_id')}")
                            return False
                    else:
                        print("    ❌ Contact A not found")
                        return False
                        
                    # Verify Contact B has email, no device_contact_id
                    contact_b = next((c for c in test_contacts_found if "Contact B" in c["name"]), None)
                    if contact_b:
                        if (contact_b.get("email") == "contactb@example.com" and 
                            contact_b.get("device_contact_id") is None):
                            print("    ✅ Contact B: email correct, no device_contact_id")
                        else:
                            print(f"    ❌ Contact B fields incorrect: email={contact_b.get('email')}, device_id={contact_b.get('device_contact_id')}")
                            return False
                    else:
                        print("    ❌ Contact B not found")
                        return False
                        
                    # Verify Contact C has name only, no device_contact_id
                    contact_c = next((c for c in test_contacts_found if "Contact C" in c["name"]), None)
                    if contact_c:
                        if (contact_c.get("device_contact_id") is None and
                            contact_c.get("phone") is None and
                            contact_c.get("email") is None):
                            print("    ✅ Contact C: name only, no device_contact_id")
                        else:
                            print(f"    ❌ Contact C has unexpected fields: phone={contact_c.get('phone')}, email={contact_c.get('email')}, device_id={contact_c.get('device_contact_id')}")
                            return False
                    else:
                        print("    ❌ Contact C not found")
                        return False
                        
                    print("    ✅ All contacts returned with correct sync fields for matching")
                    return True
                    
                else:
                    error_text = await response.text()
                    print(f"    ❌ Failed to get all contacts: {response.status} - {error_text}")
                    return False
        except Exception as e:
            print(f"    ❌ Error getting all contacts: {str(e)}")
            return False
            
    async def run_all_tests(self):
        """Run all contact synchronization tests"""
        print("🚀 Starting SynchroConnectr Contact Synchronization Tests")
        print(f"Backend URL: {self.base_url}")
        
        # Setup
        await self.setup()
        
        # Authenticate
        if not await self.authenticate():
            print("❌ Authentication failed - cannot proceed with tests")
            await self.cleanup()
            return False
            
        # Run tests
        test_results = []
        
        try:
            # Test 1: Contact CRUD with device_contact_id
            result1 = await self.test_contact_crud_with_device_id()
            test_results.append(("Contact CRUD with device_contact_id", result1))
            
            # Test 2: Contact Creation for Sync
            result2 = await self.test_contact_creation_for_sync()
            test_results.append(("Contact Creation for Sync", result2))
            
            # Test 3: Contact Update for Sync
            result3 = await self.test_contact_update_for_sync()
            test_results.append(("Contact Update for Sync", result3))
            
            # Test 4: Contact Query for Sync Matching
            result4 = await self.test_contact_query_for_sync_matching()
            test_results.append(("Contact Query for Sync Matching", result4))
            
        except Exception as e:
            print(f"❌ Unexpected error during testing: {str(e)}")
            test_results.append(("Unexpected Error", False))
            
        # Cleanup
        await self.cleanup()
        
        # Print results
        print("\n" + "="*60)
        print("📊 TEST RESULTS SUMMARY")
        print("="*60)
        
        all_passed = True
        for test_name, passed in test_results:
            status = "✅ PASS" if passed else "❌ FAIL"
            print(f"{status} - {test_name}")
            if not passed:
                all_passed = False
                
        print("="*60)
        if all_passed:
            print("🎉 ALL TESTS PASSED - Contact synchronization functionality working correctly!")
        else:
            print("⚠️ SOME TESTS FAILED - Contact synchronization needs attention")
            
        return all_passed

async def main():
    """Main test runner"""
    tester = ContactSyncTester()
    success = await tester.run_all_tests()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    asyncio.run(main())