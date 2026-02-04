import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system';
import { Platform, Alert, Linking } from 'react-native';

export interface ImportedContact {
  name: string;
  phoneNumbers?: string[];
  emails?: string[];
  company?: string;
  jobTitle?: string;
  birthday?: string;
  birthdayRaw?: {
    year?: number;
    month?: number;
    day?: number;
  };
  image?: any;
  imageBase64?: string;
  id?: string;
  note?: string;
  location?: string;
  addresses?: string[];
}

// Helper to format birthday - handles both string and number values
function formatBirthday(birthday?: { year?: number | string; month?: number | string; day?: number | string }): string {
  if (!birthday) return '';
  
  // Convert to numbers (expo-contacts can return strings or numbers)
  const year = typeof birthday.year === 'string' ? parseInt(birthday.year) : (birthday.year || 2000);
  // expo-contacts month is 0-indexed on iOS
  const monthRaw = typeof birthday.month === 'string' ? parseInt(birthday.month) : birthday.month;
  const month = monthRaw !== undefined ? monthRaw + 1 : 1; // Convert to 1-indexed
  const day = typeof birthday.day === 'string' ? parseInt(birthday.day) : (birthday.day || 1);
  
  if (isNaN(month) || isNaN(day)) return '';
  
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

export async function importPhoneContacts(): Promise<ImportedContact[]> {
  try {
    if (Platform.OS === 'web') {
      console.log('Contacts not available on web');
      return [];
    }

    console.log('=== CONTACT IMPORT START ===');
    
    // Request permission
    const { status } = await Contacts.getPermissionsAsync();
    console.log('Permission status:', status);
    
    if (status !== 'granted') {
      const { status: newStatus } = await Contacts.requestPermissionsAsync();
      if (newStatus !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlaube Zugriff auf Kontakte in den Einstellungen.');
        return [];
      }
    }

    // STEP 1: Get contact IDs and basic info
    console.log('Step 1: Getting contact list...');
    let contactIds: string[] = [];
    
    try {
      // Get contacts without specifying fields - this is the most compatible way
      const result = await Contacts.getContactsAsync({
        pageSize: 10000,
      });
      
      console.log('Got contacts:', result?.data?.length || 0);
      
      if (result?.data) {
        contactIds = result.data.filter(c => c.id).map(c => c.id!);
        console.log('Contact IDs collected:', contactIds.length);
      }
    } catch (e: any) {
      console.log('Error getting contact list:', e?.message);
      return [];
    }
    
    if (contactIds.length === 0) {
      console.log('No contacts found');
      return [];
    }

    // STEP 2: Fetch each contact individually with ALL fields
    // This is the same approach that works for WRITING contacts
    console.log('Step 2: Fetching full details for each contact...');
    
    const importedContacts: ImportedContact[] = [];
    let stats = { birthdays: 0, images: 0, notes: 0, addresses: 0 };

    for (let i = 0; i < contactIds.length; i++) {
      const contactId = contactIds[i];
      
      try {
        // Fetch complete contact data - same as what works for updating
        const contact = await Contacts.getContactByIdAsync(contactId, [
          Contacts.Fields.ID,
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Company,
          Contacts.Fields.JobTitle,
          Contacts.Fields.Birthday,
          Contacts.Fields.Image,
          Contacts.Fields.Note,
          Contacts.Fields.Addresses,
        ]);
        
        if (!contact) continue;
        
        const name = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
        if (!name) continue;

        // Birthday
        let birthdayFormatted: string | undefined;
        let birthdayRaw: { year?: number; month?: number; day?: number } | undefined;
        
        if (contact.birthday) {
          birthdayRaw = {
            year: contact.birthday.year,
            month: contact.birthday.month,
            day: contact.birthday.day,
          };
          birthdayFormatted = formatBirthday(contact.birthday);
          if (birthdayFormatted) {
            stats.birthdays++;
            if (stats.birthdays <= 3) {
              console.log(`Found birthday: ${name} -> ${birthdayFormatted} (raw: ${JSON.stringify(contact.birthday)})`);
            }
          }
        }

        // Addresses
        let location: string | undefined;
        let addressStrings: string[] = [];
        if (contact.addresses && contact.addresses.length > 0) {
          addressStrings = contact.addresses.map(addr => {
            const parts = [
              addr.street,
              addr.city, 
              addr.region,
              addr.postalCode,
              addr.country
            ].filter(Boolean);
            return parts.join(', ');
          }).filter(a => a.length > 0);
          
          location = addressStrings[0];
          if (location) stats.addresses++;
        }

        // Image to base64
        let imageBase64: string | undefined;
        if (contact.image?.uri) {
          try {
            const base64 = await FileSystem.readAsStringAsync(contact.image.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            imageBase64 = `data:image/jpeg;base64,${base64}`;
            stats.images++;
          } catch (e) {
            // Silent fail
          }
        }

        // Note
        if (contact.note) stats.notes++;

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
          addresses: addressStrings,
        });
        
      } catch (e) {
        // Skip this contact
      }
      
      // Progress log
      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${contactIds.length} (${stats.birthdays} birthdays)`);
      }
    }

    console.log('=== IMPORT COMPLETE ===');
    console.log('Total contacts:', importedContacts.length);
    console.log('With birthday:', stats.birthdays);
    console.log('With image:', stats.images);
    console.log('With note:', stats.notes);
    console.log('With address:', stats.addresses);

    return importedContacts;
  } catch (error: any) {
    console.error('Import error:', error?.message || error);
    throw error;
  }
}

    console.log('=== IMPORT COMPLETE ===');
    console.log('Total contacts:', importedContacts.length);
    console.log('With birthday:', stats.birthdays);
    console.log('With image:', stats.images);
    console.log('With note:', stats.notes);
    console.log('With address:', stats.addresses);

    // Show alert if no extended data
    if (stats.birthdays === 0 && stats.images === 0 && importedContacts.length > 5) {
      Alert.alert(
        'Eingeschränkter Zugriff erkannt',
        'Geburtstage und Bilder konnten nicht gelesen werden.\n\n' +
        'Lösung:\n' +
        '1. Gehe zu Einstellungen → Datenschutz → Kontakte\n' +
        '2. Deaktiviere den Zugriff für Expo Go\n' +
        '3. Aktiviere ihn wieder und wähle "Voller Zugriff"\n' +
        '4. Versuche den Import erneut',
        [
          { text: 'OK' },
          { text: 'Einstellungen', onPress: () => Linking.openSettings() },
        ]
      );
    }

    return importedContacts;
  } catch (error: any) {
    console.error('Import error:', error?.message || error);
    throw error;
  }
}

export function formatContactForCRM(importedContact: ImportedContact) {
  return {
    name: importedContact.name,
    job: importedContact.jobTitle || importedContact.company || '',
    phone: importedContact.phoneNumbers?.[0] || '',
    email: importedContact.emails?.[0] || '',
    birthday: importedContact.birthday || '',
    profile_picture: importedContact.imageBase64 || '',
    device_contact_id: importedContact.id || '',
    tags: [],
    groups: [],
    pipeline_stage: 'New',
    language: 'English',
    tone: 'Casual',
    notes: importedContact.note || '',
    location: importedContact.location || '',
  };
}
