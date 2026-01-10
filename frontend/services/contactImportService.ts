import * as Contacts from 'expo-contacts';
import { Platform } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  image?: any;
  id?: string;
}

export async function requestContactsPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {
    console.error('Error requesting contacts permission:', error);
    return false;
  }
}

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    const hasPermission = await requestContactsPermission();
    
    if (!hasPermission) {
      throw new Error('Contacts permission not granted');
    }

    // Check platform - contacts not available on web
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    // Get ALL contacts from ALL containers
    // First, try to get all containers
    let allContacts: Contacts.Contact[] = [];
    
    try {
      // Get contacts from all containers (iCloud, local, Exchange, etc.)
      const containers = await Contacts.getContainersAsync({});
      console.log(`Found ${containers.length} contact containers`);
      
      for (const container of containers) {
        try {
          const containerContacts = await Contacts.getContactsAsync({
            containerId: container.id,
            fields: [
              Contacts.Fields.Name,
              Contacts.Fields.PhoneNumbers,
              Contacts.Fields.Emails,
              Contacts.Fields.Company,
              Contacts.Fields.JobTitle,
              Contacts.Fields.Birthday,
              Contacts.Fields.Image,
              Contacts.Fields.ID,
            ],
            pageSize: 10000,
            pageOffset: 0,
          });
          
          if (containerContacts && containerContacts.data) {
            console.log(`Container ${container.name || container.id}: ${containerContacts.data.length} contacts`);
            allContacts = [...allContacts, ...containerContacts.data];
          }
        } catch (containerError) {
          console.log(`Error reading container ${container.id}:`, containerError);
        }
      }
    } catch (containerError) {
      console.log('Container method not available, using default method');
    }
    
    // If no contacts from containers, try the default method
    if (allContacts.length === 0) {
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Birthday,
          Contacts.Fields.Image,
          Contacts.Fields.ID,
        ],
        pageSize: 10000,
        pageOffset: 0,
      });

      if (result && result.data) {
        console.log(`Default method: Total ${result.total}, Retrieved ${result.data.length}`);
        allContacts = result.data;
      }
    }

    // Remove duplicates by ID
    const uniqueContactsMap = new Map<string, Contacts.Contact>();
    for (const contact of allContacts) {
      if (contact.id && contact.name) {
        uniqueContactsMap.set(contact.id, contact);
      } else if (contact.name) {
        // For contacts without ID, use name as key
        const key = contact.name.toLowerCase();
        if (!uniqueContactsMap.has(key)) {
          uniqueContactsMap.set(key, contact);
        }
      }
    }
    
    const uniqueContacts = Array.from(uniqueContactsMap.values());
    console.log(`Total unique contacts: ${uniqueContacts.length}`);

    const importedContacts: ImportedContact[] = uniqueContacts
      .filter((contact) => contact.name) // Only contacts with names
      .map((contact) => ({
        name: contact.name || 'Unknown',
        phoneNumbers: contact.phoneNumbers?.map((p) => p.number || '') || [],
        emails: contact.emails?.map((e) => e.email || '') || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: contact.birthday ? new Date(contact.birthday.year || 2000, (contact.birthday.month || 1) - 1, contact.birthday.day || 1).toLocaleDateString() : undefined,
        image: contact.image,
        id: contact.id,
      }));

    console.log(`Imported ${importedContacts.length} contacts with full data`);
    return importedContacts;
  } catch (error) {
    console.error('Error importing contacts:', error);
    throw error;
  }
}

export function formatContactForCRM(importedContact: ImportedContact) {
  return {
    name: importedContact.name,
    job: importedContact.jobTitle || importedContact.company || '',
    phone: importedContact.phoneNumbers && importedContact.phoneNumbers.length > 0 ? importedContact.phoneNumbers[0] : '',
    email: importedContact.emails && importedContact.emails.length > 0 ? importedContact.emails[0] : '',
    birthday: importedContact.birthday || '',
    profile_picture: importedContact.image?.uri || '',
    device_contact_id: importedContact.id || '',
    tags: [],
    groups: [],
    pipeline_stage: 'New',  // NEW: Imported contacts go to "New" stage
    language: 'English',
    tone: 'Casual',
    notes: `Imported from phone contacts`,
  };
}
