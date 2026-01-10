import * as Contacts from 'expo-contacts';
import { Platform, Alert, Linking } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  image?: any;
  id?: string;
  note?: string;
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

/**
 * Check if we have full contact access or limited (iOS 18+)
 */
export async function checkContactAccessLevel(): Promise<'full' | 'limited' | 'denied'> {
  try {
    const { status } = await Contacts.getPermissionsAsync();
    
    if (status !== 'granted') {
      return 'denied';
    }
    
    // Try to get contacts to check if we have full access
    const result = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name],
      pageSize: 1000,
    });
    
    // If we get very few contacts compared to what user expects, it's likely limited
    return result.data.length > 0 ? 'full' : 'limited';
  } catch (error) {
    return 'denied';
  }
}

/**
 * Show alert to guide user to grant full contact access
 */
export function showFullAccessAlert() {
  Alert.alert(
    'Limited Contact Access',
    'You\'ve only granted access to some contacts. To import all your contacts:\n\n1. Go to Settings\n2. Find this app\n3. Tap "Contacts"\n4. Select "Full Access"',
    [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Open Settings', 
        onPress: () => Linking.openSettings() 
      },
    ]
  );
}

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    // Check platform - contacts not available on web
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    // Request permission first
    console.log('Requesting contacts permission...');
    const { status: existingStatus } = await Contacts.getPermissionsAsync();
    console.log('Current permission status:', existingStatus);
    
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      console.log('Requesting new permission...');
      const { status } = await Contacts.requestPermissionsAsync();
      finalStatus = status;
      console.log('New permission status:', finalStatus);
    }
    
    if (finalStatus !== 'granted') {
      // Show alert to user
      Alert.alert(
        'Permission Required',
        'Please grant contact access in Settings to import contacts.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      throw new Error('Contacts permission not granted');
    }

    console.log('Starting contact import...');
    
    let allContacts: Contacts.Contact[] = [];
    
    // Method 1: Simple direct fetch (most reliable)
    try {
      console.log('Fetching contacts directly...');
      const result = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Birthday,
          Contacts.Fields.Image,
          Contacts.Fields.ID,
          Contacts.Fields.Note,
        ],
        pageSize: 10000,
        pageOffset: 0,
      });
      
      console.log('Direct fetch result:', result ? `total=${result.total}, data=${result.data?.length}` : 'null');
      
      if (result && result.data && result.data.length > 0) {
        allContacts = result.data;
        console.log(`Direct method: Got ${allContacts.length} contacts`);
      }
    } catch (directError) {
      console.log('Direct fetch error:', directError);
    }
    
    // Method 2: Try containers if direct method failed
    if (allContacts.length === 0) {
      try {
        const containers = await Contacts.getContainersAsync({});
        console.log(`Found ${containers.length} contact containers`);
        
        if (containers.length > 0) {
          for (const container of containers) {
            try {
              const containerContacts = await Contacts.getContactsAsync({
                containerId: container.id,
                fields: [
                  Contacts.Fields.Name,
                  Contacts.Fields.FirstName,
                  Contacts.Fields.LastName,
                  Contacts.Fields.PhoneNumbers,
                  Contacts.Fields.Emails,
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
        }
      } catch (containerError) {
        console.log('Container method failed:', containerError);
      }
    }
    
    // Method 2: If container method didn't work or returned few contacts, try default method
    if (allContacts.length < 10) {
      console.log('Trying default contact fetch method...');
      
      try {
        const result = await Contacts.getContactsAsync({
          fields: [
            Contacts.Fields.Name,
            Contacts.Fields.FirstName,
            Contacts.Fields.LastName,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Emails,
            Contacts.Fields.Company,
            Contacts.Fields.JobTitle,
            Contacts.Fields.Birthday,
            Contacts.Fields.Image,
            Contacts.Fields.ID,
            Contacts.Fields.Note,
          ],
          pageSize: 10000,
          pageOffset: 0,
        });

        if (result && result.data && result.data.length > 0) {
          console.log(`Default method: Total available: ${result.total}, Retrieved: ${result.data.length}`);
          allContacts = result.data;
        } else {
          console.log('Default method returned no data, trying minimal fields...');
          // Try with minimal fields
          const minimalResult = await Contacts.getContactsAsync({
            fields: [
              Contacts.Fields.Name,
              Contacts.Fields.PhoneNumbers,
              Contacts.Fields.Emails,
            ],
            pageSize: 10000,
          });
          
          if (minimalResult && minimalResult.data && minimalResult.data.length > 0) {
            console.log(`Minimal method: Retrieved ${minimalResult.data.length} contacts`);
            allContacts = minimalResult.data;
          }
        }
      } catch (fetchError) {
        console.log('Error fetching contacts:', fetchError);
      }
    }

    // Log warning if we got very few contacts
    if (allContacts.length < 20) {
      console.log('WARNING: Only got ' + allContacts.length + ' contacts. User may have limited access enabled.');
    }

    // Remove duplicates by ID
    const uniqueContactsMap = new Map<string, Contacts.Contact>();
    for (const contact of allContacts) {
      const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      
      if (contact.id && contactName) {
        uniqueContactsMap.set(contact.id, contact);
      } else if (contactName) {
        // For contacts without ID, use name as key
        const key = contactName.toLowerCase();
        if (!uniqueContactsMap.has(key)) {
          uniqueContactsMap.set(key, contact);
        }
      }
    }
    
    const uniqueContacts = Array.from(uniqueContactsMap.values());
    console.log(`Total unique contacts after deduplication: ${uniqueContacts.length}`);

    const importedContacts: ImportedContact[] = uniqueContacts
      .filter((contact) => {
        const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
        return name.length > 0;
      })
      .map((contact) => {
        const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
        return {
          name: name || 'Unknown',
          phoneNumbers: contact.phoneNumbers?.map((p) => p.number || '').filter(n => n) || [],
          emails: contact.emails?.map((e) => e.email || '').filter(e => e) || [],
          company: contact.company,
          jobTitle: contact.jobTitle,
          birthday: contact.birthday ? 
            new Date(
              contact.birthday.year || 2000, 
              (contact.birthday.month || 1) - 1, 
              contact.birthday.day || 1
            ).toLocaleDateString() : undefined,
          image: contact.image,
          id: contact.id,
          note: contact.note,
        };
      });

    console.log(`Final imported contacts: ${importedContacts.length}`);
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
    pipeline_stage: 'New',  // Imported contacts go to "New" stage
    language: 'English',
    tone: 'Casual',
    notes: importedContact.note || '',  // Use the note from iPhone if available
  };
}
