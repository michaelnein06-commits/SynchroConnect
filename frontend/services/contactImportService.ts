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

    console.log('Starting contact import with FULL field request...');
    
    // ALL fields we want to fetch - only valid fields
    const ALL_FIELDS = [
      Contacts.Fields.ID,
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.LastName,
      Contacts.Fields.MiddleName,
      Contacts.Fields.Nickname,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Emails,
      Contacts.Fields.Company,
      Contacts.Fields.JobTitle,
      Contacts.Fields.Birthday,
      Contacts.Fields.Image,
      Contacts.Fields.ImageAvailable,
      Contacts.Fields.Note,
      Contacts.Fields.Addresses,
      Contacts.Fields.UrlAddresses,
      Contacts.Fields.ContactType,
    ];
    
    // Step 1: Get all contacts with all fields
    let contacts: Contacts.Contact[] = [];
    
    try {
      console.log('Fetching all contacts with ALL fields...');
      const result = await Contacts.getContactsAsync({
        fields: ALL_FIELDS,
        pageSize: 10000,
      });
      
      if (result && result.data) {
        contacts = result.data;
        console.log(`Initial fetch: ${contacts.length} contacts`);
        
        // Debug: Check what fields we got
        if (contacts.length > 0) {
          const sample = contacts[0];
          console.log('Sample contact fields:', Object.keys(sample).filter(k => (sample as any)[k] !== undefined));
          
          // Check for birthdays in first 20
          const withBirthday = contacts.slice(0, 50).filter(c => c.birthday);
          console.log(`First 50 contacts: ${withBirthday.length} have birthday field`);
          
          if (withBirthday.length > 0) {
            console.log('Sample birthday:', JSON.stringify(withBirthday[0].birthday));
          }
        }
      }
    } catch (e) {
      console.log('Initial fetch error:', e);
    }
    
    // Step 2: If no birthdays found in bulk fetch, try individual fetch
    const bulkBirthdayCount = contacts.filter(c => c.birthday).length;
    console.log(`Bulk fetch found ${bulkBirthdayCount} contacts with birthdays`);
    
    if (bulkBirthdayCount === 0 && contacts.length > 0) {
      console.log('No birthdays in bulk fetch - trying individual contact fetch...');
      
      const enrichedContacts: Contacts.Contact[] = [];
      let individualBirthdayCount = 0;
      
      // Fetch each contact individually (this is slower but more reliable)
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        
        if (contact.id) {
          try {
            const fullContact = await Contacts.getContactByIdAsync(contact.id, ALL_FIELDS);
            
            if (fullContact) {
              enrichedContacts.push(fullContact);
              if (fullContact.birthday) {
                individualBirthdayCount++;
                if (individualBirthdayCount <= 3) {
                  console.log(`Found birthday for ${fullContact.name}: ${JSON.stringify(fullContact.birthday)}`);
                }
              }
            } else {
              enrichedContacts.push(contact);
            }
          } catch (e) {
            enrichedContacts.push(contact);
          }
        } else {
          enrichedContacts.push(contact);
        }
        
        // Progress log every 100 contacts
        if ((i + 1) % 100 === 0) {
          console.log(`Progress: ${i + 1}/${contacts.length} (${individualBirthdayCount} birthdays found so far)`);
        }
      }
      
      contacts = enrichedContacts;
      console.log(`Individual fetch complete: ${individualBirthdayCount} birthdays found`);
      
      // If still no birthdays, show alert to user about permissions
      if (individualBirthdayCount === 0) {
        console.log('WARNING: No birthdays found even with individual fetch!');
        console.log('This usually means iOS Limited Contacts Access is enabled.');
        console.log('User should go to Settings > Privacy > Contacts > [App Name] > Full Access');
      }
    }
    
    // Remove duplicates
    const uniqueContactsMap = new Map<string, Contacts.Contact>();
    for (const contact of contacts) {
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
    console.log(`Unique contacts: ${uniqueContacts.length}`);

    // Process contacts
    const importedContacts: ImportedContact[] = [];
    let finalStats = { birthdays: 0, images: 0, notes: 0, addresses: 0 };
    
    for (const contact of uniqueContacts) {
      const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!name || name.length === 0) continue;
      
      // Extract address
      let location: string | undefined;
      let addresses: string[] = [];
      if (contact.addresses && contact.addresses.length > 0) {
        addresses = contact.addresses.map(addr => {
          const parts = [addr.street, addr.city, addr.region, addr.postalCode, addr.country].filter(Boolean);
          return parts.join(', ');
        }).filter(a => a.length > 0);
        location = addresses[0];
        if (location) finalStats.addresses++;
      }
      
      // Convert image to base64
      let imageBase64: string | undefined;
      const imageUri = contact.image?.uri || contact.rawImage?.uri;
      if (imageUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(imageUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBase64 = `data:image/jpeg;base64,${base64}`;
          finalStats.images++;
        } catch (e) {
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
        if (birthdayFormatted) finalStats.birthdays++;
      }
      
      // Also check 'dates' field for birthday (some contacts store it there)
      if (!birthdayFormatted && contact.dates && contact.dates.length > 0) {
        const birthdayDate = contact.dates.find((d: any) => 
          d.label?.toLowerCase().includes('birthday') || 
          d.label?.toLowerCase().includes('geburtstag')
        );
        if (birthdayDate) {
          birthdayRaw = {
            year: birthdayDate.year,
            month: birthdayDate.month,
            day: birthdayDate.day
          };
          birthdayFormatted = formatBirthday(birthdayDate as any);
          if (birthdayFormatted) finalStats.birthdays++;
          console.log(`Found birthday in dates field for ${name}: ${birthdayFormatted}`);
        }
      }
      
      if (contact.note) finalStats.notes++;
      
      importedContacts.push({
        name,
        phoneNumbers: contact.phoneNumbers?.map(p => p.number || '').filter(Boolean) || [],
        emails: contact.emails?.map(e => e.email || '').filter(Boolean) || [],
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

    console.log('=== FINAL IMPORT STATS ===');
    console.log(`Total: ${importedContacts.length}`);
    console.log(`Birthdays: ${finalStats.birthdays}`);
    console.log(`Images: ${finalStats.images}`);
    console.log(`Notes: ${finalStats.notes}`);
    console.log(`Addresses: ${finalStats.addresses}`);
    console.log('==========================');
    
    // Show warning if no extended data found
    if (finalStats.birthdays === 0 && finalStats.images === 0 && finalStats.notes === 0 && importedContacts.length > 10) {
      Alert.alert(
        'Eingeschränkter Zugriff',
        'Es konnten keine Geburtstage, Bilder oder Notizen importiert werden.\n\nUm alle Daten zu importieren:\n\n1. Öffne Einstellungen\n2. Gehe zu Datenschutz & Sicherheit\n3. Tippe auf Kontakte\n4. Wähle "Voller Zugriff" für diese App',
        [
          { text: 'Später', style: 'cancel' },
          { text: 'Einstellungen öffnen', onPress: () => Linking.openSettings() },
        ]
      );
    }
    
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
