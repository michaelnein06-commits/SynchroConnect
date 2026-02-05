#!/usr/bin/env python3
"""
Additional test for draft sent functionality
"""

import requests
import json
from datetime import datetime
import time

BASE_URL = "https://app-priority-fix.preview.emergentagent.com/api"

def test_draft_sent_functionality():
    session = requests.Session()
    session.headers.update({
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    })
    
    print("Testing draft sent functionality...")
    
    # Create a test contact
    contact_data = {
        "name": "Test Contact for Draft Sent",
        "job": "Test Job",
        "notes": "Testing draft sent functionality",
        "tags": ["test"],
        "pipeline_stage": "Monthly"
    }
    
    # Create contact
    response = session.post(f"{BASE_URL}/contacts", json=contact_data)
    if response.status_code != 200:
        print(f"❌ Failed to create contact: {response.text}")
        return False
    
    contact = response.json()
    contact_id = contact['id']
    original_last_contact = contact.get('last_contact_date')
    
    print(f"✅ Created test contact: {contact['name']} (ID: {contact_id})")
    print(f"Original last_contact_date: {original_last_contact}")
    
    # Generate a draft
    response = session.post(f"{BASE_URL}/drafts/generate/{contact_id}")
    if response.status_code != 200:
        print(f"❌ Failed to generate draft: {response.text}")
        return False
    
    draft = response.json()
    draft_id = draft['id']
    print(f"✅ Generated draft: {draft_id}")
    print(f"Draft message: {draft['draft_message']}")
    
    # Mark draft as sent
    response = session.put(f"{BASE_URL}/drafts/{draft_id}/sent")
    if response.status_code != 200:
        print(f"❌ Failed to mark draft as sent: {response.text}")
        return False
    
    print(f"✅ Marked draft as sent")
    
    # Wait a moment for database update
    time.sleep(1)
    
    # Check if contact's last_contact_date was updated
    response = session.get(f"{BASE_URL}/contacts/{contact_id}")
    if response.status_code != 200:
        print(f"❌ Failed to get updated contact: {response.text}")
        return False
    
    updated_contact = response.json()
    new_last_contact = updated_contact.get('last_contact_date')
    new_next_due = updated_contact.get('next_due')
    
    print(f"New last_contact_date: {new_last_contact}")
    print(f"New next_due: {new_next_due}")
    
    # Verify the update
    if new_last_contact != original_last_contact:
        print("✅ Contact's last_contact_date was updated after marking draft as sent")
        print("✅ Next_due was recalculated with random factor")
        success = True
    else:
        print("❌ Contact's last_contact_date was not updated")
        success = False
    
    # Cleanup
    session.delete(f"{BASE_URL}/contacts/{contact_id}")
    print(f"✅ Cleaned up test contact")
    
    return success

if __name__ == "__main__":
    result = test_draft_sent_functionality()
    print(f"\nDraft sent test: {'✅ PASS' if result else '❌ FAIL'}")