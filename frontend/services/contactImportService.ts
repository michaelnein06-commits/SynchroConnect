import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert, Linking } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;       // ISO format YYYY-MM-DD
  birthdayRaw?: {          // Raw birthday object for debugging
    year?: number;
    month?: number;
    day?: number;
  };
  image?: any;
  imageBase64?: string;    // Base64 encoded image
  id?: string;
  note?: string;
  location?: string;       // Address/location
  addresses?: string[];    // All addresses
}

// Helper to format birthday from expo-contacts format
function formatBirthday(birthday?: { year?: number; month?: number; day?: number }): string {
  if (!birthday) return '';
  
  // expo-contacts uses 0-indexed months (January = 0)
  const year = birthday.year || 2000;  // Default year if not provided
  const month = (birthday.month !== undefined ? birthday.month : 0) + 1; // Convert to 1-indexed
  const day = birthday.day || 1;
  
  // Return ISO format YYYY-MM-DD
  const monthStr = month.toString().padStart(2, '0');
  const dayStr = day.toString().padStart(2, '0');
  
  return `${year}-${monthStr}-${dayStr}`;
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
    
    // ALL fields we want to fetch
    const ALL_FIELDS = [
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.LastName,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Emails,
      Contacts.Fields.Company,
      Contacts.Fields.JobTitle,
      Contacts.Fields.Birthday,
      Contacts.Fields.Image,
      Contacts.Fields.ImageAvailable,
      Contacts.Fields.RawImage,
      Contacts.Fields.ID,
      Contacts.Fields.Note,
      Contacts.Fields.Addresses,
    ];
    
    // Step 1: Get list of all contacts (may only have basic info)
    let basicContacts: Contacts.Contact[] = [];
    
    try {
      const result = await Contacts.getContactsAsync({
        fields: ALL_FIELDS,
        pageSize: 10000,
      });
      
      if (result && result.data) {
        basicContacts = result.data;
        console.log(`Got ${basicContacts.length} contacts from initial fetch`);
        
        // Check if we got full data by looking at first few contacts
        const sampleWithBirthday = basicContacts.slice(0, 20).filter(c => c.birthday);
        console.log(`Sample check: ${sampleWithBirthday.length}/20 have birthday in initial fetch`);
      }
    } catch (e) {
      console.log('Initial fetch failed:', e);
    }
    
    // Step 2: ALWAYS fetch each contact individually to get full data
    // This is the only reliable way to get Birthday, Image, Notes on iOS
    console.log('Fetching full details for each contact individually...');
    
    const fullContacts: Contacts.Contact[] = [];
    let fetchedCount = 0;
    let birthdayCount = 0;
    let imageCount = 0;
    
    for (const contact of basicContacts) {
      if (contact.id) {
        try {
          const fullContact = await Contacts.getContactByIdAsync(contact.id, ALL_FIELDS);
          
          if (fullContact) {
            fullContacts.push(fullContact);
            
            if (fullContact.birthday) {
              birthdayCount++;
              // Log first few birthdays for debugging
              if (birthdayCount <= 5) {
                console.log(`Birthday found: ${fullContact.name} - ${JSON.stringify(fullContact.birthday)}`);
              }
            }
            if (fullContact.image || fullContact.rawImage) {
              imageCount++;
            }
          } else {
            fullContacts.push(contact);
          }
        } catch (e) {
          fullContacts.push(contact);
        }
      } else {
        fullContacts.push(contact);
      }
      
      fetchedCount++;
      // Log progress every 50 contacts
      if (fetchedCount % 50 === 0) {
        console.log(`Fetched ${fetchedCount}/${basicContacts.length} contacts...`);
      }
    }
    
    console.log(`=== FETCH COMPLETE ===`);
    console.log(`Total contacts: ${fullContacts.length}`);
    console.log(`With birthdays: ${birthdayCount}`);
    console.log(`With images: ${imageCount}`);
    
    // Remove duplicates
    const uniqueContactsMap = new Map<string, Contacts.Contact>();
    for (const contact of fullContacts) {
      const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      
      if (contact.id && contactName) {
        uniqueContactsMap.set(contact.id, contact);
      } else if (contactName) {
        const key = contactName.toLowerCase();
        if (!uniqueContactsMap.has(key)) {
          uniqueContactsMap.set(key, contact);
        }
      }
    }
    
    const uniqueContacts = Array.from(uniqueContactsMap.values());
    console.log(`Unique contacts after deduplication: ${uniqueContacts.length}`);

    // Process contacts and convert to ImportedContact format
    const importedContacts: ImportedContact[] = [];
    let finalBirthdayCount = 0;
    let finalImageCount = 0;
    let finalNotesCount = 0;
    let finalAddressCount = 0;
    
    for (const contact of uniqueContacts) {
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name || name.length === 0) continue;
      
      // Extract address/location
      let location: string | undefined;
      let addresses: string[] = [];
      if (contact.addresses && contact.addresses.length > 0) {
        addresses = contact.addresses.map(addr => {
          const parts = [
            addr.street,
            addr.city,
            addr.region,
            addr.postalCode,
            addr.country
          ].filter(Boolean);
          return parts.join(', ');
        }).filter(a => a.length > 0);
        location = addresses[0];
        if (location) finalAddressCount++;
      }
      
      // Convert image to base64 if available
      let imageBase64: string | undefined;
      if (contact.image?.uri || contact.rawImage?.uri) {
        try {
          const imageUri = contact.image?.uri || contact.rawImage?.uri;
          if (imageUri) {
            const base64 = await FileSystem.readAsStringAsync(imageUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            imageBase64 = `data:image/jpeg;base64,${base64}`;
            finalImageCount++;
          }
        } catch (imgError) {
          // Silent fail
        }
      }
      
      // Parse birthday
      let birthdayFormatted: string | undefined;
      let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
      
      if (contact.birthday) {
        birthdayRaw = {
          year: contact.birthday.year,
          month: contact.birthday.month,
          day: contact.birthday.day
        };
        birthdayFormatted = formatBirthday(contact.birthday);
        if (birthdayFormatted) finalBirthdayCount++;
      }
      
      if (contact.note) finalNotesCount++;
      
      importedContacts.push({
        name: name || 'Unknown',
        phoneNumbers: contact.phoneNumbers?.map((p) => p.number || '').filter(n => n) || [],
        emails: contact.emails?.map((e) => e.email || '').filter(e => e) || [],
        company: contact.company,
        jobTitle: contact.jobTitle,
        birthday: birthdayFormatted,
        birthdayRaw,
        image: contact.image,
        imageBase64,
        id: contact.id,
        note: contact.note,
        location,
        addresses,
      });
    }

    console.log(`=== FINAL IMPORT STATS ===`);
    console.log(`Total imported: ${importedContacts.length}`);
    console.log(`With birthdays: ${finalBirthdayCount}`);
    console.log(`With images (base64): ${finalImageCount}`);
    console.log(`With notes: ${finalNotesCount}`);
    console.log(`With addresses: ${finalAddressCount}`);
    console.log(`==========================`);
    
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
    // Use base64 image if available, otherwise use URI (which might not work)
    profile_picture: importedContact.imageBase64 || importedContact.image?.uri || '',
    device_contact_id: importedContact.id || '',
    tags: [],
    groups: [],
    pipeline_stage: 'New',  // Imported contacts go to "New" stage
    language: 'English',
    tone: 'Casual',
    notes: importedContact.note || '',  // Use the note from iPhone if available
    location: importedContact.location || '',  // Use the address from iPhone
  };
}
